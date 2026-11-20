import { el } from "../icons"

// Starlight Streams: starting a stream (the user's drawings).
// Home page: the clicked display row slides to the right and becomes a black box. The page as it
// looks then is saved, and the stream page opens.
// Stream page: shows that saved page with a black hole where the box is. When the live picture is
// ready, the hole slowly stretches left over the row and grows to the whole window: the live
// stream is behind it, so it's revealed. It looks like the home page never went away.

const SLIDE_MS = 700
/// Read by the stream page (same tab)
const LAUNCH_KEY = "starlight-launch"

type Box = { left: number, top: number, right: number, bottom: number }

type LaunchState = {
    hostId: number
    html: string
    scrollY: number
    viewport: { width: number, height: number }
    /// The black box after the row slid right
    box: Box
    /// Where the row was (the box stretches back over it)
    row: Box
    at: number
}

/// Home page: the row slides right and becomes the black box; then the page is saved for the stream page
export async function launchTransition(source: HTMLElement | null, hostId?: number): Promise<void> {
    try {
        sessionStorage.removeItem(LAUNCH_KEY)
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
    const shift = Math.max(0, Math.min(rect.width * 0.55, vw - rect.left - 80))
    const box: Box = { left: rect.left + shift, top: rect.top, right: Math.min(vw, rect.right + shift), bottom: rect.bottom }

    const layer = el("div", "sl-launch")
    const black = el("div", "sl-launch-box")
    Object.assign(black.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` })
    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add("sl-launch-clone")
    clone.removeAttribute("id")
    Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    layer.append(black, clone)
    document.body.appendChild(layer)
    source.style.visibility = "hidden"
    window.addEventListener("pageshow", event => {
        if (event.persisted) {
            layer.remove()
            source.style.visibility = ""
        }
    }, { once: true })

    clone.animate([
        { transform: "translateX(0)", opacity: 1 },
        { transform: `translateX(${shift}px)`, opacity: 0 },
    ], { duration: SLIDE_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" })
    await black.animate([
        { opacity: 0, transform: `translateX(${-shift * 0.6}px)` },
        { opacity: 1, transform: "translateX(0)" },
    ], { duration: SLIDE_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" }).finished.catch(() => { })

    // The page as it looks now (the row is hidden, the box is drawn by the stream page)
    if (hostId == null) {
        return
    }
    const root = document.getElementById("root")
    if (!root) {
        return
    }
    const copy = root.cloneNode(true) as HTMLElement
    for (const element of Array.from(copy.querySelectorAll("[id]"))) {
        element.removeAttribute("id")
    }
    copy.removeAttribute("id")
    const state: LaunchState = {
        hostId,
        html: copy.outerHTML,
        scrollY: window.scrollY,
        viewport: { width: vw, height: vh },
        box,
        row: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        at: Date.now(),
    }
    try {
        sessionStorage.setItem(LAUNCH_KEY, JSON.stringify(state))
    } catch {
        // storage might be unavailable: the stream page simply starts black
    }
}

/// Stream page: the saved home page with the black box, until the live picture is ready
export class LaunchReveal {
    private root = el("div", "sl-launch-backdrop")

    private constructor(private state: LaunchState) {
        const page = el("div", "sl-launch-page")
        page.innerHTML = state.html
        page.style.transform = `translateY(${-state.scrollY}px)`
        this.root.appendChild(page)
        this.root.style.clipPath = this.hole(state.box)
        document.body.appendChild(this.root)
    }

    /// Only right after the home page's animation, for this pc and in a window of the same size
    static take(hostId: number): LaunchReveal | null {
        try {
            const json = sessionStorage.getItem(LAUNCH_KEY)
            sessionStorage.removeItem(LAUNCH_KEY)
            const state = json ? JSON.parse(json) as LaunchState : null
            if (!state || state.hostId != hostId || Date.now() - state.at > 15_000
                || Math.abs(state.viewport.width - window.innerWidth) > 4 || Math.abs(state.viewport.height - window.innerHeight) > 4) {
                return null
            }
            return new LaunchReveal(state)
        } catch {
            return null
        }
    }

    /// The whole window, with a hole (the black box, where the stream is behind)
    private hole(box: Box): string {
        const w = window.innerWidth
        const h = window.innerHeight
        return `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, `
            + `${box.left}px ${box.top}px, ${box.right}px ${box.top}px, ${box.right}px ${box.bottom}px, ${box.left}px ${box.bottom}px, ${box.left}px ${box.top}px)`
    }

    /// The live picture is there: the box stretches left over the row (slowly), then grows to the window
    async reveal() {
        const { box, row } = this.state
        const stretched: Box = { left: row.left, top: box.top, right: box.right, bottom: box.bottom }
        const full: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
        const animation = this.root.animate([
            { clipPath: this.hole(box), offset: 0, easing: "cubic-bezier(.45,0,.2,1)" },
            { clipPath: this.hole(stretched), offset: 0.5, easing: "cubic-bezier(.7,0,.15,1)" },
            { clipPath: this.hole(full), offset: 1 },
        ], { duration: 1900, fill: "forwards" })
        await animation.finished.catch(() => { })
        this.remove()
    }

    /// Gone without the animation (the stream failed: the error card shows on black)
    remove() {
        this.root.remove()
    }
}
