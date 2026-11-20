import { ControllerConfig } from "../stream/gamepad"
import { MouseMode, MouseScrollMode, TouchMode } from "../stream/input"
import { getLanguageOptions, getTranslations, Language, normalizeLanguage } from "../i18n"
import { Component, ComponentEvent } from "./index"
import { el, icon } from "../icons"
import { SidebarEdge } from "./sidebar/index"
import { StreamPermissions } from "../api_bindings";
import { SharpeningMode } from "../stream/video/enhancer"

export type Settings = {
    sidebarEdge: SidebarEdge,
    hideSidebarButton: boolean,
    // Starlight Streams: measure the connection before each stream and pick resolution, fps and bitrate
    autoQuality: boolean
    bitrate: number
    videoSize: "720p" | "1080p" | "1440p" | "4k" | "native" | "custom"
    videoSizeCustom: {
        width: number
        height: number
    },
    fps: number
    videoCodec: StreamCodec,
    forceVideoElementRenderer: boolean
    canvasRenderer: boolean
    canvasVsync: boolean
    // Starlight Streams: picture sharpening (see stream/video/enhancer.ts)
    sharpening: SharpeningMode
    playAudioLocal: boolean
    microphone: boolean
    mouseScrollMode: MouseScrollMode
    mouseMode: MouseMode
    touchMode: TouchMode
    localCursorSensitivity: number
    controllerConfig: ControllerConfig
    dataTransport: TransportType
    language: Language
    enterFullscreenOnStreamStart: boolean
    toggleFullscreenWithKeybind: boolean
    hdr: boolean
    useSelectElementPolyfill: boolean
}

export type StreamCodec = "h264" | "auto" | "h265" | "av1"
export type TransportType = "auto" | "webrtc" | "websocket"

import DEFAULT_SETTINGS from "../default_settings"
import { DeviceCaps, getDeviceCaps } from "../stream/device_caps"

/// You should use the role default settings instead!
export function globalDefaultSettings(): Settings {
    // We are deep cloning this
    return deepClone(DEFAULT_SETTINGS)
}

function deepClone<T>(value: T): T {
    if (typeof structuredClone == "function") {
        return structuredClone(value)
    } else {
        return JSON.parse(JSON.stringify(value))
    }
}
function deepMerge(target: any, source: any) {
    for (const key in source) {
        const sourceVal = source[key]
        const targetVal = target[key]

        if (
            sourceVal &&
            typeof sourceVal === "object" &&
            !Array.isArray(sourceVal)
        ) {
            target[key] = deepMerge(
                targetVal && typeof targetVal === "object" ? targetVal : {},
                sourceVal
            )
        } else if (sourceVal !== undefined) {
            target[key] = sourceVal
        }
    }
    return target
}

export function getLocalStreamSettings(defaultSettings: Settings) {
    // Start with FULL global defaults
    let settings = globalDefaultSettings()

    // Fill/override with role defaults (even if partial)
    settings = deepMerge(settings, defaultSettings)

    try {
        const json = localStorage.getItem("mlSettings")
        if (json) {
            const loaded = JSON.parse(json)

            // Finally override with user settings
            settings = deepMerge(settings, loaded)
        }
    } catch (e) {
        localStorage.removeItem("mlSettings")
    }

    return settings
}
export function setLocalStreamSettings(settings?: Settings) {
    localStorage.setItem("mlSettings", JSON.stringify(settings))
}

// Starlight Streams: one click performance presets
// The fixed presets turn auto quality off, so the chosen quality is used
const PERFORMANCE_PRESETS: Array<{ name: "auto" | "weakNetwork" | "balanced" | "bestQuality", settings: Partial<Settings> }> = [
    { name: "auto", settings: { autoQuality: true } },
    { name: "weakNetwork", settings: { autoQuality: false, videoSize: "720p", fps: 60, bitrate: 6000, videoCodec: "h264" } },
    { name: "balanced", settings: { autoQuality: false, videoSize: "1080p", fps: 60, bitrate: 20000, videoCodec: "h264" } },
    { name: "bestQuality", settings: { autoQuality: false, videoSize: "native", fps: 60, bitrate: 40000, videoCodec: "auto" } },
]

export type StreamSettingsChangeListener = (event: ComponentEvent<StreamSettingsComponent>) => void

function makeSettingsValid(permissions: StreamPermissions, settings: Settings) {
    if (permissions.maximum_bitrate_kbps != null && permissions.maximum_bitrate_kbps < settings.bitrate) {
        settings.bitrate = permissions.maximum_bitrate_kbps
    }

    if (!permissions.allow_codec_av1 && settings.videoCodec == "av1") {
        settings.videoCodec = "h265"
    }
    if (!permissions.allow_codec_h265 && settings.videoCodec == "h265") {
        settings.videoCodec = "h264"
    }
    if (!permissions.allow_codec_h264 && settings.videoCodec == "h264") {
        settings.videoCodec = "auto"
    }

    if (!permissions.allow_hdr && settings.hdr) {
        settings.hdr = false
    }

    if (!permissions.allow_transport_webrtc && settings.dataTransport == "webrtc") {
        settings.dataTransport = "auto"
    }
    if (!permissions.allow_transport_websockets && settings.dataTransport == "websocket") {
        settings.dataTransport = "auto"
    }

    if (!Number.isFinite(settings.localCursorSensitivity) || settings.localCursorSensitivity <= 0) {
        settings.localCursorSensitivity = globalDefaultSettings().localCursorSensitivity
    }
}

/// Starlight Streams: the settings (Swiss Console, design/screens/S-Settings-All).
/// Quick Setup tiles, then collapsible sections with cells, switches, selects and sliders.
/// The values live in `state`; every change fires "ml-settingschange".
export class StreamSettingsComponent implements Component {

    private permissions: StreamPermissions
    private state: Settings

    private divElement: HTMLDivElement = document.createElement("div")
    /// Re-renders the controls that depend on other values (preset tiles, custom size, ...)
    private refreshers: Array<() => void> = []
    /// Starlight Streams: options this device can't play are turned off (true: a setting was changed)
    private capabilityChecks: Array<(caps: DeviceCaps) => boolean> = []

    /// checkDevice: grey out what this device can't play (not for role defaults, which are for everybody)
    constructor(permissions: StreamPermissions, settings: Settings, checkDevice = true) {
        // Sometimes the normal settings object doesn't have some values, because they change between versions.
        // Use those as fallback
        const defaultSettings_ = globalDefaultSettings()

        // A role without saved default settings has none
        settings = settings ?? ({} as Settings)
        makeSettingsValid(permissions, defaultSettings_)
        makeSettingsValid(permissions, settings)

        this.permissions = permissions
        this.state = deepMerge(deepClone(defaultSettings_), deepClone(settings ?? {}))
        this.state.language = normalizeLanguage(this.state.language)

        const translations = getTranslations(this.state.language)
        const i = translations.settings
        const streamI = translations.stream

        this.divElement.className = "sl-settings"

        // -- Quick Setup
        const quick = el("div", "sl-settings-quick")
        quick.append(el("span", "sl-label", i.quickSetup), el("span", "sl-ink2 sl-settings-quick-help", i.quickSetupHelp))
        const presets = el("div", "sl-presets")
        const presetDetails: Record<string, string> = { auto: i.recommended, weakNetwork: "720p", balanced: "1080p", bestQuality: i.native }
        for (const preset of PERFORMANCE_PRESETS) {
            const tile = el("button", "sl-preset")
            tile.type = "button"
            tile.append(el("span", "sl-label", presetDetails[preset.name]), el("span", "t", i.presets[preset.name]))
            tile.addEventListener("click", () => {
                Object.assign(this.state, deepClone(preset.settings))
                this.changed()
            })
            this.refreshers.push(() => {
                const pressed = Object.entries(preset.settings).every(([key, value]) => (this.state as any)[key] == value)
                tile.setAttribute("aria-pressed", pressed ? "true" : "false")
            })
            presets.appendChild(tile)
        }
        quick.appendChild(presets)
        this.divElement.appendChild(quick)

        // -- Video
        const video = this.section(i.video, true)
        this.switchRow(video, i.autoQualityTitle, i.autoQualityHelp, () => this.state.autoQuality, value => this.state.autoQuality = value)

        const sizes = this.stackRow(video, i.videoSize)
        this.cells(sizes, [
            { value: "720p", name: "720p" }, { value: "1080p", name: "1080p" }, { value: "1440p", name: "1440p" },
            { value: "4k", name: "4K", unsupported: caps => caps.decode4k ? null : i.no4k }, { value: "native", name: i.native }, { value: "custom", name: i.custom },
        ], () => this.state.videoSize, value => this.state.videoSize = value as Settings["videoSize"], () => "1440p")
        const custom = el("div", "sl-settings-pair")
        custom.append(
            this.numberInput(() => this.state.videoSizeCustom.width, value => this.state.videoSizeCustom.width = value, "W", i.videoWidth),
            this.numberInput(() => this.state.videoSizeCustom.height, value => this.state.videoSizeCustom.height = value, "H", i.videoHeight),
        )
        this.refreshers.push(() => custom.querySelectorAll("input").forEach(input => input.disabled = this.state.videoSize != "custom"))
        sizes.appendChild(custom)

        const fpsRow = this.stackRow(video, i.fps)
        const fpsOptions = [30, 60, 90, 120, 144]
        if (!fpsOptions.includes(this.state.fps)) {
            fpsOptions.push(this.state.fps)
            fpsOptions.sort((a, b) => a - b)
        }
        // More fps than the screen shows only costs bandwidth: offered up to the screen's refresh rate
        const tooFast = (fps: number, caps: DeviceCaps) => caps.refreshRate >= 50 && fps > caps.refreshRate + 5 ? i.screenMaxFps(caps.refreshRate) : null
        this.cells(fpsRow, fpsOptions.map(fps => ({ value: `${fps}`, name: `${fps}`, unsupported: (caps: DeviceCaps) => tooFast(fps, caps) })), () => `${this.state.fps}`, value => this.state.fps = parseInt(value),
            caps => `${fpsOptions.filter(fps => !tooFast(fps, caps)).pop() ?? 60}`)

        const bitrateRow = this.stackRow(video, i.bitrateTitle, i.bitrateHelp)
        const maxBitrate = this.permissions.maximum_bitrate_kbps ?? 100000
        bitrateRow.appendChild(this.rangeWithNumber(1000, maxBitrate, 500, () => this.state.bitrate, value => this.state.bitrate = value, "Kbps", i.bitrate))

        const codecRow = this.stackRow(video, i.videoCodec)
        this.cells(codecRow, [
            { value: "auto", name: i.auto },
            { value: "h264", name: "H264", disabled: !this.permissions.allow_codec_h264, unsupported: caps => caps.h264 ? null : i.noCodec("H264") },
            { value: "h265", name: "H265", disabled: !this.permissions.allow_codec_h265, unsupported: caps => caps.h265 ? null : i.noCodec("H265") },
            { value: "av1", name: "AV1", disabled: !this.permissions.allow_codec_av1, unsupported: caps => caps.av1 ? null : i.noCodec("AV1") },
        ], () => this.state.videoCodec, value => this.state.videoCodec = value as StreamCodec, () => "auto")

        const sharpeningRow = this.stackRow(video, i.sharpening)
        this.cells(sharpeningRow, [
            { value: "off", name: i.sharpeningOff }, { value: "auto", name: i.auto }, { value: "low", name: i.sharpeningLow },
            { value: "medium", name: i.sharpeningMedium }, { value: "high", name: i.sharpeningHigh },
        ], () => this.state.sharpening, value => this.state.sharpening = value as SharpeningMode)

        this.switchRow(video, i.enableHdr, i.hdrHelp, () => this.state.hdr, value => this.state.hdr = value, !this.permissions.allow_hdr,
            caps => !caps.hdrScreen ? i.noHdrScreen : !caps.decode10bit ? i.noHdrDecode : null)

        // Advanced renderer options, nested
        const advanced = this.section(i.advancedRenderer, false, true)
        this.switchRow(advanced, i.forceVideoElementRenderer, null, () => this.state.forceVideoElementRenderer, value => this.state.forceVideoElementRenderer = value)
        this.switchRow(advanced, i.useCanvasRenderer, null, () => this.state.canvasRenderer, value => this.state.canvasRenderer = value)
        this.switchRow(advanced, i.canvasVsync, null, () => this.state.canvasVsync, value => this.state.canvasVsync = value)
        video.appendChild(advanced.parentElement!.parentElement!.parentElement!)

        // -- Audio
        const audio = this.section(i.audio, false)
        this.switchRow(audio, i.playAudioLocal, null, () => this.state.playAudioLocal, value => this.state.playAudioLocal = value)
        this.switchRow(audio, i.microphone, i.microphoneEnabled, () => this.state.microphone, value => this.state.microphone = value)

        // -- Mouse & touch
        const mouse = this.section(i.mouseAndTouch, false)
        this.selectRow(mouse, i.startupMouseMode, [
            { value: "relative", name: streamI.relative }, { value: "follow", name: streamI.follow },
            { value: "localCursor", name: streamI.localCursor }, { value: "pointAndDrag", name: streamI.pointAndDrag },
        ], () => this.state.mouseMode, value => this.state.mouseMode = value as MouseMode)
        this.selectRow(mouse, i.startupTouchMode, [
            { value: "touch", name: streamI.touch }, { value: "mouseRelative", name: streamI.relative },
            { value: "localCursor", name: streamI.localCursor }, { value: "pointAndDrag", name: streamI.pointAndDrag },
        ], () => this.state.touchMode, value => this.state.touchMode = value as TouchMode)
        this.selectRow(mouse, i.scrollMode, [
            { value: "highres", name: i.highRes }, { value: "normal", name: i.normal },
        ], () => this.state.mouseScrollMode, value => this.state.mouseScrollMode = value as MouseScrollMode)
        const sensitivity = this.row(mouse, i.localCursorSensitivity)
        sensitivity.appendChild(this.rangeWithNumber(0.1, 3, 0.1, () => this.state.localCursorSensitivity, value => this.state.localCursorSensitivity = value, "×", i.localCursorSensitivity, true))

        // -- Controller
        const controller = this.section(window.isSecureContext ? i.controller : i.controllerDisabled, false)
        const noController = !window.isSecureContext
        this.switchRow(controller, i.invertAB, null, () => this.state.controllerConfig.invertAB, value => this.state.controllerConfig.invertAB = value, noController)
        this.switchRow(controller, i.invertXY, null, () => this.state.controllerConfig.invertXY, value => this.state.controllerConfig.invertXY = value, noController)
        this.switchRow(controller, i.overrideControllerInterval, null, () => this.state.controllerConfig.sendIntervalOverride != null,
            value => this.state.controllerConfig.sendIntervalOverride = value ? (this.state.controllerConfig.sendIntervalOverride ?? 20) : null, noController)
        const interval = this.row(controller, i.sendInterval, i.sendIntervalHelp)
        const intervalInput = this.numberInput(() => this.state.controllerConfig.sendIntervalOverride ?? 20,
            value => this.state.controllerConfig.sendIntervalOverride = Math.min(120, Math.max(10, value)), "ms", i.sendInterval)
        this.refreshers.push(() => intervalInput.querySelector("input")!.disabled = noController || this.state.controllerConfig.sendIntervalOverride == null)
        interval.appendChild(intervalInput)

        // -- Other
        const other = this.section(i.other, false)
        this.selectRow(other, i.language, getLanguageOptions(), () => this.state.language, value => this.state.language = value as Language)
        const transportRow = this.stackRow(other, i.dataTransport)
        this.cells(transportRow, [
            { value: "auto", name: i.auto },
            { value: "webrtc", name: "WebRTC", disabled: !this.permissions.allow_transport_webrtc },
            { value: "websocket", name: i.webSocket, disabled: !this.permissions.allow_transport_websockets },
        ], () => this.state.dataTransport, value => this.state.dataTransport = value as TransportType)
        this.switchRow(other, i.enterFullscreenOnStreamStart, null, () => this.state.enterFullscreenOnStreamStart, value => this.state.enterFullscreenOnStreamStart = value)
        this.switchRow(other, i.toggleFullscreenWithKeybind, null, () => this.state.toggleFullscreenWithKeybind, value => this.state.toggleFullscreenWithKeybind = value)
        const edgeRow = this.stackRow(other, i.sidebarEdge)
        this.cells(edgeRow, [
            { value: "left", name: i.left }, { value: "right", name: i.right }, { value: "up", name: i.up }, { value: "down", name: i.down },
        ], () => this.state.sidebarEdge, value => this.state.sidebarEdge = value as SidebarEdge)
        this.switchRow(other, i.hideSidebarButton, null, () => this.state.hideSidebarButton, value => this.state.hideSidebarButton = value)
        this.switchRow(other, i.useCustomDropdown, null, () => this.state.useSelectElementPolyfill, value => this.state.useSelectElementPolyfill = value)

        this.refresh()

        if (checkDevice) {
            getDeviceCaps().then(caps => {
                let changed = false
                for (const check of this.capabilityChecks) {
                    changed = check(caps) || changed
                }
                if (changed) {
                    // A saved setting this device can't play was turned off
                    this.changed()
                } else {
                    this.refresh()
                }
            })
        }
    }

    // -- building blocks

    /// A collapsible section; returns the element its rows go into
    private section(title: string, open: boolean, nested = false): HTMLElement {
        const section = el("section", nested ? "sl-section sl-section--nested" : "sl-section")
        const head = el("button", "sl-section-head")
        head.type = "button"
        head.setAttribute("aria-expanded", open ? "true" : "false")
        const chevron = icon("chevronDown")
        chevron.classList.add("chev")
        head.append(title, chevron)
        const body = el("div", "sl-section-body")
        body.hidden = !open
        const inner = el("div")
        const rows = el("div", "sl-section-rows")
        inner.appendChild(rows)
        body.appendChild(inner)
        head.addEventListener("click", () => {
            const expanded = head.getAttribute("aria-expanded") != "true"
            head.setAttribute("aria-expanded", expanded ? "true" : "false")
            body.hidden = !expanded
        })
        section.append(head, body)
        if (!nested) {
            this.divElement.appendChild(section)
        }
        return rows
    }

    /// A row: title (+ help) on the left, the control on the right
    private row(parent: HTMLElement, title: string, help?: string | null): HTMLElement {
        const row = el("div", "sl-setting")
        const text = el("div", "txt")
        text.appendChild(el("span", "title", title))
        if (help) {
            text.appendChild(el("span", "sl-help", help))
        }
        row.appendChild(text)
        parent.appendChild(row)
        return row
    }
    /// A row with the control under the title
    private stackRow(parent: HTMLElement, title: string, help?: string | null): HTMLElement {
        const row = this.row(parent, title, help)
        row.classList.add("sl-setting--stack")
        return row
    }

    private switchRow(parent: HTMLElement, title: string, help: string | null, get: () => boolean, set: (value: boolean) => void, disabled = false, unsupported?: (caps: DeviceCaps) => string | null) {
        const row = this.row(parent, title, help)
        const toggle = el("button", "sl-switch")
        toggle.type = "button"
        toggle.setAttribute("role", "switch")
        toggle.setAttribute("aria-label", title)
        toggle.disabled = disabled
        toggle.addEventListener("click", () => {
            set(!get())
            this.changed()
        })
        this.refreshers.push(() => toggle.setAttribute("aria-checked", get() ? "true" : "false"))
        row.appendChild(toggle)

        if (unsupported) {
            this.capabilityChecks.push(caps => {
                const reason = unsupported(caps)
                if (reason) {
                    toggle.disabled = true
                    toggle.title = reason
                    this.addUnsupportedNote(row, [reason])
                    if (get()) {
                        set(false)
                        return true
                    }
                }
                return false
            })
        }
    }

    /// "Not on this device: …" under a row
    private addUnsupportedNote(row: HTMLElement, reasons: Array<string>) {
        const text = row.querySelector(".txt") ?? row
        const note = el("span", "sl-help sl-unsupported", reasons.join(" "))
        text.appendChild(note)
    }

    private cells(parent: HTMLElement, options: Array<{ value: string, name: string, disabled?: boolean, unsupported?: (caps: DeviceCaps) => string | null }>, get: () => string, set: (value: string) => void, fallback?: (caps: DeviceCaps) => string) {
        const cells = el("div", "sl-cells")
        cells.setAttribute("role", "group")
        const elements: Array<HTMLButtonElement> = []
        if (options.some(option => option.unsupported)) {
            this.capabilityChecks.push(caps => {
                const reasons: Array<string> = []
                let changed = false
                options.forEach((option, index) => {
                    const reason = option.unsupported?.(caps)
                    if (!reason) {
                        return
                    }
                    const cell = elements[index]
                    cell.disabled = true
                    cell.title = reason
                    cell.classList.add("is-unsupported")
                    if (!reasons.includes(reason)) {
                        reasons.push(reason)
                    }
                    if (get() == option.value && fallback) {
                        set(fallback(caps))
                        changed = true
                    }
                })
                if (reasons.length > 0) {
                    this.addUnsupportedNote(parent, reasons)
                }
                return changed
            })
        }
        for (const option of options) {
            const cell = el("button", "sl-cell", option.name)
            cell.type = "button"
            cell.disabled = option.disabled ?? false
            cell.addEventListener("click", () => {
                set(option.value)
                this.changed()
            })
            this.refreshers.push(() => cell.setAttribute("aria-pressed", get() == option.value ? "true" : "false"))
            cells.appendChild(cell)
            elements.push(cell)
        }
        parent.appendChild(cells)
    }

    private selectRow(parent: HTMLElement, title: string, options: Array<{ value: string, name: string }>, get: () => string, set: (value: string) => void) {
        const row = this.row(parent, title)
        const select = el("select", "sl-select sl-settings-select")
        select.setAttribute("aria-label", title)
        for (const option of options) {
            const element = el("option", undefined, option.name)
            element.value = option.value
            select.appendChild(element)
        }
        select.addEventListener("change", () => {
            set(select.value)
            this.changed()
        })
        this.refreshers.push(() => select.value = get())
        row.appendChild(select)
    }

    /// A number field with a unit inside it
    private numberInput(get: () => number, set: (value: number) => void, unit: string, label: string, decimal = false): HTMLElement {
        const wrap = el("div", "sl-input-suffix sl-settings-number")
        const input = el("input", "sl-input sl-input-sm")
        input.inputMode = decimal ? "decimal" : "numeric"
        input.setAttribute("aria-label", label)
        input.addEventListener("change", () => {
            const value = decimal ? parseFloat(input.value) : parseInt(input.value)
            if (Number.isFinite(value)) {
                set(value)
            }
            this.changed()
        })
        this.refreshers.push(() => {
            if (document.activeElement != input) {
                input.value = `${get()}`
            }
        })
        wrap.append(input, el("span", "sl-mono sl-muted suffix", unit))
        return wrap
    }

    private rangeWithNumber(min: number, max: number, step: number, get: () => number, set: (value: number) => void, unit: string, label: string, decimal = false): HTMLElement {
        const wrap = el("div", "sl-settings-range")
        const range = el("input", "sl-range")
        range.type = "range"
        range.min = `${min}`
        range.max = `${max}`
        range.step = `${step}`
        range.setAttribute("aria-label", label)
        const fill = () => range.style.setProperty("--sl-fill", `${(Number(range.value) - min) / (max - min) * 100}%`)
        range.addEventListener("input", () => {
            set(decimal ? parseFloat(range.value) : parseInt(range.value))
            fill()
            this.refresh()
        })
        range.addEventListener("change", () => this.changed())
        this.refreshers.push(() => {
            range.value = `${get()}`
            fill()
        })
        wrap.append(range, this.numberInput(get, value => set(Math.min(max, Math.max(min, value))), unit, label, decimal))
        return wrap
    }

    // -- state

    private refresh() {
        for (const refresh of this.refreshers) {
            refresh()
        }
    }

    private changed() {
        makeSettingsValid(this.permissions, this.state)
        this.refresh()
        this.divElement.dispatchEvent(new ComponentEvent("ml-settingschange", this))
    }

    addChangeListener(listener: StreamSettingsChangeListener) {
        this.divElement.addEventListener("ml-settingschange", listener as any)
    }
    removeChangeListener(listener: StreamSettingsChangeListener) {
        this.divElement.removeEventListener("ml-settingschange", listener as any)
    }

    getStreamSettings(): Settings {
        const settings = deepClone(this.state)
        makeSettingsValid(this.permissions, settings)
        return settings
    }

    mountBefore(parent: HTMLElement, before: HTMLElement): void {
        parent.insertBefore(this.divElement, before)
    }
    mount(parent: HTMLElement): void {
        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {
        if (this.divElement.parentElement == parent) {
            parent.removeChild(this.divElement)
        }
    }
}
