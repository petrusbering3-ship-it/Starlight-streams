import { el } from "../icons"

// Starlight Streams: starting a stream. The clicked row glides to the right and shows a black box
// behind it; the box grows to fill the window, and the stream page opens black into it. ~2 s.

const SLIDE_MS = 650
const GROW_MS = 1000
const HOLD_MS = 250

export async function launchTransition(source: HTMLElement | null, number?: string): Promise<void> {
    if (!source || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return
    }
    const rect = source.getBoundingClientRect()
    if (rect.width == 0 || rect.height == 0) {
        return
    }

    const layer = el("div", "sl-launch")
    const box = el("div", "sl-launch-box")
    if (number) {
        box.appendChild(el("span", "sl-launch-num", number))
    }
    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add("sl-launch-clone")
    clone.removeAttribute("id")
    for (const element of [box, clone]) {
        Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    }
    layer.append(box, clone)
    document.body.appendChild(layer)
    source.style.visibility = "hidden"
    // Back from the stream (page from the back/forward cache): as it was
    window.addEventListener("pageshow", event => {
        if (event.persisted) {
            layer.remove()
            source.style.visibility = ""
        }
    }, { once: true })

    // 1. The row glides out to the right, the black box stays
    const slide = clone.animate([
        { transform: "translateX(0)", opacity: 1 },
        { transform: `translateX(${Math.max(window.innerWidth - rect.left, rect.width) + 40}px)`, opacity: 0 },
    ], { duration: SLIDE_MS, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" })
    await slide.finished.catch(() => { })

    // 2. The box grows to the whole window
    const grow = box.animate([
        { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
        { left: "0px", top: "0px", width: `${window.innerWidth}px`, height: `${window.innerHeight}px` },
    ], { duration: GROW_MS, easing: "cubic-bezier(.7,0,.15,1)", fill: "forwards" })
    await grow.finished.catch(() => { })

    // 3. A moment of black, then the stream page (it starts black too)
    await new Promise(resolve => setTimeout(resolve, HOLD_MS))
}
