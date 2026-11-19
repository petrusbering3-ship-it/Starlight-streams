import { Api, apiHostDisplays, apiHostSession, fetchApi } from "../api"
import { HostDisplay } from "../api_bindings"
import { getCachedDisplays, getDisplayCount } from "./display"
import { getCurrentLanguage, getTranslations } from "../i18n"
import { el, icon } from "../icons"

// Starlight Streams: the screens overview (Ctrl+Shift+D, design/screens/S-Displays + S-Displays-Motion).
// The pc's displays laid out like in the Windows display settings. The streamed display is live
// (mirrored from the stream, never a second stream), the others are screenshots the pc takes every
// 1.5 s while the overview is open. Click a screen to zoom into it and stream it, Esc goes back.

const FADE_MS = 220
const ZOOM_MS = 320
const STAGGER_MS = 40
const THUMBNAIL_INTERVAL_MS = 1500
const INSET = 7

type Rect = { left: number, top: number, width: number, height: number }

type Screen = {
    display: HostDisplay
    element: HTMLButtonElement
    pic: HTMLDivElement
    status: HTMLElement
    rect: Rect
    image: HTMLImageElement | null
    imageUrl: string | null
    updatedAt: number | null
}

/// The displays with a position; older power agents report none, then they are placed side by side
function layout(displays: Array<HostDisplay>): Array<{ display: HostDisplay, x: number, y: number }> {
    const hasPositions = displays.some(display => display.x != 0 || display.y != 0)
    if (hasPositions || displays.length == 1) {
        return displays.map(display => ({ display, x: display.x, y: display.y }))
    }
    let x = 0
    return displays.map(display => {
        const placed = { display, x, y: 0 }
        x += display.width
        return placed
    })
}

/// Displays of unknown size, when the pc never told
function placeholderDisplays(count: number): Array<HostDisplay> {
    return Array.from({ length: count }, (_, i) => ({
        index: i + 1, name: "", width: 1920, height: 1080, refresh_rate: 60, primary: i == 0, x: 0, y: 0,
    }))
}

function windowRect(): Rect {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

function place(element: HTMLElement, rect: Rect) {
    element.style.left = `${rect.left}px`
    element.style.top = `${rect.top}px`
    element.style.width = `${rect.width}px`
    element.style.height = `${rect.height}px`
}

export class DisplayOverview {
    private api: Api
    private hostId: number
    private getCurrentDisplay: () => number
    private onPick: (display: number, name: string) => void
    private getPcName: () => string

    private root: HTMLDivElement | null = null
    private screens: Array<Screen> = []
    private liveCanvas: HTMLCanvasElement | null = null
    private animationFrame: number | null = null
    private thumbnailTimer: number | null = null
    private clockTimer: number | null = null
    private locked = false
    private busy = false

    constructor(api: Api, hostId: number, getCurrentDisplay: () => number, onPick: (display: number, name: string) => void, getPcName: () => string = () => "") {
        this.api = api
        this.hostId = hostId
        this.getCurrentDisplay = getCurrentDisplay
        this.onPick = onPick
        this.getPcName = getPcName
    }

    isOpen(): boolean {
        return this.root != null
    }

    async open() {
        if (this.root || this.busy) {
            return
        }
        this.busy = true
        const i = getTranslations(getCurrentLanguage())

        let displays = getCachedDisplays(this.hostId) ?? placeholderDisplays(getDisplayCount(this.hostId))
        const [fetched, session] = await Promise.all([
            apiHostDisplays(this.api, { host_id: this.hostId }).then(response => response.displays).catch(() => []),
            apiHostSession(this.api, { host_id: this.hostId }).catch(() => null),
        ])
        if (fetched.length > 0) {
            displays = fetched
        }
        this.locked = session != null && (!session.logged_in || session.locked)

        const root = el("div", "sl sl-overview")
        root.setAttribute("role", "dialog")
        root.setAttribute("aria-label", i.stream.screens)
        const backdrop = el("div", "sl-overview-backdrop")
        root.appendChild(backdrop)

        // Clicks and keys here are not for the pc
        for (const type of ["mousedown", "mouseup", "mousemove", "wheel", "contextmenu", "touchstart", "touchmove", "touchend", "keydown", "keyup"]) {
            root.addEventListener(type, event => event.stopPropagation())
        }
        backdrop.addEventListener("click", () => this.close())

        // Head and foot
        const head = el("div", "sl-overview-head")
        const titles = el("div", "sl-overview-titles")
        const pcName = this.getPcName()
        titles.append(el("span", "sl-label", [pcName, i.stream.displayCount(displays.length)].filter(Boolean).join(" · ")), el("h2", "sl-h2", i.stream.screens))
        const help = el("div", "sl-overview-help")
        const keys = el("div", "sl-overview-keys")
        keys.append(el("span", "sl-kbd", "Ctrl"), el("span", "sl-kbd", "Shift"), el("span", "sl-kbd", "D"), el("span", undefined, i.stream.closeOverview))
        help.append(keys, el("span", undefined, i.stream.clickScreen))
        const foot = el("div", "sl-overview-foot")
        foot.appendChild(el("span", "sl-label", i.stream.layoutFromWindows))
        root.append(head, foot)
        head.append(titles, help)

        // Fit the whole desktop into 84% of the width and 52% of the height, centred
        const placed = layout(displays)
        const minX = Math.min(...placed.map(p => p.x))
        const minY = Math.min(...placed.map(p => p.y))
        const maxX = Math.max(...placed.map(p => p.x + p.display.width))
        const maxY = Math.max(...placed.map(p => p.y + p.display.height))
        const scale = Math.min(window.innerWidth * 0.84 / (maxX - minX), window.innerHeight * 0.52 / (maxY - minY))
        const offsetX = (window.innerWidth - (maxX - minX) * scale) / 2
        const offsetY = (window.innerHeight - (maxY - minY) * scale) / 2 - 20

        const current = this.getCurrentDisplay()
        const currentPlaced = placed.find(p => p.display.index == current) ?? placed[0]
        this.screens = []
        for (const { display, x, y } of placed) {
            const isCurrent = display.index == current
            const rect: Rect = {
                left: offsetX + (x - minX) * scale + INSET,
                top: offsetY + (y - minY) * scale + INSET,
                width: display.width * scale - INSET * 2,
                height: display.height * scale - INSET * 2,
            }

            const element = el("button", isCurrent ? "sl-screen is-current" : "sl-screen")
            element.type = "button"
            element.setAttribute("aria-label", `${i.host.displayName(display.index)}${display.name ? ` · ${display.name}` : ""}`)
            const pic = el("div", "pic")

            let image: HTMLImageElement | null = null
            if (isCurrent) {
                // The streamed display: mirrored from the stream every frame
                const canvas = el("canvas")
                Object.assign(canvas.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" })
                pic.appendChild(canvas)
                this.liveCanvas = canvas
            } else if (this.locked) {
                pic.classList.add("is-loading", "sl-screen-locked")
                pic.append(icon("lock"), el("span", undefined, i.stream.locked))
            } else {
                pic.classList.add("is-loading")
                pic.appendChild(el("span", "sl-spinner sl-spinner--night"))
                image = el("img")
                image.alt = ""
                image.style.opacity = "0"
                image.addEventListener("load", () => {
                    image!.style.opacity = "1"
                    pic.classList.remove("is-loading")
                    pic.querySelector(".sl-spinner")?.remove()
                })
                pic.appendChild(image)
            }

            const cap = el("div", "sl-screen-cap")
            const titleLine = el("span", "sl-screen-cap-title")
            titleLine.append(el("span", "n", String(display.index).padStart(2, "0")), el("span", "name", display.name || i.host.displayName(display.index)))
            const status = el("span", isCurrent ? "sl-label live" : "sl-label")
            status.textContent = isCurrent ? `● ${i.stream.liveHere}` : this.locked ? i.stream.screenLocked : i.stream.loadingShot
            cap.append(titleLine, el("span", "sl-mono res", `${display.width}×${display.height}`), status)

            element.append(pic, cap)
            element.addEventListener("click", event => {
                event.stopPropagation()
                this.pick(display.index)
            })
            root.appendChild(element)

            this.screens.push({ display, element, pic, status, rect, image, imageUrl: null, updatedAt: null })
        }

        // Start: the live screen covers the window, the others wait below their slot
        for (const screen of this.screens) {
            const isCurrent = screen.display.index == currentPlaced.display.index
            place(screen.element, isCurrent ? windowRect() : screen.rect)
            if (!isCurrent) {
                screen.element.style.opacity = "0"
                screen.element.style.transform = "translateY(14px)"
            }
        }
        root.classList.add("is-starting")

        document.body.appendChild(root)
        this.root = root
        this.busy = false

        this.drawLive()
        this.refreshThumbnails()
        this.thumbnailTimer = window.setInterval(() => this.refreshThumbnails(), THUMBNAIL_INTERVAL_MS)
        this.clockTimer = window.setInterval(() => this.updateClocks(), 1000)

        // Animate in: backdrop, live screen into its slot, the others staggered by distance, captions last
        requestAnimationFrame(() => requestAnimationFrame(() => {
            root.classList.add("is-open")
            const center = currentPlaced
            const live = this.screens.find(screen => screen.display.index == center.display.index)
            if (live) {
                place(live.element, live.rect)
            }
            const others = this.screens.filter(screen => screen != live)
                .sort((a, b) => Math.hypot(a.rect.left - (live?.rect.left ?? 0), a.rect.top - (live?.rect.top ?? 0)) - Math.hypot(b.rect.left - (live?.rect.left ?? 0), b.rect.top - (live?.rect.top ?? 0)))
            others.forEach((screen, index) => {
                screen.element.style.transitionDelay = `${60 + index * STAGGER_MS}ms`
                screen.element.style.opacity = ""
                screen.element.style.transform = ""
            })
            window.setTimeout(() => {
                root.classList.remove("is-starting")
                for (const screen of this.screens) {
                    screen.element.style.transitionDelay = ""
                }
            }, ZOOM_MS + FADE_MS)
        }))
    }

    /// Zooms into the screen, then streams it
    private pick(display: number) {
        if (!this.root || this.busy) {
            return
        }
        const screen = this.screens.find(screen => screen.display.index == display)
        if (!screen || display == this.getCurrentDisplay()) {
            this.close()
            return
        }
        this.busy = true
        this.stopUpdates()

        screen.element.classList.add("is-zooming")
        place(screen.element, windowRect())
        for (const other of this.screens) {
            if (other != screen) {
                other.element.style.opacity = "0"
            }
        }
        this.root.classList.remove("is-open")

        window.setTimeout(() => {
            this.onPick(display, screen.display.name)
            this.remove()
        }, ZOOM_MS)
    }

    /// The reverse of opening: the live screen grows back, nothing is switched
    close() {
        if (!this.root || this.busy) {
            return
        }
        this.busy = true
        this.stopUpdates()

        const live = this.screens.find(screen => screen.display.index == this.getCurrentDisplay())
        if (live) {
            live.element.classList.add("is-zooming")
            place(live.element, windowRect())
        }
        for (const screen of this.screens) {
            if (screen != live) {
                screen.element.style.opacity = "0"
                screen.element.style.transform = "translateY(14px)"
            }
        }
        this.root.classList.remove("is-open")
        window.setTimeout(() => this.remove(), ZOOM_MS)
    }

    private stopUpdates() {
        if (this.thumbnailTimer != null) {
            window.clearInterval(this.thumbnailTimer)
            this.thumbnailTimer = null
        }
        if (this.clockTimer != null) {
            window.clearInterval(this.clockTimer)
            this.clockTimer = null
        }
    }

    private remove() {
        this.stopUpdates()
        if (this.animationFrame != null) {
            cancelAnimationFrame(this.animationFrame)
            this.animationFrame = null
        }
        for (const screen of this.screens) {
            if (screen.imageUrl) {
                URL.revokeObjectURL(screen.imageUrl)
            }
        }
        this.screens = []
        this.liveCanvas = null
        this.root?.remove()
        this.root = null
        this.busy = false
    }

    private drawLive() {
        const canvas = this.liveCanvas
        if (!canvas || !this.root) {
            return
        }
        const video = document.querySelector("video.video-stream") as HTMLVideoElement | null
        if (video && video.videoWidth > 0) {
            if (canvas.width != video.videoWidth || canvas.height != video.videoHeight) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
            }
            canvas.getContext("2d")?.drawImage(video, 0, 0)
        }
        this.animationFrame = requestAnimationFrame(() => this.drawLive())
    }

    private updateClocks() {
        const i = getTranslations(getCurrentLanguage()).stream
        for (const screen of this.screens) {
            if (screen.updatedAt != null) {
                screen.status.textContent = i.updatedAgo(Math.max(1, Math.round((Date.now() - screen.updatedAt) / 1000)))
            }
        }
    }

    private refreshThumbnails() {
        for (const screen of this.screens) {
            if (!screen.image) {
                continue
            }
            fetchApi(this.api, "/host/display-thumbnail", "GET", {
                response: "ignore",
                query: { host_id: this.hostId, index: screen.display.index },
            }).then(response => response.ok ? response.blob() : null).then(blob => {
                if (!blob || !this.root || !screen.image) {
                    return
                }
                // Cross-fade: the new picture fades in over the old one
                const next = el("img")
                next.alt = ""
                next.className = "sl-screen-next"
                const url = URL.createObjectURL(blob)
                next.addEventListener("load", () => {
                    const old = screen.image
                    const oldUrl = screen.imageUrl
                    requestAnimationFrame(() => next.style.opacity = "1")
                    window.setTimeout(() => {
                        old?.remove()
                        if (oldUrl) {
                            URL.revokeObjectURL(oldUrl)
                        }
                    }, 220)
                    screen.image = next
                    screen.imageUrl = url
                    screen.updatedAt = Date.now()
                    screen.pic.classList.remove("is-loading")
                    screen.pic.querySelector(".sl-spinner")?.remove()
                    this.updateClocks()
                }, { once: true })
                next.style.opacity = "0"
                next.src = url
                screen.pic.appendChild(next)
            }).catch(() => {
                // the first screenshot takes a moment
            })
        }
    }
}
