import { Api, apiGetHost, apiGetRole, apiHostDisplays, getApi } from "./api"
import { openSlModal } from "./component/sl_modal"
import { DetailedRole, StreamKeys } from "./api_bindings"
import { Component } from "./component/index"
import { SelectComponent } from "./component/input"
import { FormModal } from "./component/modal/form"
import { getModalBackground, Modal, showMessage, showModal } from "./component/modal/index"
import { showNotification } from "./component/notification"
import { getLocalStreamSettings, setLocalStreamSettings, Settings, TransportType } from "./component/settings_menu"
import { getSidebarRoot, setSidebar, setSidebarExtended, setSidebarStyle, Sidebar } from "./component/sidebar/index"
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations, Language, normalizeLanguage } from "./i18n"
import { requestKeyboardLock } from "./iframe"
import "./polyfill/index"
import { KeyboardModeChangeEvent, likelyHasNativeOnScreenKeyboard, ScreenKeyboard, ScreenKeyboardListener, TextEvent } from "./keyboard"
import { InfoEvent, Stream, StreamCapabilities } from "./stream/index"
import { defaultStreamInputConfig, MouseMode, ScreenKeyboardSetVisibleEvent, StreamInputConfig } from "./stream/input"
import { emptyKeyModifiers } from "./stream/keyboard"
import { DisplaySwitcher, getCachedDisplays, getDisplayCount, setCachedDisplays, setLastStream } from "./stream/display"
import { DisplayOverview } from "./stream/display_overview"
import { getUnlockPin, needsUnlock, setUnlockPin, unlockPc } from "./stream/auto_unlock"
import { measureAutoQuality } from "./stream/auto_quality"
import { ConnectionDot } from "./stream/connection_dot"
import { LaunchReveal } from "./component/launch_transition"
import { VideoEnhancer } from "./stream/video/enhancer"
import { QualityLevel, QualityMonitor, stepDown, stepUp } from "./stream/quality_monitor"
import { LogMessageType } from "./stream/log"
import { streamStatsToText } from "./stream/stats"
import "./styles/index"
import { LogLevel, uniffiInitAsync, Logger as UniffiLogger, setLogger as uniffiSetLogger } from "./uniffi/entry"
import { NativeScreenKeyboard } from "./keyboard/native_keyboard"
import { SimulatedKeyboard } from "./keyboard/simulated_keyboard"
import { buildUrl } from "./config_"
import { button, el, icon } from "./icons"

let I = getTranslations(getCurrentLanguage())

async function startApp() {
    const uniffiInit = uniffiInitAsync()

    const api = await getApi()

    const queryParams = new URLSearchParams(location.search)
    let lang = parseLanguageFromQuery(queryParams)
    const bootstrapRole = await apiGetRole(api, { id: null })
    if (!lang) {
        adoptRoleDefaultLanguage(bootstrapRole.role.default_settings)
        lang = getCurrentLanguage()
    }
    I = getTranslations(lang)

    const rootElement = document.getElementById("root");
    if (rootElement == null) {
        showNotification(I.stream.rootNotFound, "error")
        return;
    }

    // Get Host and App via Query
    const hostIdStr = queryParams.get("hostId")
    const appIdStr = queryParams.get("appId")
    if (hostIdStr == null || appIdStr == null) {
        await showMessage(I.stream.missingHostOrApp)

        window.close()
        return
    }
    const hostId = Number.parseInt(hostIdStr)
    const appId = Number.parseInt(appIdStr)

    // event propagation on overlays
    const sidebarRoot = getSidebarRoot()
    if (sidebarRoot) {
        stopPropagationOn(sidebarRoot)
    }

    const modalBackground = getModalBackground()
    if (modalBackground) {
        stopPropagationOn(modalBackground)
    }

    // Wait for uniffi to finish it's initialization
    await uniffiInit
    // Set Uniffy Logger
    class CustomUniffiLogger implements UniffiLogger {
        log(level: LogLevel, message: string): void {
            switch (level) {
                case LogLevel.Trace:
                    console.trace(message)
                    break;
                case LogLevel.Debug:
                    console.debug(message)
                    break;
                case LogLevel.Warn:
                    console.warn(message)
                    break;
                case LogLevel.Info:
                    console.info(message)
                    break;
                case LogLevel.Error:
                    console.error(message)
                    break;
            }
        }
    }
    uniffiSetLogger(new CustomUniffiLogger(), LogLevel.Debug)

    // Starlight Streams: auto quality picks resolution, fps and bitrate from a quick speed test
    let options = parseSettingsFromQuery(queryParams)
    const effectiveSettings = { ...getLocalStreamSettings(bootstrapRole.role.default_settings), ...options }
    if (effectiveSettings.autoQuality) {
        // (no card or message: the page stays black until the picture comes, see the connection dot)
        CONNECT_CARD.setStep(0)
        const auto = await measureAutoQuality(api)
        if (auto) {
            options = { ...options, ...auto.settings }
            console.info(I.stream.autoQualityResult(auto.settings.videoSize ?? "", auto.settings.fps ?? 0, auto.settings.bitrate ?? 0, auto.mbps))
        }
    }
    CONNECT_CARD.setStep(effectiveSettings.autoQuality ? 1 : 1)
    CONNECT_CARD.setSubtitle(getTranslations(getCurrentLanguage()).host.displayName(new DisplaySwitcher(hostId).getCurrent()))

    // Start and Mount App
    const app = new ViewerApp(api, hostId, appId, bootstrapRole.role, options)
    app.mount(rootElement);

    (window as any)["app"] = app
}

// Prevent starting transition
window.requestAnimationFrame(() => {
    // Note: elements is a live array
    const elements = document.getElementsByClassName("prevent-start-transition")
    while (elements.length > 0) {
        elements.item(0)?.classList.remove("prevent-start-transition")
    }
})

function parseSettingsFromQuery(queryParams: URLSearchParams): Partial<Settings> {
    const settings: Partial<Settings> = {}

    const bitrate = queryParams.get("bitrate")
    if (bitrate) {
        settings.bitrate = Number(bitrate)
    }

    const fps = queryParams.get("fps")
    if (fps) {
        settings.fps = Number(fps)
    }

    const hdr = queryParams.get("hdr")
    if (hdr != null) {
        settings.hdr = hdr === "true"
    }

    const videoSize = queryParams.get("videoSize")
    if (videoSize) {
        settings.videoSize = videoSize as Settings["videoSize"]
    }

    const width = queryParams.get("videoSizeCustom.width")
    const height = queryParams.get("videoSizeCustom.height")
    if (width && height) {
        settings.videoSizeCustom = {
            width: Number(width),
            height: Number(height),
        }
    }

    const dataTransport = queryParams.get("dataTransport")
    if (dataTransport) {
        settings.dataTransport = dataTransport as TransportType
    }

    return settings
}

function parseLanguageFromQuery(queryParams: URLSearchParams): Language | undefined {
    const language = queryParams.get("language")
    return language ? normalizeLanguage(language) : undefined
}

startApp()

class ViewerApp implements Component {
    private api: Api

    private sidebar: ViewerSidebar

    private div = document.createElement("div")

    private connectionInfoModal = CONNECT_CARD
    private screenKeyboard: ScreenKeyboard

    private statsDiv = document.createElement("div")
    private localTouchCursorDiv = document.createElement("div")
    private stream: Stream
    private displaySwitcher: DisplaySwitcher
    private displayOverview: DisplayOverview
    private pcName = ""
    private enhancer: VideoEnhancer

    // Starlight Streams: auto quality during the stream
    private appId: number
    private permissions: DetailedRole["permissions"]
    private streamSettings: Settings
    private qualityMonitor: QualityMonitor | null = null
    private qualityCeiling: QualityLevel | null = null
    private lastQualityUpAt = 0
    private qualityUpBlockedUntil = 0
    private restartingStream = false
    // Starlight Streams: reconnect by itself when the stream is lost
    private everConnected = false
    private reconnectAttempts = 0
    private reconnectTimer: number | null = null
    private freeze: FrozenFrame | null = null
    private triedWorkingSettings = false
    private launchReveal: LaunchReveal | null = null
    private pendingFallback: { changes: Partial<RiskySettings>, names: Array<string> } | null = null
    private connectionDot = new ConnectionDot(() => this.stream.getTransportStats())
    private bootstrapDefaults: Settings
    private unlocking = false
    private unlockTried = false
    private hostId: number

    // Starlight Streams: game mouse = laptop cursor hidden, mouse only moves the pc's mouse (pointer lock)
    private gameMouse = false
    private mouseModeBeforeGameMouse: MouseMode = "follow"

    private inputConfig: StreamInputConfig = defaultStreamInputConfig()
    private previousMouseMode: MouseMode

    private autoEnterFullscreenOnStart: boolean = false
    private pendingAutoFullscreenPrompt: boolean = false
    private fullscreenPromptShown: boolean = false
    private fullscreenOnNextInteractionArmed: boolean = false
    private pendingAutoFullscreenTouchGesture: boolean = false
    private pendingAutoFullscreenMouseGesture: boolean = false
    private manualFullscreenExitRequested: boolean = false

    private toggleFullscreenWithKeybind: boolean = false

    private hasShownFullscreenEscapeWarning = false

    constructor(api: Api, hostId: number, appId: number, bootstrapRole: DetailedRole, options?: Partial<Settings>) {
        this.api = api
        this.hostId = hostId
        this.displaySwitcher = new DisplaySwitcher(hostId)
        this.displayOverview = new DisplayOverview(api, hostId, () => this.getCurrentDisplay(), (display, name) => {
            // The overview has its own zoom animation
            this.switchDisplay(display, false)
            const label = getTranslations(getCurrentLanguage()).host.displayName(display)
            showNotification(name ? `${label} · ${name}` : label, "info")
        }, () => this.pcName)

        const defaultSettings = getLocalStreamSettings(bootstrapRole.default_settings)
        const settings = {
            ...defaultSettings,
            ...options,
            videoSizeCustom: {
                ...defaultSettings.videoSizeCustom,
                ...options?.videoSizeCustom,
            },
        }
        Object.assign(this.inputConfig, {
            mouseMode: settings.mouseMode,
            mouseScrollMode: settings.mouseScrollMode,
            touchMode: settings.touchMode,
            localCursorSensitivity: settings.localCursorSensitivity,
            controllerConfig: settings.controllerConfig
        })

        // Configure sidebar
        this.sidebar = new ViewerSidebar(this)
        setSidebar(this.sidebar)

        // The pc's name in the sidebar
        apiGetHost(api, { host_id: hostId }).then(host => {
            this.pcName = host.name
            this.sidebar.setTitle(host.name)
        }).catch(() => { })

        // The displays the pc has (the server remembers them, also between browsers)
        apiHostDisplays(api, { host_id: hostId }).then(({ displays }) => {
            if (displays.length > 0 && displays.length != this.getDisplayCount()) {
                setCachedDisplays(hostId, displays)
                this.sidebar.renderDisplayButtons()
            } else if (displays.length > 0) {
                setCachedDisplays(hostId, displays)
            }
        }).catch(() => {
            // keep the displays this browser knows
        })

        // Configure stats element
        this.statsDiv.hidden = true
        this.statsDiv.classList.add("video-stats", "sl-stats")
        this.localTouchCursorDiv.hidden = true
        this.localTouchCursorDiv.classList.add("local-touch-cursor")

        setInterval(() => {
            // Update stats display every 100ms
            const stats = this.getStream()?.getStats()
            if (stats && stats.isEnabled()) {
                this.statsDiv.hidden = false

                const text = streamStatsToText(stats.getCurrentStats())
                this.statsDiv.innerText = text
            } else {
                this.statsDiv.hidden = true
            }
        }, 100)
        this.div.appendChild(this.statsDiv)
        this.div.appendChild(this.localTouchCursorDiv)

        // Configure Screen Keyboard
        if (likelyHasNativeOnScreenKeyboard()) {
            this.screenKeyboard = new NativeScreenKeyboard(I)
        } else {
            this.screenKeyboard = new SimulatedKeyboard()
        }

        this.screenKeyboard.addListener(this.sidebar)
        stopPropagationOn(this.screenKeyboard.getElement())

        // Configure stream
        this.previousMouseMode = this.inputConfig.mouseMode

        const browserWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
        const browserHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)

        this.autoEnterFullscreenOnStart = settings.enterFullscreenOnStreamStart
        this.toggleFullscreenWithKeybind = settings.toggleFullscreenWithKeybind

        this.stream = new Stream(this.api, hostId, appId, settings, [browserWidth, browserHeight], bootstrapRole.permissions)
        this.appId = appId
        this.permissions = bootstrapRole.permissions
        this.bootstrapDefaults = bootstrapRole.default_settings
        this.streamSettings = settings

        // Picture sharpening; HDR would lose its colors in the 8 bit canvas
        this.enhancer = new VideoEnhancer(settings.hdr ? "off" : settings.sharpening ?? "off")
        this.enhancer.start()
        this.startStream(settings)

        // Configure input
        this.addListeners(document)
        this.addListeners(document.getElementById("input") as HTMLDivElement)

        window.addEventListener("blur", () => {
            this.stream.getInput().raiseAllKeys()
        })
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible") {
                this.stream.getInput().raiseAllKeys()
            }
        })

        // When the page gets destroyed
        window.addEventListener("beforeunload", async () => {
            // Stop the current stream
            await this.stream.stop()
        })

        document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this))
        document.addEventListener("fullscreenchange", this.onFullscreenChange.bind(this))

        window.addEventListener("gamepadconnected", this.onGamepadConnect.bind(this))
        window.addEventListener("gamepaddisconnected", this.onGamepadDisconnect.bind(this))
        // Connect all gamepads
        for (const gamepad of navigator.getGamepads()) {
            if (gamepad != null) {
                this.onGamepadAdd(gamepad)
            }
        }
    }
    private addListeners(element: GlobalEventHandlers) {
        element.addEventListener("keydown", this.onKeyDown.bind(this), { passive: false })
        element.addEventListener("keyup", this.onKeyUp.bind(this), { passive: false })
        element.addEventListener("paste", this.onPaste.bind(this))

        element.addEventListener("mousedown", this.onMouseButtonDown.bind(this), { passive: false })
        element.addEventListener("mouseup", this.onMouseButtonUp.bind(this), { passive: false })
        element.addEventListener("mousemove", this.onMouseMove.bind(this), { passive: false })
        element.addEventListener("wheel", this.onMouseWheel.bind(this), { passive: false })
        element.addEventListener("contextmenu", this.onContextMenu.bind(this), { passive: false })

        element.addEventListener("touchstart", this.onTouchStart.bind(this), { passive: false })
        element.addEventListener("touchend", this.onTouchEnd.bind(this), { passive: false })
        element.addEventListener("touchcancel", this.onTouchCancel.bind(this), { passive: false })
        element.addEventListener("touchmove", this.onTouchMove.bind(this), { passive: false })
    }

    private async startStream(settings: Settings) {
        // Started from the home page's animation: the home page stays with the black box until the
        // live picture is ready, then the box grows over it
        this.launchReveal = LaunchReveal.take(this.hostId)

        // Stream start animation: the picture fades in while the display number grows out of the card
        // (on the video elements: a filter on their container would move them, they're position: fixed)
        this.connectionInfoModal.setLaunch(this.getCurrentDisplay(), () => {
            for (const video of Array.from(this.div.querySelectorAll<HTMLElement>(".video-stream"))) {
                video.classList.remove("sl-video-enter")
                void video.offsetWidth
                video.classList.add("sl-video-enter")
                video.addEventListener("animationend", () => video.classList.remove("sl-video-enter"), { once: true })
            }
        })

        setSidebarStyle({
            edge: settings.sidebarEdge,
        })

        // Optionally keep the sidebar toggle invisible until hovered/focused
        document.getElementById("sidebar-button")
            ?.classList.toggle("is-unobtrusive", settings.hideSidebarButton)

        // Add app info listener
        this.addStreamInfoListener()

        // Create connection info modal
        // (the card only shows when it fails; the page stays black until the picture comes)
        const connectionInfoListener = this.connectionInfoModal.onInfo.bind(this.connectionInfoModal)
        this.stream.addInfoListener(connectionInfoListener)

        // Start animation frame loop
        this.onTouchUpdate()
        this.onGamepadUpdate()

        this.stream.getInput().addScreenKeyboardVisibleEvent(this.onScreenKeyboardSetVisible.bind(this))

        this.stream.mount(this.div)

        if (this.autoEnterFullscreenOnStart) {
            this.pendingAutoFullscreenPrompt = true
        }
    }

    /// Only events of the current stream count: an old one stopped by auto quality is ignored
    private addStreamInfoListener() {
        const stream = this.stream
        stream.addInfoListener((event) => {
            if (stream === this.stream) {
                this.onInfo(event)
            }
        })
    }

    // -- Auto quality during the stream
    private currentQuality(): QualityLevel {
        return {
            videoSize: this.streamSettings.videoSize,
            bitrate: this.streamSettings.bitrate,
            fps: this.streamSettings.fps,
        }
    }

    private startQualityMonitor() {
        this.qualityMonitor?.stop()
        if (!this.streamSettings.autoQuality) {
            return
        }
        // Never go above the quality the stream started with
        this.qualityCeiling ??= this.currentQuality()

        const stream = this.stream
        this.qualityMonitor = new QualityMonitor(
            () => stream.getTransportStats(),
            (direction) => this.onQualityChange(direction)
        )
        this.qualityMonitor.start()
    }

    private onQualityChange(direction: "down" | "up") {
        const now = Date.now()
        const current = this.currentQuality()

        if (direction == "down") {
            // Went up and it didn't hold: don't try again for a while
            if (now - this.lastQualityUpAt < 60_000) {
                this.qualityUpBlockedUntil = now + 10 * 60_000
            }
            const lower = stepDown(current)
            if (lower) {
                this.restartStreamWithQuality(lower, "down")
            }
        } else {
            if (now < this.qualityUpBlockedUntil || !this.qualityCeiling) {
                return
            }
            const higher = stepUp(current, this.qualityCeiling)
            if (higher) {
                this.lastQualityUpAt = now
                this.restartStreamWithQuality(higher, "up")
            }
        }
    }

    /// Replaces the stream with one of another quality. The game keeps running on the pc, and
    /// fullscreen and the captured mouse stay, because the page isn't reloaded. The last picture
    /// stays on screen until the new stream shows its first one.
    private async restartStreamWithQuality(level: QualityLevel, direction: "down" | "up") {
        if (this.restartingStream) {
            return
        }
        const message = `${level.videoSize} · ${level.fps} fps · ${(level.bitrate / 1000).toFixed(1)} Mbit/s`
        showNotification(direction == "down" ? I.stream.qualityLowered(message) : I.stream.qualityRaised(message), "info")

        this.streamSettings = { ...this.streamSettings, ...level }
        await this.replaceStream(I.stream.changingQuality, false)
    }

    /// The stream was lost: the last picture stays (blurred) and it connects again by itself,
    /// on the same display with the same settings. Gives up after a few tries.
    private reconnect() {
        if (this.reconnectTimer != null || this.restartingStream) {
            return
        }
        const delays = [1000, 2000, 3000, 5000, 8000]
        if (this.reconnectAttempts >= delays.length) {
            this.reconnectAttempts = 0
            this.freeze?.remove()
            this.freeze = null
            this.connectionInfoModal.setQuiet(false)
            this.connectionInfoModal.showFailure(I.stream.reconnectFailed)
            return
        }
        const delay = delays[this.reconnectAttempts]
        this.reconnectAttempts += 1
        this.connectionInfoModal.setQuiet(true)

        this.freeze ??= FrozenFrame.capture(this.div)
        this.freeze.show(I.stream.reconnecting(this.reconnectAttempts), true)

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            this.replaceStream(I.stream.reconnecting(this.reconnectAttempts), true)
        }, delay)
    }

    private async replaceStream(label: string, blur: boolean) {
        if (this.restartingStream) {
            return
        }
        this.restartingStream = true
        this.connectionInfoModal.setQuiet(true)

        try {
            this.qualityMonitor?.stop()
            this.qualityMonitor = null

            this.freeze ??= FrozenFrame.capture(this.div)
            this.freeze.show(label, blur)

            const old = this.stream
            old.getInput().raiseAllKeys()
            await old.stop()
            old.unmount(this.div)

            const browserWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
            const browserHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
            this.stream = new Stream(this.api, this.hostId, this.appId, this.streamSettings, [browserWidth, browserHeight], this.permissions)

            this.addStreamInfoListener()
            this.stream.addInfoListener(this.connectionInfoModal.onInfo.bind(this.connectionInfoModal))
            this.stream.getInput().addScreenKeyboardVisibleEvent(this.onScreenKeyboardSetVisible.bind(this))
            this.setInputConfig(this.inputConfig)
            for (const gamepad of navigator.getGamepads()) {
                if (gamepad != null) {
                    this.onGamepadAdd(gamepad)
                }
            }
            this.stream.mount(this.div)
        } finally {
            this.restartingStream = false
        }
    }

    private async onInfo(event: InfoEvent) {
        const data = event.detail

        if (data.type == "app") {
            const appName = data.appName

            document.title = `Stream: ${appName}`

        } else if (data.type == "connectionComplete") {
            this.sidebar.onCapabilitiesChange(data.capabilities)

            // These settings work on this device
            saveWorkingSettings(this.streamSettings)
            if (this.pendingFallback) {
                // It worked after going back: turn the setting that didn't work off for good
                setLocalStreamSettings({ ...getLocalStreamSettings(this.bootstrapDefaults), ...this.pendingFallback.changes })
                showNotification(I.stream.settingsTurnedOff(this.pendingFallback.names.join(", ")), "warn")
                this.pendingFallback = null
            }

            this.connectionDot.reset()
            this.connectionDot.mount(document.body)

            // Connected (again): the frozen picture goes once the new one is there
            this.everConnected = true
            this.reconnectAttempts = 0
            this.connectionInfoModal.setQuiet(false)
            // (after the switch back to the saved display, 1.5 s after connecting, when it isn't display 1)
            const freeze = this.freeze
            this.freeze = null
            freeze?.fadeOut(this.getCurrentDisplay() != 1 ? 2000 : 700)
            // The start animation: the black box grows to show the live picture (of the right display)
            const launch = this.launchReveal
            this.launchReveal = null
            if (launch) {
                window.setTimeout(() => launch.reveal(), this.getCurrentDisplay() != 1 ? 1900 : 500)
            }

            // Unlock the pc first (once per page), then go back to the display that was streamed last time
            const firstConnection = !this.unlockTried
            this.unlockTried = true
            const unlocked = firstConnection ? this.autoUnlock(false) : Promise.resolve()
            unlocked.finally(() => setTimeout(() => this.displaySwitcher.applySaved(this.stream.getInput()), 1500))

            this.startQualityMonitor()

            // For "Last stream: …" on the home page
            setLastStream(this.hostId, {
                display: this.getCurrentDisplay(),
                size: this.streamSettings.videoSize == "custom" ? `${this.streamSettings.videoSizeCustom.width}×${this.streamSettings.videoSizeCustom.height}` : this.streamSettings.videoSize,
                fps: this.streamSettings.fps,
                at: Date.now(),
            })

            // Game mouse stays on between streams, the mouse is captured on the first click
            if (loadGameMousePreference() && !this.gameMouse) {
                this.setGameMouse(true, false)
                showNotification(I.stream.gameMouseClickToCapture, "info")
            }

            this.armFullscreenOnNextInteraction()
        } else if (data.type == "connectionLost") {
            // Worked before (or a replaced stream): connect again instead of showing the error
            if (this.everConnected) {
                this.reconnect()
            } else if (this.triedWorkingSettings) {
                // Also failed with the settings that work: show the error
                this.connectionInfoModal.setQuiet(false)
                this.launchReveal?.remove()
                this.launchReveal = null
                this.freeze?.remove()
                this.freeze = null
            } else {
                // Never connected: maybe a setting this device can't do. Go back to what worked
                this.triedWorkingSettings = true
                const fallback = workingFallback(this.streamSettings)
                if (fallback.names.length > 0) {
                    this.connectionInfoModal.setQuiet(true)
                    this.connectionInfoModal.setSubtitle(I.stream.tryingWorkingSettings)

                    this.streamSettings = { ...this.streamSettings, ...fallback.changes }
                    // Kept only when it works with them (it may have failed for another reason)
                    this.pendingFallback = fallback
                    this.replaceStream(I.stream.tryingWorkingSettings, false)
                } else {
                    // Nothing to try: the error card shows, without the start screenshot behind it
                    this.freeze?.remove()
                    this.freeze = null
                    this.launchReveal?.remove()
                    this.launchReveal = null
                }
            }
        } else if (data.type == "streamEnded") {
            if (!data.graceful && this.everConnected) {
                this.reconnect()
            } else if (data.graceful) {
                await showMessage(data.message ?? "The stream was gracefully closed!")

                exitStreamPage()
            } else {
                // This dispatches a log line as fatal
                const event: InfoEvent = new CustomEvent("stream-info", {
                    detail: { type: "addDebugLine", line: data.message ?? "The stream closed with an ungracefully!", additional: { type: "fatal" } }
                })
                this.connectionInfoModal.onInfo(event)
            }
        }
    }

    private focusInput() {
        if (this.stream.getInput().getCurrentPredictedTouchAction() != "screenKeyboard" && !this.screenKeyboard.isVisible()) {
            const inputElement = document.getElementById("input") as HTMLDivElement
            inputElement.focus()
        }
    }

    onUserInteraction() {
        this.focusInput()

        this.stream.getVideoRenderer()?.onUserInteraction()
        this.stream.getAudioPlayer()?.onUserInteraction()

        const micListener = this.stream.getMicrophoneListener()
        if (micListener && "onUserInteraction" in micListener && typeof micListener.onUserInteraction == "function") {
            micListener.onUserInteraction()
        }
    }

    // -- Auto Fullscreen
    private armFullscreenOnNextInteraction() {
        if (this.autoEnterFullscreenOnStart) {
            this.fullscreenOnNextInteractionArmed = true
        }
    }
    private consumeAutoFullscreenInteraction(): boolean {
        if (!this.fullscreenOnNextInteractionArmed || this.isFullscreen()) {
            return false
        }

        this.fullscreenOnNextInteractionArmed = false
        void this.requestFullscreen().then(() => {
            if (!this.isFullscreen()) {
                this.armFullscreenOnNextInteraction()
            }
        })
        return true
    }
    private beginAutoFullscreenTouchGesture(): boolean {
        if (!this.fullscreenOnNextInteractionArmed || this.isFullscreen()) {
            return false
        }

        this.pendingAutoFullscreenTouchGesture = true
        return true
    }
    private consumeAutoFullscreenTouchGesture(): boolean {
        if (!this.pendingAutoFullscreenTouchGesture) {
            return false
        }

        this.pendingAutoFullscreenTouchGesture = false
        return this.consumeAutoFullscreenInteraction()
    }

    private onScreenKeyboardSetVisible(event: ScreenKeyboardSetVisibleEvent) {
        console.info(event.detail)
        const screenKeyboard = this.screenKeyboard

        const newShown = event.detail.visible
        screenKeyboard.setVisible(newShown)
    }

    // Input
    getInputConfig(): StreamInputConfig {
        return this.inputConfig
    }
    // Game mouse
    /// Types the saved Windows PIN on the pc's lock screen. askPin: ask for the PIN again (menu button)
    async autoUnlock(askPin: boolean) {
        if (this.unlocking) {
            return
        }
        this.unlocking = true
        try {
            const locked = await needsUnlock(this.api, this.hostId)
            if (locked == null && !askPin) {
                return
            }

            let pin = getUnlockPin(this.hostId)
            // Only asked from the menu (Unlock PC), never by itself when a stream starts
            if (!pin && !askPin) {
                return
            }
            if (askPin) {
                const typed = await askWindowsPin()
                if (typed == null) {
                    return
                }
                pin = typed.trim() || null
                setUnlockPin(this.hostId, pin)
            }
            if (!pin || locked == false) {
                return
            }

            showNotification(I.stream.unlockUnlocking, "info")
            const ok = await unlockPc(this.api, this.hostId, this.stream.getInput(), pin)
            if (!ok) {
                // Don't type a wrong PIN again at the next stream: Windows blocks the PIN after a few tries
                setUnlockPin(this.hostId, null)
            }
            showNotification(ok ? I.stream.unlockDone : I.stream.unlockFailed, ok ? "info" : "error")
        } finally {
            this.unlocking = false
        }
    }

    isGameMouse(): boolean {
        return this.gameMouse
    }
    /// capture: request the pointer lock now (needs a click or key press from the user)
    async setGameMouse(enabled: boolean, capture: boolean) {
        if (enabled == this.gameMouse) {
            return
        }
        this.gameMouse = enabled
        saveGameMousePreference(enabled)
        this.sidebar.onGameMouseChange(enabled)

        if (enabled) {
            this.mouseModeBeforeGameMouse = this.inputConfig.mouseMode == "relative" ? "follow" : this.inputConfig.mouseMode
            this.inputConfig.mouseMode = "relative"
            this.setInputConfig(this.inputConfig)

            if (capture) {
                // Fullscreen + keyboard lock: Esc goes to the game instead of releasing the mouse
                // (requestFullscreen also captures the mouse because the mouse mode is relative)
                await this.requestFullscreen()
            }
            showNotification(I.stream.gameMouseOn, "info")
        } else {
            await this.exitPointerLock()
            this.inputConfig.mouseMode = this.mouseModeBeforeGameMouse
            this.setInputConfig(this.inputConfig)
            showNotification(I.stream.gameMouseOff, "info")
        }
    }

    // Displays
    getDisplayCount(): number {
        return getDisplayCount(this.hostId)
    }
    getCurrentDisplay(): number {
        return this.displaySwitcher.getCurrent()
    }
    switchDisplay(display: number, animate = true) {
        const from = this.getCurrentDisplay()
        this.displaySwitcher.switchTo(this.stream.getInput(), display)
        if (animate && from != display) {
            this.slideToDisplay(from, display)
        }
        this.sidebar.onDisplayChange(display)
    }
    setInputConfig(config: StreamInputConfig) {
        Object.assign(this.inputConfig, config)

        this.stream.getInput().setConfig(this.inputConfig)
        this.renderLocalTouchCursor()
    }

    /// Starlight Streams: stats on / off (Ctrl+Shift+S and the sidebar)
    toggleStats() {
        const stats = this.getStream()?.getStats()
        if (stats) {
            stats.toggle()
            this.sidebar.onStatsChange(stats.isEnabled())
        }
    }

    /// Starlight Streams: stops the stream and goes back (Ctrl+Shift+Q and the sidebar)
    async exitStream() {
        const stream = this.getStream()
        if (stream) {
            const success = await stream.stop()
            if (!success) {
                console.debug("Failed to close stream correctly")
            }
        }

        exitStreamPage()
    }

    /// "H264 · 1080p · 60 fps" for the sidebar
    getStreamSummary(): string {
        const settings = this.streamSettings
        if (!settings) {
            return ""
        }
        const codec = settings.videoCodec == "auto" ? "Auto" : settings.videoCodec.toUpperCase()
        const size = settings.videoSize == "custom" ? `${settings.videoSizeCustom.width}×${settings.videoSizeCustom.height}` : settings.videoSize
        return `${codec} · ${size} · ${settings.fps} fps`
    }

    /// Starlight Streams: switching displays slides the old picture out the way the monitors sit
    /// (to the display on the right: the picture moves left, like turning your head)
    private slideToDisplay(from: number, to: number) {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            return
        }
        const displays = getCachedDisplays(this.hostId)
        const a = displays?.find(display => display.index == from)
        const b = displays?.find(display => display.index == to)
        let dx = to > from ? 1 : -1
        let dy = 0
        if (a && b && (a.x != 0 || a.y != 0 || b.x != 0 || b.y != 0)) {
            const ddx = (b.x + b.width / 2) - (a.x + a.width / 2)
            const ddy = (b.y + b.height / 2) - (a.y + a.height / 2)
            if (Math.abs(ddy) > Math.abs(ddx)) {
                dx = 0
                dy = Math.sign(ddy)
            } else {
                dx = Math.sign(ddx) || dx
            }
        }

        const video = Array.from(this.div.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>("video.video-stream, canvas.video-stream"))
            .find(element => !element.classList.contains("video-enhancer") && element.getBoundingClientRect().width > 0)
        if (!video) {
            return
        }
        const rect = video.getBoundingClientRect()
        const width = video instanceof HTMLVideoElement ? video.videoWidth : video.width
        const height = video instanceof HTMLVideoElement ? video.videoHeight : video.height
        if (width <= 0 || height <= 0) {
            return
        }
        const snap = document.createElement("canvas")
        snap.className = "sl-slide-snap"
        snap.width = width
        snap.height = height
        try {
            snap.getContext("2d")?.drawImage(video, 0, 0, width, height)
        } catch {
            return
        }
        Object.assign(snap.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
        document.body.appendChild(snap)

        // The pc needs a moment to switch: then the old picture slides out and the new one comes in
        window.setTimeout(() => {
            snap.style.transform = `translate(${-dx * 100}vw, ${-dy * 100}vh)`
            snap.style.opacity = "0.6"
            for (const element of Array.from(this.div.querySelectorAll<HTMLElement>(".video-stream"))) {
                element.animate([
                    { translate: `${dx * 35}% ${dy * 35}%`, opacity: 0.2 },
                    { translate: "0 0", opacity: 1 },
                ], { duration: 420, easing: "cubic-bezier(.6,0,.2,1)" })
            }
            window.setTimeout(() => snap.remove(), 450)
        }, 380)
    }

    /// Starlight Streams: the display overview (Ctrl+Shift+D), the mouse is needed to pick a display
    async toggleDisplayOverview() {
        if (this.displayOverview.isOpen()) {
            this.displayOverview.close()
            return
        }
        this.stream.getInput().raiseAllKeys()
        await this.exitPointerLock()
        await this.displayOverview.open()
    }

    // Keyboard
    onKeyDown(event: KeyboardEvent) {
        this.onUserInteraction()

        // The display overview is open: keys are not for the pc, Esc closes it
        if (this.displayOverview.isOpen()) {
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat && (event.code == "Escape" || (event.ctrlKey && event.shiftKey && event.code == "KeyD"))) {
                this.displayOverview.close()
            }
            return
        }

        console.debug(event)
        if (event.ctrlKey && event.shiftKey && !event.altKey && event.code == "KeyM") {
            // Starlight Streams: toggle game mouse
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat) {
                this.setGameMouse(!this.gameMouse, true)
            }
            return
        } else if (event.ctrlKey && event.shiftKey && !event.altKey && event.code == "KeyS") {
            // Starlight Streams: stats
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat) {
                this.toggleStats()
            }
            return
        } else if (event.ctrlKey && event.shiftKey && !event.altKey && event.code == "KeyQ") {
            // Starlight Streams: exit the stream
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat) {
                void this.exitStream()
            }
            return
        } else if (event.ctrlKey && event.shiftKey && !event.altKey && event.code == "KeyD") {
            // Starlight Streams: display overview
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat) {
                void this.toggleDisplayOverview()
            }
            return
        } else if (event.shiftKey && event.ctrlKey && event.code == "KeyV") {
            // We are likely pasting -> don't send keys
        } else if (event.code == "F11") {
            // Allow manual fullscreen
        } else {
            event.preventDefault()
            this.stream.getInput().onKeyDown(event)
        }

        event.stopPropagation()
    }

    private isTogglingFullscreenWithKeybind: "waitForCtrl" | "makingFullscreen" | "none" = "none"
    onKeyUp(event: KeyboardEvent) {
        this.onUserInteraction()

        event.preventDefault()
        this.stream.getInput().onKeyUp(event)
        event.stopPropagation()

        if (this.toggleFullscreenWithKeybind && this.isTogglingFullscreenWithKeybind == "none" && event.ctrlKey && event.shiftKey && event.code == "KeyI") {
            this.isTogglingFullscreenWithKeybind = "waitForCtrl"
        }
        if (this.isTogglingFullscreenWithKeybind == "waitForCtrl" && (event.code == "ControlRight" || event.code == "ControlLeft")) {
            this.isTogglingFullscreenWithKeybind = "makingFullscreen";

            (async () => {
                if (this.isFullscreen()) {
                    await this.exitPointerLock()
                    await this.exitFullscreen()
                } else {
                    await this.requestFullscreen()
                    await this.requestPointerLock()
                }

                this.isTogglingFullscreenWithKeybind = "none"
            })()
        }
    }

    onPaste(event: ClipboardEvent) {
        this.onUserInteraction()

        this.stream.getInput().onPaste(event)

        event.stopPropagation()
    }

    // Mouse
    onMouseButtonDown(event: MouseEvent) {
        // Game mouse: capture the mouse again after it was released (e.g. with Esc)
        if (this.gameMouse && !document.pointerLockElement) {
            this.requestPointerLock()
        }

        if (this.consumeAutoFullscreenInteraction()) {
            this.pendingAutoFullscreenMouseGesture = true
            event.preventDefault()
            event.stopPropagation()
            return
        }

        this.onUserInteraction()

        event.preventDefault()
        this.stream.getInput().onMouseDown(event, this.getStreamRect());

        event.stopPropagation()
    }
    onMouseButtonUp(event: MouseEvent) {
        if (this.pendingAutoFullscreenMouseGesture) {
            this.pendingAutoFullscreenMouseGesture = false
            event.preventDefault()
            event.stopPropagation()
            return
        }

        this.onUserInteraction()

        event.preventDefault()
        this.stream.getInput().onMouseUp(event)

        event.stopPropagation()
    }
    onMouseMove(event: MouseEvent) {
        if (this.pendingAutoFullscreenMouseGesture) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        event.preventDefault()
        this.stream.getInput().onMouseMove(event, this.getStreamRect())

        event.stopPropagation()
    }
    onMouseWheel(event: WheelEvent) {
        event.preventDefault()
        this.stream.getInput().onMouseWheel(event)

        event.stopPropagation()
    }
    onContextMenu(event: MouseEvent) {
        event.preventDefault()

        event.stopPropagation()
    }

    // Touch
    onTouchStart(event: TouchEvent) {
        if (this.beginAutoFullscreenTouchGesture()) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        this.onUserInteraction()

        event.preventDefault()
        this.stream.getInput().onTouchStart(event, this.getStreamRect())

        event.stopPropagation()
    }
    onTouchEnd(event: TouchEvent) {
        if (this.consumeAutoFullscreenTouchGesture()) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        this.onUserInteraction()

        event.preventDefault()
        this.stream.getInput().onTouchEnd(event, this.getStreamRect())

        event.stopPropagation()
    }
    onTouchCancel(event: TouchEvent) {
        if (this.pendingAutoFullscreenTouchGesture) {
            this.pendingAutoFullscreenTouchGesture = false
            event.preventDefault()
            event.stopPropagation()
            return
        }

        this.pendingAutoFullscreenTouchGesture = false

        this.onUserInteraction()

        event?.preventDefault()
        this.stream.getInput().onTouchCancel(event, this.getStreamRect())

        event.stopPropagation()
    }
    onTouchUpdate() {
        window.requestAnimationFrame(this.onTouchUpdate.bind(this))

        this.stream.getInput().onTouchUpdate(this.getStreamRect())
        this.updateVideoOffset()
        this.renderLocalTouchCursor()
    }
    onTouchMove(event: TouchEvent) {
        if (this.pendingAutoFullscreenTouchGesture) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        event.preventDefault()
        this.stream.getInput().onTouchMove(event, this.getStreamRect())

        event.stopPropagation()
    }

    // Gamepad
    onGamepadConnect(event: GamepadEvent) {
        this.onGamepadAdd(event.gamepad)
    }
    onGamepadAdd(gamepad: Gamepad) {
        this.stream.getInput().onGamepadConnect(gamepad)
    }
    onGamepadDisconnect(event: GamepadEvent) {
        this.stream.getInput().onGamepadDisconnect(event)
    }
    onGamepadUpdate() {
        window.requestAnimationFrame(this.onGamepadUpdate.bind(this))

        this.stream.getInput().onGamepadUpdate()
    }

    // Fullscreen
    async requestFullscreen(showEscapeWarning: boolean = true) {
        const body = document.body
        if (body) {
            if (!("requestFullscreen" in body && typeof body.requestFullscreen == "function")) {
                await showMessage(I.stream.fullscreenUnsupported)

                return
            }

            this.focusInput()

            if (!this.isFullscreen()) {
                try {
                    await body.requestFullscreen({
                        navigationUI: "hide"
                    })
                } catch (e) {
                    console.warn("failed to request fullscreen", e)
                }
            }

            try {
                await requestKeyboardLock();
                if (showEscapeWarning && !this.hasShownFullscreenEscapeWarning) {
                    showNotification(I.stream.fullscreenEscapeHint, "info")
                    this.hasShownFullscreenEscapeWarning = true
                }
            } catch (e) {
                console.warn("Keyboard lock failed, skipping notification.", e);
            }

            if (this.getStream()?.getInput().getConfig().mouseMode == "relative") {
                await this.requestPointerLock()
            }

            try {
                if (screen && "orientation" in screen) {
                    const orientation = screen.orientation

                    if ("lock" in orientation && typeof orientation.lock == "function") {
                        await orientation.lock("landscape")
                    }
                }
            } catch (e) {
                console.warn("failed to set orientation to landscape", e)
            }
        } else {
            console.warn("root element not found")
        }
    }
    async exitFullscreen() {
        if ("keyboard" in navigator && navigator.keyboard && "unlock" in navigator.keyboard) {
            await navigator.keyboard.unlock()
        }

        if ("exitFullscreen" in document && typeof document.exitFullscreen == "function") {
            await document.exitFullscreen()
        }
    }
    isFullscreen(): boolean {
        return "fullscreenElement" in document && !!document.fullscreenElement
    }
    private async onFullscreenChange() {
        if (this.isFullscreen()) {
            this.fullscreenOnNextInteractionArmed = false
            this.pendingAutoFullscreenTouchGesture = false
            this.pendingAutoFullscreenMouseGesture = false
            this.manualFullscreenExitRequested = false
        } else {
            const manualExit = this.manualFullscreenExitRequested
            this.manualFullscreenExitRequested = false

            if (this.autoEnterFullscreenOnStart && !manualExit) {
                this.armFullscreenOnNextInteraction()
            }
        }

        this.checkFullyImmersed()
    }
    markManualFullscreenExitRequested() {
        this.manualFullscreenExitRequested = true
    }

    // Pointer Lock
    async requestPointerLock(errorIfNotFound: boolean = false) {
        this.previousMouseMode = this.inputConfig.mouseMode

        const inputElement = document.getElementById("input") as HTMLDivElement

        if (inputElement && "requestPointerLock" in inputElement && typeof inputElement.requestPointerLock == "function") {
            this.focusInput()

            this.inputConfig.mouseMode = "relative"
            this.setInputConfig(this.inputConfig)

            setSidebarExtended(false)

            // Chrome refuses the lock for about a second after the user left it (e.g. with Esc):
            // try once more after that instead of showing an error
            const lockQuietly = (options?: PointerLockOptions) => {
                try {
                    Promise.resolve(inputElement.requestPointerLock(options)).catch(error => {
                        if (error instanceof Error && error.name == "SecurityError" && !document.pointerLockElement) {
                            window.setTimeout(() => {
                                if (!document.pointerLockElement) {
                                    try {
                                        Promise.resolve(inputElement.requestPointerLock()).catch(() => { })
                                    } catch {
                                        // not possible right now; the next click captures the mouse
                                    }
                                }
                            }, 1100)
                        }
                    })
                } catch {
                    // older browsers throw instead of rejecting
                }
            }

            const onLockError = () => {
                document.removeEventListener("pointerlockerror", onLockError)

                // Fallback: try to request pointer lock without options
                lockQuietly()
            }

            document.addEventListener("pointerlockerror", onLockError, { once: true })

            try {
                let promise = inputElement.requestPointerLock({
                    unadjustedMovement: true
                })

                if (promise) {
                    await promise
                } else {
                    lockQuietly()
                }
            } catch (error) {
                // Some platforms do not support unadjusted movement. If you
                // would like PointerLock anyway, request again.
                if (error instanceof Error && error.name == "NotSupportedError") {
                    lockQuietly()
                } else if (error instanceof Error && error.name == "SecurityError") {
                    // Too soon after leaving the lock: retried quietly
                    lockQuietly({ unadjustedMovement: true })
                } else {
                    throw error
                }
            } finally {
                document.removeEventListener("pointerlockerror", onLockError)
            }

        } else if (errorIfNotFound) {
            await showMessage(I.stream.pointerLockUnsupported)
        }
    }
    async exitPointerLock() {
        if ("exitPointerLock" in document && typeof document.exitPointerLock == "function") {
            document.exitPointerLock()
        }
    }
    private onPointerLockChange() {
        this.checkFullyImmersed()

        // In game mouse mode the mouse stays relative, the next click captures it again
        if (!document.pointerLockElement && !this.gameMouse) {
            this.inputConfig.mouseMode = this.previousMouseMode
            this.setInputConfig(this.inputConfig)
        }
    }

    // -- Fully immersed Fullscreen -> Fullscreen API + Pointer Lock
    private checkFullyImmersed() {
        if ("pointerLockElement" in document && document.pointerLockElement &&
            "fullscreenElement" in document && document.fullscreenElement) {
            // We're fully immersed -> remove sidebar
            setSidebar(null)
        } else {
            setSidebar(this.sidebar)
        }
    }

    private renderLocalTouchCursor() {
        const localCursorState = this.stream.getInput().getLocalCursorState()
        if (!localCursorState?.visible) {
            this.localTouchCursorDiv.hidden = true
            return
        }

        const rect = this.getStreamRect()
        if (rect.width <= 0 || rect.height <= 0) {
            this.localTouchCursorDiv.hidden = true
            return
        }

        this.localTouchCursorDiv.hidden = false
        this.localTouchCursorDiv.style.left = `${rect.left + localCursorState.x * rect.width}px`
        this.localTouchCursorDiv.style.top = `${rect.top + localCursorState.y * rect.height}px`
    }

    // -- On Screen Keyboard + Local Touch Viewport
    private streamVideoTopOffsetPx = -100000
    private keyboardHeight = 0

    onScreenKeyboardModeChange(event: KeyboardModeChangeEvent) {
        this.keyboardHeight = event.detail.keyboardHeight

        this.updateVideoOffset()
    }

    private updateVideoOffset() {
        const viewport = this.screenKeyboard.getVisibleViewport()

        if (!viewport) {
            return
        }

        // get video offset
        const visibleTop = viewport.top
        const visibleBottom = visibleTop + viewport.height - this.keyboardHeight
        const streamRect = this.getStreamRect()
        const cursor = this.stream.getInput().getLocalCursorState()

        let offset = this.getVideoCenterOffset(visibleTop, visibleBottom)
        if (cursor.visible) {
            offset = this.getVideoOffsetWithCursor(cursor.y, streamRect.height, offset, visibleTop, visibleBottom)
        }

        this.setVideoPositionAndSize(offset, viewport.height)
    }

    private getVideoCenterOffset(visibleTop: number, visibleBottom: number): number {
        const visibleHeight = visibleBottom - visibleTop
        const visibleMiddle = visibleTop + visibleHeight / 2

        return visibleMiddle
    }
    private getVideoOffsetWithCursor(
        cursorY: number,
        streamHeight: number,
        streamMiddle: number,
        visibleTop: number,
        visibleBottom: number,
    ): number {
        const safeMargin = Math.min(100, streamHeight * 0.2)
        const scaledCursorY = cursorY * streamHeight

        const streamHeightHalf = streamHeight / 2
        const streamTop = streamMiddle - streamHeightHalf
        const absoluteCursorY = streamTop + scaledCursorY

        if (absoluteCursorY < visibleTop + safeMargin) {
            const targetY = visibleTop + safeMargin

            return streamMiddle + (targetY - absoluteCursorY)
        }

        if (absoluteCursorY > visibleBottom - safeMargin) {
            const targetY = visibleBottom - safeMargin

            return streamMiddle + (targetY - absoluteCursorY)
        }

        return streamMiddle
    }

    private setVideoPositionAndSize(offset: number, height: number) {
        if (Math.abs(offset - this.streamVideoTopOffsetPx) < 1) {
            return
        }

        this.streamVideoTopOffsetPx = offset

        document.documentElement.style.setProperty(
            "--stream-video-middle",
            `${offset}px`,
        )
        document.documentElement.style.setProperty(
            "--stream-video-height",
            `${height}px`,
        )
    }

    getScreenKeyboard(): ScreenKeyboard {
        return this.screenKeyboard
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.div)
        parent.appendChild(this.screenKeyboard.getElement())
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.div)
        parent.removeChild(this.screenKeyboard.getElement())
    }

    getStreamRect(): DOMRect {
        // The bounding rect of the videoElement or canvasElement can be bigger than the actual video
        // -> We need to correct for this when sending positions, else positions are wrong
        return this.stream.getVideoRenderer()?.getStreamRect() ?? new DOMRect()
    }
    getStream(): Stream | null {
        return this.stream
    }
}

// -- Starlight Streams: settings that worked on this device

/// The settings that can stop a stream from starting on a device
const RISKY_KEYS = ["videoCodec", "hdr", "fps", "videoSize", "videoSizeCustom", "dataTransport", "forceVideoElementRenderer", "canvasRenderer", "canvasVsync"] as const
type RiskySettings = Pick<Settings, typeof RISKY_KEYS[number]>

/// Used when nothing worked on this device yet
const SAFE_SETTINGS: Partial<RiskySettings> = {
    videoCodec: "h264", hdr: false, fps: 60, videoSize: "1080p", dataTransport: "auto",
    forceVideoElementRenderer: false, canvasRenderer: false, canvasVsync: false,
}

function loadWorkingSettings(): Partial<RiskySettings> | null {
    try {
        return JSON.parse(localStorage.getItem("starlight-working-settings") ?? "null")
    } catch {
        return null
    }
}
function saveWorkingSettings(settings: Settings) {
    const working: Partial<RiskySettings> = {}
    for (const key of RISKY_KEYS) {
        (working as any)[key] = settings[key]
    }
    try {
        localStorage.setItem("starlight-working-settings", JSON.stringify(working))
    } catch {
        // storage might be unavailable
    }
}

/// The risky settings that differ from the ones that worked (or the safe ones), with those values
function workingFallback(settings: Settings): { changes: Partial<RiskySettings>, names: Array<string> } {
    const working = { ...SAFE_SETTINGS, ...(loadWorkingSettings() ?? {}) }
    const changes: Partial<RiskySettings> = {}
    const names: Array<string> = []
    for (const key of RISKY_KEYS) {
        const value = (working as any)[key]
        if (value !== undefined && JSON.stringify(value) != JSON.stringify(settings[key])) {
            (changes as any)[key] = value
            names.push(settingLabel(key, settings))
        }
    }
    return { changes, names }
}

function settingLabel(key: typeof RISKY_KEYS[number], settings: Settings): string {
    switch (key) {
        case "videoCodec": return settings.videoCodec.toUpperCase()
        case "hdr": return "HDR"
        case "fps": return `${settings.fps} fps`
        case "videoSize": return settings.videoSize == "custom" ? `${settings.videoSizeCustom.width}×${settings.videoSizeCustom.height}` : settings.videoSize
        case "videoSizeCustom": return `${settings.videoSizeCustom.width}×${settings.videoSizeCustom.height}`
        case "dataTransport": return settings.dataTransport
        default: return key
    }
}

/// Starlight Streams: the last picture of the stream, kept on screen while the stream is replaced
/// (quality change) or reconnects (blurred), so it never goes black.
class FrozenFrame {
    private root = el("div", "sl-freeze")
    private label = el("div", "sl-freeze-label")
    private text = el("span")

    private constructor(source: HTMLVideoElement | HTMLCanvasElement | null) {
        if (source) {
            const rect = source.getBoundingClientRect()
            const canvas = el("canvas")
            const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width
            const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height
            if (width > 0 && height > 0 && rect.width > 0) {
                canvas.width = width
                canvas.height = height
                try {
                    canvas.getContext("2d")?.drawImage(source, 0, 0, width, height)
                } catch {
                    // nothing to copy: black
                }
                Object.assign(canvas.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
                this.root.appendChild(canvas)
            }
        }
        this.label.append(el("span", "sl-spinner sl-spinner--night"), this.text)
        this.root.appendChild(this.label)
        document.body.appendChild(this.root)
    }

    /// The screenshot from the start animation on the home page, until the live picture is there
    static fromImage(url: string): FrozenFrame {
        const frame = new FrozenFrame(null)
        const image = el("img")
        image.alt = ""
        image.src = url
        frame.root.insertBefore(image, frame.label)
        frame.show("", false)
        return frame
    }

    static capture(parent: HTMLElement): FrozenFrame {
        const sources = Array.from(parent.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>("video.video-stream, canvas.video-stream"))
            .filter(element => !element.classList.contains("video-enhancer") && element.getBoundingClientRect().width > 0)
        return new FrozenFrame(sources[0] ?? null)
    }

    show(text: string, blur: boolean) {
        this.text.textContent = text
        this.label.hidden = text == ""
        this.root.classList.toggle("is-blurred", blur)
        this.root.classList.remove("is-leaving")
    }

    fadeOut(delay: number) {
        window.setTimeout(() => {
            this.root.classList.add("is-leaving")
            window.setTimeout(() => this.remove(), 300)
        }, delay)
    }

    remove() {
        this.root.remove()
    }
}

/// Starlight Streams: the connect card (design/screens/S-Stream-States): TEST · CONNECT · PLAY,
/// a title, the logs, and Retry when it fails.
class ConnectionInfoModal implements Modal<void> {

    private eventTarget = new EventTarget()

    private root = el("div", "sl-connect")
    private steps = el("div", "sl-steps")
    private stepElements: Array<HTMLElement> = []
    private spinner = el("span", "sl-spinner sl-spinner--lg")
    private bang = el("span", "sl-num sl-red sl-connect-bang", "!")
    private title = el("h2", "sl-h3 sl-connect-title")
    private subtitle = el("p", "sl-ink2 sl-connect-sub")
    private logButton = button("sl-link sl-connect-logs", I.stream.showLogs, "terminal")
    private log = el("pre", "sl-log")
    private foot = el("div", "sl-connect-foot")
    private closeButton = button("sl-btn sl-btn-quiet", I.stream.close)
    private retryButton = button("sl-btn sl-btn-ink", I.stream.retry, "retry")
    /// Starlight Streams: the display number that grows into the picture when the stream starts
    private launch = el("div", "sl-connect-launch", "01")
    private onLaunched: (() => void) | null = null

    private textTy: LogMessageType | null = null
    private failed = false
    /// While the page reconnects by itself, errors are only logged
    private quiet = false

    constructor() {
        for (const name of [I.stream.stepTest, I.stream.stepConnect, I.stream.stepPlay]) {
            const step = el("span", undefined, name)
            this.stepElements.push(step)
            this.steps.appendChild(step)
        }
        this.bang.hidden = true
        this.log.hidden = true
        this.retryButton.hidden = true

        this.logButton.addEventListener("click", () => this.setLogsOpen(this.log.hidden))
        this.closeButton.addEventListener("click", this.onClose.bind(this))
        this.retryButton.addEventListener("click", () => window.location.reload())
        this.foot.append(this.closeButton, this.retryButton)

        this.root.append(this.steps, this.spinner, this.bang, this.title, this.subtitle, this.logButton, this.log, this.foot, this.launch)
        this.setStep(0)
    }

    /// 0 = testing the connection, 1 = connecting, 2 = playing
    setStep(step: number) {
        this.stepElements.forEach((element, index) => {
            element.className = index < step ? "is-done" : index == step ? "is-now" : ""
            element.textContent = (index < step ? "✓ " : "") + [I.stream.stepTest, I.stream.stepConnect, I.stream.stepPlay][index]
        })
        if (!this.failed) {
            this.title.textContent = step == 0 ? I.stream.autoQualityMeasuring : I.stream.connecting
            this.subtitle.textContent = step == 0 ? I.stream.findingQuality : this.subtitle.textContent
        }
    }
    setSubtitle(text: string) {
        if (!this.failed) {
            this.subtitle.textContent = text
        }
    }

    private setLogsOpen(open: boolean) {
        this.log.hidden = !open
        this.logButton.replaceChildren(icon("terminal"), open ? I.stream.hideLogs : I.stream.showLogs)
        if (open) {
            this.log.scrollTop = this.log.scrollHeight
        }
    }

    private debugLog(line: string, type?: LogMessageType | null) {
        const time = new Date().toTimeString().slice(0, 8)
        const row = el("div", type == "fatal" || type == "fatalDescription" ? "err" : type == "informError" || type == "ifErrorDescription" ? "warn" : undefined)
        row.append(el("span", "t", `${time} `), line)
        this.log.appendChild(row)
        this.log.scrollTop = this.log.scrollHeight
        console.info(`[Stream]: ${line}`)
    }

    /// The display that will be shown, and what to do when the card has grown into the picture
    setLaunch(display: number, onLaunched: () => void) {
        this.launch.textContent = String(display).padStart(2, "0")
        this.onLaunched = onLaunched
    }

    setQuiet(quiet: boolean) {
        this.quiet = quiet
    }

    showFailure(message: string) {
        this.fail(message)
        showModal(this)
    }

    private fail(message: string) {
        this.failed = true
        this.spinner.hidden = true
        this.bang.hidden = false
        this.title.textContent = I.stream.couldNotConnect
        this.subtitle.textContent = message
        this.retryButton.hidden = false
        this.setLogsOpen(true)
    }

    onInfo(event: InfoEvent) {
        const data = event.detail

        if (data.type == "connectionComplete") {
            this.debugLog(I.stream.connectionComplete)
            this.setStep(2)
            this.failed = false

            // The card is on screen: the display number grows into the picture, then it's gone
            const overlay = document.getElementById("modal-overlay")
            const visible = overlay != null && !overlay.hidden && this.root.isConnected
            const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            if (!visible) {
                // No card on screen (the normal start): just fade the picture in
                this.onLaunched?.()
                showModal(null)
            } else if (!reduced) {
                this.root.classList.add("is-launching")
                overlay.classList.add("is-launching")
                this.onLaunched?.()
                window.setTimeout(() => {
                    showModal(null)
                    this.root.classList.remove("is-launching")
                    overlay.classList.remove("is-launching")
                }, 650)
            } else {
                showModal(null)
            }
        } else if (data.type == "addDebugLine") {
            const message = data.line.trim()
            if (message) {
                this.debugLog(message, data.additional?.type)

                if (!this.textTy) {
                    this.textTy = data.additional?.type ?? null
                }
            }

            if (this.quiet) {
                // reconnecting: only logged
            } else if (data.additional?.type == "fatal" || data.additional?.type == "fatalDescription") {
                this.fail(message)
                showModal(this)
            } else if (data.additional?.type == "informError") {
                showNotification(data.line)
            }
        }
    }

    onClose() {
        showModal(null)
    }

    onFinish(abort: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            this.eventTarget.addEventListener("ml-connected", () => resolve(), { once: true, signal: abort })
        })
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.root)
    }
    unmount(parent: HTMLElement): void {
        if (this.root.parentElement == parent) {
            parent.removeChild(this.root)
        }
    }
}

/// Starlight Streams: "Type your Windows PIN" (design/screens/S-Stream-States, 05). Null when cancelled
function askWindowsPin(): Promise<string | null> {
    const modal = openSlModal({ title: I.stream.typePin, label: I.stream.pcLocked, size: "sm" })
    const input = el("input", "sl-input sl-input-pin")
    input.type = "password"
    input.inputMode = "numeric"
    input.autocomplete = "off"
    input.setAttribute("aria-label", I.stream.typePin)
    const note = el("p", "sl-help sl-pin-note")
    note.append(icon("shield"), I.stream.savedInBrowser)
    modal.body.append(input, note)

    return new Promise(resolve => {
        let result: string | null = null
        const cancel = button("sl-btn sl-btn-quiet", I.modal.cancel)
        cancel.addEventListener("click", () => modal.close())
        const ok = el("button", "sl-btn sl-btn-ink")
        ok.type = "button"
        ok.append(I.modal.ok, el("span", undefined, "→"))
        const submit = () => {
            result = input.value
            modal.close()
        }
        ok.addEventListener("click", submit)
        input.addEventListener("keydown", event => {
            if (event.key == "Enter") {
                submit()
            }
        })
        modal.foot.append(cancel, ok)
        modal.closed.then(() => resolve(result))
    })
}

/// Shown from the start (during the speed test) until the stream plays
const CONNECT_CARD = new ConnectionInfoModal()

/// Starlight Streams: the stream sidebar (design/screens/S-Sidebar)
class ViewerSidebar implements Component, Sidebar, ScreenKeyboardListener {
    private app: ViewerApp

    private div = el("div", "sl-side")

    private title = el("span", "sl-h3 sl-side-title", I.stream.streamTitle)
    private summary = el("span", "sl-mono sl-muted sl-side-summary")

    private gameMouseRow = el("button", "sl-side-row sl-side-game-mouse")
    private gameMouseState = el("span", "sl-mono sl-muted")
    private gameMouseSwitch = el("span", "sl-switch")

    private statsRow: HTMLButtonElement

    private mouseMode = el("select", "sl-select")
    private touchMode = el("select", "sl-select")

    private displayButtons: Array<HTMLButtonElement> = []
    private displayButtonRow = el("div", "sl-cells sl-cells--num")

    constructor(app: ViewerApp) {
        this.app = app

        // -- Head: what's streaming
        const head = el("div", "sl-side-head")
        const titles = el("div", "sl-side-titles")
        titles.append(el("span", "sl-label", I.stream.streaming), this.title, this.summary)
        const close = el("button", "sl-btn sl-btn-quiet sl-btn-icon sl-btn-sm")
        close.type = "button"
        close.setAttribute("aria-label", I.stream.closeSidebar)
        close.appendChild(icon("chevronLeft"))
        close.addEventListener("click", () => setSidebarExtended(false))
        head.append(titles, close)

        // -- Game mouse
        this.gameMouseRow.type = "button"
        const gameMouseText = el("span", "sl-side-game-mouse-text")
        gameMouseText.append(el("span", "title", I.stream.gameMouse), this.gameMouseState)
        this.gameMouseSwitch.setAttribute("role", "switch")
        this.gameMouseSwitch.setAttribute("aria-label", I.stream.gameMouse)
        this.gameMouseRow.append(gameMouseText, this.gameMouseSwitch)
        this.gameMouseRow.addEventListener("click", () => this.app.setGameMouse(!this.app.isGameMouse(), true))
        this.onGameMouseChange(false)

        // -- Unlock the pc's lock screen with the Windows PIN
        const unlock = this.row("key", I.stream.unlockButtonPlain)
        unlock.addEventListener("click", () => this.app.autoUnlock(true))

        // -- Displays
        const displays = el("div", "sl-side-block")
        this.renderDisplayButtons()
        displays.append(el("span", "sl-label", I.stream.display), this.displayButtonRow, el("span", "sl-muted sl-side-hint", I.stream.displayHotkeyHint))

        // -- Actions
        const fullscreen = this.row("fullscreen", I.stream.fullscreen, "F11")
        fullscreen.addEventListener("click", async () => {
            if (this.app.isFullscreen()) {
                this.app.markManualFullscreenExitRequested()
                await this.app.exitFullscreen()
            } else {
                await this.app.requestFullscreen()
            }
        })
        const lockMouse = this.row("lock", I.stream.lockMouse)
        lockMouse.addEventListener("click", async () => {
            await this.app.requestPointerLock(true)
        })
        const keyboard = this.row("keyboard", I.stream.keyboard)
        keyboard.addEventListener("click", async () => {
            setSidebarExtended(false)
            this.app.getScreenKeyboard().setVisible(true)
        })
        const sendKeycode = this.row("hash", I.stream.sendKeycode)
        sendKeycode.addEventListener("click", async () => {
            const key = await showModal(new SendKeycodeModal())

            if (key == null) {
                return
            }

            this.app.getStream()?.getInput().sendKey(true, key, emptyKeyModifiers())
            this.app.getStream()?.getInput().sendKey(false, key, emptyKeyModifiers())
        })
        this.statsRow = this.row("stats", I.stream.stats, "Ctrl Shift S")
        this.statsRow.addEventListener("click", () => this.app.toggleStats())

        // -- Mouse and touch mode
        const modes = el("div", "sl-side-block sl-side-modes")
        const mouseField = el("div", "sl-field")
        mouseField.append(el("span", "sl-label", I.stream.mouseMode), this.mouseMode)
        const touchField = el("div", "sl-field")
        touchField.append(el("span", "sl-label", I.stream.touchMode), this.touchMode)
        modes.append(mouseField, touchField)
        this.fillSelect(this.mouseMode, [
            { value: "relative", name: I.stream.relative },
            { value: "follow", name: I.stream.follow },
            { value: "localCursor", name: I.stream.localCursor },
            { value: "pointAndDrag", name: I.stream.pointAndDrag }
        ], this.app.getInputConfig().mouseMode)
        this.mouseMode.setAttribute("aria-label", I.stream.mouseMode)
        this.mouseMode.addEventListener("change", this.onMouseModeChange.bind(this))
        this.fillSelect(this.touchMode, [
            { value: "touch", name: I.stream.touch },
            { value: "mouseRelative", name: I.stream.relative },
            { value: "localCursor", name: I.stream.localCursor },
            { value: "pointAndDrag", name: I.stream.pointAndDrag }
        ], this.app.getInputConfig().touchMode)
        this.touchMode.setAttribute("aria-label", I.stream.touchMode)
        this.touchMode.addEventListener("change", this.onTouchModeChange.bind(this))

        // -- Exit, pinned at the bottom
        const exit = button("sl-side-row sl-side-row--exit", I.stream.exitStream, "exit")
        exit.appendChild(el("span", "key", "Ctrl Shift Q"))
        exit.addEventListener("click", () => this.app.exitStream())

        this.div.append(head, this.gameMouseRow, unlock, displays, fullscreen, lockMouse, keyboard, sendKeycode, this.statsRow, modes, exit)
        this.updateSummary()
    }

    private row(iconName: Parameters<typeof icon>[0], text: string, key?: string): HTMLButtonElement {
        const row = button("sl-side-row", text, iconName)
        row.appendChild(el("span", "key", key ?? ""))
        return row
    }

    private fillSelect(select: HTMLSelectElement, options: Array<{ value: string, name: string }>, value: string) {
        for (const option of options) {
            const element = el("option", undefined, option.name)
            element.value = option.value
            select.appendChild(element)
        }
        select.value = value
    }

    /// "Gaming-PC" / the game, and "H264 · 1080p · 60 fps"
    setTitle(title: string) {
        this.title.textContent = title
    }
    updateSummary() {
        this.summary.textContent = this.app.getStreamSummary()
    }

    onStatsChange(shown: boolean) {
        this.statsRow.setAttribute("aria-pressed", shown ? "true" : "false")
    }

    onGameMouseChange(enabled: boolean) {
        this.gameMouseState.textContent = `${enabled ? I.stream.on : I.stream.off} · Ctrl Shift M`
        this.gameMouseSwitch.setAttribute("aria-checked", enabled ? "true" : "false")
    }

    onDisplayChange(display: number) {
        this.displayButtons.forEach((button, index) => {
            button.setAttribute("aria-pressed", index + 1 == display ? "true" : "false")
        })
    }

    onCapabilitiesChange(capabilities: StreamCapabilities) {
        const touch = this.touchMode.querySelector<HTMLOptionElement>('option[value="touch"]')
        if (touch) {
            touch.disabled = !capabilities.touch
        }
        this.updateSummary()
    }

    // -- Keyboard
    onText(event: TextEvent) {
        this.app.getStream()?.getInput().sendText(event.detail.text)
    }
    /// One button per display of the pc
    renderDisplayButtons() {
        this.displayButtonRow.replaceChildren()
        this.displayButtons = []
        for (let display = 1; display <= this.app.getDisplayCount(); display++) {
            const cell = el("button", "sl-cell", `${display}`)
            cell.type = "button"
            cell.setAttribute("aria-label", getTranslations(getCurrentLanguage()).host.displayName(display))
            cell.addEventListener("click", () => this.app.switchDisplay(display))
            this.displayButtonRow.appendChild(cell)
            this.displayButtons.push(cell)
        }
        this.onDisplayChange(this.app.getCurrentDisplay())
    }

    onKeyDown(event: KeyboardEvent) {
        this.app.getStream()?.getInput().onKeyDown(event)
    }
    onKeyUp(event: KeyboardEvent) {
        this.app.getStream()?.getInput().onKeyUp(event)
    }
    onKeyboardModeChange(event: KeyboardModeChangeEvent): void {
        this.app.onScreenKeyboardModeChange(event)
    }

    // -- Mouse Mode
    private onMouseModeChange() {
        const config = this.app.getInputConfig()
        config.mouseMode = this.mouseMode.value as any
        this.app.setInputConfig(config)
    }

    // -- Touch Mode
    private onTouchModeChange() {
        const config = this.app.getInputConfig()
        config.touchMode = this.touchMode.value as any
        this.app.setInputConfig(config)
    }

    extended(): void {
        this.updateSummary()
    }
    unextend(): void {

    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.div)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.div)
    }
}

class SendKeycodeModal extends FormModal<number> {

    private dropdownSearch: SelectComponent

    constructor() {
        super()

        const keyList = []
        for (const keyNameRaw in StreamKeys) {
            const keyName = keyNameRaw as keyof typeof StreamKeys
            const keyValue = StreamKeys[keyName]

            const PREFIX = "VK_"

            let name: string = keyName
            if (name.startsWith(PREFIX)) {
                name = name.slice(PREFIX.length)
            }

            keyList.push({
                value: keyValue.toString(),
                name
            })
        }

        this.dropdownSearch = new SelectComponent("winKeycode", keyList, {
            hasSearch: true,
            displayName: I.stream.selectKeycode
        })
    }

    mountForm(form: HTMLElement): void {
        this.dropdownSearch.mount(form)
    }


    reset(): void {
        this.dropdownSearch.reset()
    }

    submit(): number | null {
        const keyString = this.dropdownSearch.getValue()
        if (keyString == null) {
            return null
        }

        return parseInt(keyString)
    }
}

function exitStreamPage() {
    if (window.matchMedia('(display-mode: standalone)').matches && history.length > 1) {
        history.back()
    } else {
        window.close()

        // Browsers may refuse to close a tab opened directly by the user.
        // In that case, return to the app list instead of leaving a dead viewer.
        window.setTimeout(() => {
            if (!window.closed) {
                window.location.replace(buildUrl("/"))
            }
        }, 0)
    }
}

// Stop propagation so the stream doesn't get it
export function stopPropagationOn(element: HTMLElement) {
    element.addEventListener("keydown", onStopPropagation)
    element.addEventListener("keyup", onStopPropagation)
    element.addEventListener("keypress", onStopPropagation)
    element.addEventListener("click", onStopPropagation)
    element.addEventListener("mousedown", onStopPropagation)
    element.addEventListener("mouseup", onStopPropagation)
    element.addEventListener("mousemove", onStopPropagation)
    element.addEventListener("wheel", onStopPropagation)
    element.addEventListener("contextmenu", onStopPropagation)
    element.addEventListener("touchstart", onStopPropagation)
    element.addEventListener("touchmove", onStopPropagation)
    element.addEventListener("touchend", onStopPropagation)
    element.addEventListener("touchcancel", onStopPropagation)
}
function onStopPropagation(event: Event) {
    event.stopPropagation()
}

// Starlight Streams: remember game mouse between streams
const GAME_MOUSE_KEY = "starlight-game-mouse"
function loadGameMousePreference(): boolean {
    try {
        return localStorage.getItem(GAME_MOUSE_KEY) == "1"
    } catch (e) {
        return false
    }
}
function saveGameMousePreference(enabled: boolean) {
    try {
        localStorage.setItem(GAME_MOUSE_KEY, enabled ? "1" : "0")
    } catch (e) {
        // storage might be unavailable
    }
}
