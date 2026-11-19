import { Api, apiHostDisplays, fetchApi } from "../api"
import { HostDisplay } from "../api_bindings"
import { getCachedDisplays, getDisplayCount } from "./display"

// Starlight Streams: the display overview (Ctrl+Shift+D).
// Shows the displays of the pc laid out like in the Windows display settings. The streamed display
// is live, the others are screenshots that the pc takes every 1.5 seconds while the overview is
// open. Click a display to zoom into it and stream it, Esc closes without switching.

const FADE_MS = 250
const ZOOM_MS = 320
const THUMBNAIL_INTERVAL_MS = 1500

type Box = {
    display: number
    element: HTMLDivElement
    image: HTMLImageElement | null
    imageUrl: string | null
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

export class DisplayOverview {
    private api: Api
    private hostId: number
    private getCurrentDisplay: () => number
    private onPick: (display: number) => void

    private root: HTMLDivElement | null = null
    private boxes: Array<Box> = []
    private liveCanvas: HTMLCanvasElement | null = null
    private animationFrame: number | null = null
    private thumbnailTimer: number | null = null
    private closing = false

    constructor(api: Api, hostId: number, getCurrentDisplay: () => number, onPick: (display: number) => void) {
        this.api = api
        this.hostId = hostId
        this.getCurrentDisplay = getCurrentDisplay
        this.onPick = onPick
    }

    isOpen(): boolean {
        return this.root != null
    }

    async open() {
        if (this.root) {
            return
        }
        this.closing = false

        let displays = getCachedDisplays(this.hostId) ?? placeholderDisplays(getDisplayCount(this.hostId))
        try {
            const fetched = (await apiHostDisplays(this.api, { host_id: this.hostId })).displays
            if (fetched.length > 0) {
                displays = fetched
            }
        } catch (e) {
            // keep the displays this browser knows
        }
        if (this.root) {
            return
        }

        const root = document.createElement("div")
        Object.assign(root.style, {
            position: "fixed", inset: "0", zIndex: "1000",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(5, 5, 10, 0.78)", backdropFilter: "blur(6px)",
            opacity: "0", transition: `opacity ${FADE_MS}ms ease`,
            cursor: "default",
        } satisfies Partial<CSSStyleDeclaration>)
        // Clicks and keys here are not for the pc
        for (const type of ["mousedown", "mouseup", "mousemove", "wheel", "contextmenu", "touchstart", "touchmove", "touchend", "keydown", "keyup"]) {
            root.addEventListener(type, event => event.stopPropagation())
        }
        root.addEventListener("click", event => {
            event.stopPropagation()
            if (event.target == root) {
                this.close()
            }
        })

        // Fit the whole desktop into 80% of the window
        const placed = layout(displays)
        const minX = Math.min(...placed.map(p => p.x))
        const minY = Math.min(...placed.map(p => p.y))
        const maxX = Math.max(...placed.map(p => p.x + p.display.width))
        const maxY = Math.max(...placed.map(p => p.y + p.display.height))
        const scale = Math.min(window.innerWidth * 0.8 / (maxX - minX), window.innerHeight * 0.7 / (maxY - minY))
        const gap = 6

        const stage = document.createElement("div")
        Object.assign(stage.style, {
            position: "relative",
            width: `${(maxX - minX) * scale}px`, height: `${(maxY - minY) * scale}px`,
            transform: "scale(0.94)", transition: `transform ${FADE_MS}ms ease`,
        } satisfies Partial<CSSStyleDeclaration>)
        root.appendChild(stage)

        const current = this.getCurrentDisplay()
        this.boxes = []
        for (const { display, x, y } of placed) {
            const box = document.createElement("div")
            const isCurrent = display.index == current
            Object.assign(box.style, {
                position: "absolute",
                left: `${(x - minX) * scale + gap / 2}px`, top: `${(y - minY) * scale + gap / 2}px`,
                width: `${display.width * scale - gap}px`, height: `${display.height * scale - gap}px`,
                background: "#1b1b22", borderRadius: "8px", overflow: "hidden", cursor: "pointer",
                boxShadow: isCurrent ? "0 0 0 3px #ff2d55, 0 10px 40px rgba(0,0,0,0.6)" : "0 0 0 1px rgba(255,255,255,0.15), 0 10px 40px rgba(0,0,0,0.6)",
                transition: `transform ${ZOOM_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${FADE_MS}ms ease, box-shadow 150ms ease`,
                transformOrigin: "center center",
            } satisfies Partial<CSSStyleDeclaration>)
            box.addEventListener("mouseenter", () => { if (!this.closing) box.style.transform = "scale(1.03)" })
            box.addEventListener("mouseleave", () => { if (!this.closing) box.style.transform = "" })
            box.addEventListener("click", event => {
                event.stopPropagation()
                this.pick(display.index)
            })

            let image: HTMLImageElement | null = null
            if (isCurrent) {
                // The streamed display: live, copied from the stream every frame
                const canvas = document.createElement("canvas")
                Object.assign(canvas.style, { width: "100%", height: "100%", objectFit: "contain", display: "block" })
                box.appendChild(canvas)
                this.liveCanvas = canvas
            } else {
                image = document.createElement("img")
                Object.assign(image.style, { width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: "0", transition: "opacity 200ms ease" })
                image.addEventListener("load", () => image!.style.opacity = "1")
                box.appendChild(image)
            }

            const label = document.createElement("div")
            label.innerText = display.name ? `${display.index} · ${display.name}` : `${display.index}`
            Object.assign(label.style, {
                position: "absolute", left: "8px", bottom: "8px", padding: "2px 8px",
                background: "rgba(0,0,0,0.65)", color: "white", borderRadius: "6px",
                font: "600 13px system-ui, sans-serif", pointerEvents: "none",
            } satisfies Partial<CSSStyleDeclaration>)
            box.appendChild(label)

            stage.appendChild(box)
            this.boxes.push({ display: display.index, element: box, image, imageUrl: null })
        }

        document.body.appendChild(root)
        this.root = root

        // Fade in
        requestAnimationFrame(() => {
            root.style.opacity = "1"
            stage.style.transform = "scale(1)"
        })

        this.drawLive()
        this.refreshThumbnails()
        this.thumbnailTimer = window.setInterval(() => this.refreshThumbnails(), THUMBNAIL_INTERVAL_MS)
    }

    /// Zooms into the display, then streams it
    private pick(display: number) {
        if (this.closing) {
            return
        }
        const box = this.boxes.find(box => box.display == display)
        if (!box || display == this.getCurrentDisplay()) {
            this.close()
            return
        }
        this.closing = true
        this.stopUpdates()

        const rect = box.element.getBoundingClientRect()
        const zoom = Math.min(window.innerWidth / rect.width, window.innerHeight / rect.height)
        const dx = window.innerWidth / 2 - (rect.left + rect.width / 2)
        const dy = window.innerHeight / 2 - (rect.top + rect.height / 2)
        box.element.style.zIndex = "1"
        box.element.style.transform = `translate(${dx}px, ${dy}px) scale(${zoom})`
        for (const other of this.boxes) {
            if (other != box) {
                other.element.style.opacity = "0"
            }
        }

        window.setTimeout(() => {
            this.onPick(display)
            this.remove()
        }, ZOOM_MS)
    }

    /// Closes without switching
    close() {
        if (!this.root || this.closing) {
            return
        }
        this.closing = true
        this.stopUpdates()
        this.root.style.opacity = "0"
        window.setTimeout(() => this.remove(), FADE_MS)
    }

    private stopUpdates() {
        if (this.animationFrame != null) {
            cancelAnimationFrame(this.animationFrame)
            this.animationFrame = null
        }
        if (this.thumbnailTimer != null) {
            window.clearInterval(this.thumbnailTimer)
            this.thumbnailTimer = null
        }
    }

    private remove() {
        this.stopUpdates()
        for (const box of this.boxes) {
            if (box.imageUrl) {
                URL.revokeObjectURL(box.imageUrl)
            }
        }
        this.boxes = []
        this.liveCanvas = null
        this.root?.remove()
        this.root = null
        this.closing = false
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

    private refreshThumbnails() {
        for (const box of this.boxes) {
            if (!box.image) {
                continue
            }
            fetchApi(this.api, "/host/display-thumbnail", "GET", {
                response: "ignore",
                query: { host_id: this.hostId, index: box.display },
            }).then(response => response.blob()).then(blob => {
                if (!this.root || this.closing || !box.image) {
                    return
                }
                const old = box.imageUrl
                box.imageUrl = URL.createObjectURL(blob)
                box.image.src = box.imageUrl
                if (old) {
                    URL.revokeObjectURL(old)
                }
            }).catch(() => {
                // the first screenshot takes a moment, or the pc can't take one (e.g. locked)
            })
        }
    }
}
