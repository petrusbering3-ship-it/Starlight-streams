import { Api, fetchApi } from "../api"
import { el } from "../icons"

// Starlight Streams: starting a stream (the user's drawings). A black box slides into the clicked row
// from the right, fills the row, then grows to the whole window. The box is a window onto the PC's
// screen: it shows that part of a screenshot of the display, and more of it as it grows. ~2 s.
// The screenshot is handed to the stream page, which keeps it until the live picture is there.

const DURATION_MS = 1900
const HOLD_MS = 150
/// Read by the stream page (same tab)
export const LAUNCH_SHOT_KEY = "starlight-launch-shot"

export type LaunchShot = { hostId: number, display: number, image: string, at: number }

export type LaunchOptions = {
    api: Api
    hostId: number
    display: number
}

/// Wakes the screenshot taker on the pc, so a screenshot is ready when Stream is clicked
export function prepareLaunchShot(api: Api, hostId: number, display: number) {
    fetchApi(api, "/host/display-thumbnail", "GET", {
        response: "ignore",
        query: { host_id: hostId, index: display },
    }).catch(() => { })
}

/// A screenshot of the display, tried for a moment (the pc may only start taking them now)
async function fetchShot(options: LaunchOptions, until: number): Promise<Blob | null> {
    while (Date.now() < until) {
        try {
            const response = await fetchApi(options.api, "/host/display-thumbnail", "GET", {
                response: "ignore",
                query: { host_id: options.hostId, index: options.display },
            })
            if (response.ok) {
                return await response.blob()
            }
        } catch {
            // not there yet
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    return null
}

function toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

export async function launchTransition(source: HTMLElement | null, options?: LaunchOptions): Promise<void> {
    try {
        sessionStorage.removeItem(LAUNCH_SHOT_KEY)
    } catch {
        // storage might be unavailable
    }
    if (!source || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return
    }
    const rect = source.getBoundingClientRect()
    if (rect.width == 0 || rect.height == 0) {
        return
    }
    const vw = window.innerWidth
    const vh = window.innerHeight

    // The whole window shows the display; the clip path is the black box
    const layer = el("div", "sl-launch")
    const reveal = el("div", "sl-launch-reveal")
    const image = el("img", "sl-launch-shot")
    image.alt = ""
    reveal.appendChild(image)
    layer.appendChild(reveal)
    document.body.appendChild(layer)
    window.addEventListener("pageshow", event => {
        if (event.persisted) {
            layer.remove()
        }
    }, { once: true })

    // The screenshot comes in while the box moves
    if (options) {
        fetchShot(options, Date.now() + DURATION_MS - 300).then(async blob => {
            if (!blob || !layer.isConnected) {
                return
            }
            image.src = URL.createObjectURL(blob)
            image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true })
            try {
                const shot: LaunchShot = { hostId: options.hostId, display: options.display, image: await toDataUrl(blob), at: Date.now() }
                sessionStorage.setItem(LAUNCH_SHOT_KEY, JSON.stringify(shot))
            } catch {
                // storage might be unavailable: the stream page starts black
            }
        })
    }

    // inset(top right bottom left) of the window
    const box = (left: number, top: number, right: number, bottom: number) =>
        `inset(${top}px ${vw - right}px ${vh - bottom}px ${left}px)`
    const rowRight = rect.right
    const animation = reveal.animate([
        // enters the row from its right end
        { clipPath: box(rowRight, rect.top, rowRight, rect.bottom), offset: 0, easing: "cubic-bezier(.3,0,.2,1)" },
        { clipPath: box(rowRight - rect.width * 0.35, rect.top, rowRight, rect.bottom), offset: 0.26, easing: "cubic-bezier(.5,0,.2,1)" },
        // fills the row
        { clipPath: box(rect.left, rect.top, rowRight, rect.bottom), offset: 0.48, easing: "cubic-bezier(.7,0,.15,1)" },
        // grows to the whole window
        { clipPath: box(0, 0, vw, vh), offset: 1 },
    ], { duration: DURATION_MS, fill: "forwards" })
    await animation.finished.catch(() => { })

    await new Promise(resolve => setTimeout(resolve, HOLD_MS))
}

/// For the stream page: the screenshot from the launch, if it's for this stream and fresh
export function takeLaunchShot(hostId: number): LaunchShot | null {
    try {
        const json = sessionStorage.getItem(LAUNCH_SHOT_KEY)
        sessionStorage.removeItem(LAUNCH_SHOT_KEY)
        const shot = json ? JSON.parse(json) as LaunchShot : null
        if (shot && shot.hostId == hostId && Date.now() - shot.at < 30_000) {
            return shot
        }
    } catch {
        // storage might be unavailable
    }
    return null
}
