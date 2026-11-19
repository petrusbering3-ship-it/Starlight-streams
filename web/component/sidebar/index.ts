import { Component } from "../index"
import { showNotification } from "../notification"

// Starlight Streams: the stream sidebar frame (Swiss Console .sl-sidebar): slides in from the
// chosen edge, the handle opens it, a tap outside closes it.

export interface Sidebar extends Component {
    extended(): void
    unextend(): void
}

let sidebarExtended = false
const sidebarRoot = document.getElementById("sidebar-root")
const sidebarParent = document.getElementById("sidebar-parent")
const sidebarButton = document.getElementById("sidebar-button")
const sidebarBackdrop = document.getElementById("sidebar-backdrop")

sidebarButton?.addEventListener("click", toggleSidebar)
sidebarBackdrop?.addEventListener("click", () => setSidebarExtended(false))

let sidebarComponent: Sidebar | null = null

export type SidebarEdge = "up" | "down" | "left" | "right"
export type SidebarStyle = {
    edge?: SidebarEdge
}

export function setSidebarStyle(style: SidebarStyle) {
    // Default values
    const edge = style.edge ?? "left"

    sidebarRoot?.classList.remove("sl-edge-left", "sl-edge-right", "sl-edge-up", "sl-edge-down")
    sidebarRoot?.classList.add(`sl-edge-${edge}`)
    sidebarParent?.classList.remove("sl-sidebar--right", "sl-sidebar--top", "sl-sidebar--bottom")
    if (edge == "right") {
        sidebarParent?.classList.add("sl-sidebar--right")
    } else if (edge == "up") {
        sidebarParent?.classList.add("sl-sidebar--top")
    } else if (edge == "down") {
        sidebarParent?.classList.add("sl-sidebar--bottom")
    }
}

export function toggleSidebar() {
    setSidebarExtended(!isSidebarExtended())
}
export function setSidebarExtended(extended: boolean) {
    if (extended == sidebarExtended) {
        return
    }

    sidebarParent?.setAttribute("data-open", extended ? "true" : "false")
    sidebarRoot?.classList.toggle("is-open", extended)
    sidebarExtended = extended

    if (extended) {
        sidebarComponent?.extended()
    } else {
        sidebarComponent?.unextend()
    }
}
export function isSidebarExtended(): boolean {
    return sidebarExtended
}

export function setSidebar(sidebar: Sidebar | null) {
    if (sidebarParent == null || sidebarRoot == null) {
        showNotification("failed to get sidebar")
        return
    }

    if (sidebarComponent) {
        // unmount
        sidebarComponent?.unmount(sidebarParent)
        sidebarComponent = null
        sidebarRoot.style.visibility = "hidden"
    }
    if (sidebar) {
        // mount
        sidebarComponent = sidebar
        sidebar?.mount(sidebarParent)
        sidebarRoot.style.visibility = "visible"
    }
}

export function getSidebarRoot(): HTMLElement | null {
    return sidebarRoot
}

// initialize defaults
setSidebarStyle({
    edge: "left"
})
setSidebar(null)
