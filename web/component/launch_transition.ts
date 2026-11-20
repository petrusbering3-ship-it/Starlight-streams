import { Api, fetchApi } from "../api"
import { el } from "../icons"

// Starlight Streams: starting a stream (the user's drawings). The clicked display row slides to the right
// and turns into a black box, the box stretches back over the row, then grows to the whole window. The box is a window onto the PC's
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
    // The row itself, on top: it slides right and fades into the box
    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add("sl-launch-clone")
    clone.removeAttribute("id")
    Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    layer.append(reveal, clone)
    document.body.appendChild(layer)
    source.style.visibility = "hidden"
    window.addEventListener("pageshow", event => {
        if (event.persisted) {
            layer.remove()
            source.style.visibility = ""
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
    // 1. The row slides right and becomes the box
    const shift = Math.min(rect.width * 0.6, vw - rect.left - 80)
    const slideEnd = 0.3
    clone.animate([
        { transform: "translateX(0)", opacity: 1, offset: 0 },
        { transform: `translateX(${shift}px)`, opacity: 0, offset: slideEnd },
        { transform: `translateX(${shift}px)`, opacity: 0, offset: 1 },
    ], { duration: DURATION_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" })
    const moved = (left: number) => box(left, rect.top, Math.min(vw, rect.right + shift), rect.bottom)
    const animation = reveal.animate([
        { clipPath: box(rect.left, rect.top, rect.right, rect.bottom), opacity: 0, offset: 0, easing: "cubic-bezier(.5,0,.2,1)" },
        { clipPath: moved(rect.left + shift), opacity: 1, offset: slideEnd, easing: "cubic-bezier(.6,0,.2,1)" },
        // 2. stretches back over the whole row
        { clipPath: moved(rect.left), opacity: 1, offset: 0.5, easing: "cubic-bezier(.7,0,.15,1)" },
        // 3. grows to the whole window
        { clipPath: box(0, 0, vw, vh), opacity: 1, offset: 1 },
    ], { duration: DURATION_MS, fill: "forwards" })
    // The box is black first; the screen fades in while it stretches and grows
    image.animate([
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.32 },
        { opacity: 1, offset: 0.7 },
        { opacity: 1, offset: 1 },
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
