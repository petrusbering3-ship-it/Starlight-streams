// Starlight Streams: the Swiss Console icons (design/screens). 24×24 stroke icons, class "sl-ico".

const PATHS = {
    close: `<path d="M6 6l12 12M18 6L6 18"/>`,
    chevronDown: `<path d="M6 9l6 6 6-6"/>`,
    chevronLeft: `<path d="M15 6l-6 6 6 6"/>`,
    chevronRight: `<path d="M9 6l6 6-6 6"/>`,
    play: `<path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l11-7.2a1 1 0 0 0 0-1.6l-11-7.2C7.9 3.5 7 4 7 4.8z" style="fill: currentColor; stroke: none"/>`,
    moon: `<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>`,
    power: `<path d="M12 3v9"/><path d="M6.3 7.5a8 8 0 1 0 11.4 0"/>`,
    arrowUp: `<path d="M12 19V5M5 12l7-7 7 7"/>`,
    more: `<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,
    key: `<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>`,
    eyeOff: `<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>`,
    globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
    trash: `<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`,
    plus: `<path d="M12 5v14M5 12h14"/>`,
    retry: `<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M5 3v5h5M19 21v-5h-5"/>`,
    lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
    stop: `<rect x="6" y="6" width="12" height="12" rx="2"/>`,
    copy: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
    shield: `<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>`,
    sliders: `<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>`,
    fullscreen: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
    keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
    hash: `<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>`,
    stats: `<path d="M3 12h4l3-8 4 16 3-8h4"/>`,
    exit: `<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>`,
    save: `<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>`,
    terminal: `<path d="M4 17l6-5-6-5M12 19h8"/>`,
} as const

export type IconName = keyof typeof PATHS

/// An inline svg icon element
export function icon(name: IconName, label?: string): SVGSVGElement {
    const template = document.createElement("template")
    template.innerHTML = `<svg class="sl-ico" viewBox="0 0 24 24">${PATHS[name]}</svg>`
    const svg = template.content.firstElementChild as SVGSVGElement
    if (label) {
        svg.setAttribute("role", "img")
        svg.setAttribute("aria-label", label)
    } else {
        svg.setAttribute("aria-hidden", "true")
    }
    return svg
}

/// The small star for the primary display
export function starIcon(label: string): SVGSVGElement {
    const template = document.createElement("template")
    template.innerHTML = `<svg class="sl-star" viewBox="0 0 24 24" role="img"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/></svg>`
    const svg = template.content.firstElementChild as SVGSVGElement
    svg.setAttribute("aria-label", label)
    return svg
}

/// Creates an element with classes and optional text
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag)
    if (className) {
        element.className = className
    }
    if (text != null) {
        element.textContent = text
    }
    return element
}

/// A button with an optional icon before (or after) the text
export function button(className: string, text: string, iconName?: IconName, iconAfter = false): HTMLButtonElement {
    const element = el("button", className)
    element.type = "button"
    const label = document.createTextNode(text)
    if (iconName && !iconAfter) {
        element.appendChild(icon(iconName))
    }
    element.appendChild(label)
    if (iconName && iconAfter) {
        element.appendChild(icon(iconName))
    }
    return element
}
