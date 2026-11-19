import { icon, IconName } from "../icons"

// Starlight Streams: the context menu and "⋯" menus (Swiss Console .sl-menu).

document.addEventListener("click", () => removeContextMenu())
document.addEventListener("keydown", event => {
    if (event.key == "Escape") {
        removeContextMenu()
    }
})

export type ContextMenuElement = {
    name: string,
    callback(event: MouseEvent): void
    /// "context-menu-element-red" marks a dangerous action
    classes?: string[]
    icon?: IconName
    /// A divider line above this element
    separator?: boolean
}

export type ContextMenuInit = {
    elements?: ContextMenuElement[]
}

const contextMenuElement = document.getElementById("context-menu")

/// Opens the menu at the mouse, or under `anchor` (e.g. a "⋯" button)
export function setContextMenu(event: MouseEvent, init?: ContextMenuInit, anchor?: HTMLElement) {
    event.preventDefault()
    event.stopPropagation()

    if (contextMenuElement == null) {
        return
    }

    contextMenuElement.replaceChildren()
    for (const element of init?.elements ?? []) {
        if (element.separator) {
            const separator = document.createElement("div")
            separator.className = "sl-menu-sep"
            contextMenuElement.appendChild(separator)
        }

        const item = document.createElement("button")
        item.type = "button"
        item.className = "sl-menu-item"
        item.setAttribute("role", "menuitem")
        if (element.classes?.includes("context-menu-element-red")) {
            item.classList.add("is-danger")
        }
        if (element.icon) {
            item.appendChild(icon(element.icon))
        }
        item.append(element.name)
        item.addEventListener("click", clickEvent => {
            clickEvent.stopPropagation()
            removeContextMenu()
            element.callback(clickEvent)
        })
        // Also register right click for certain devices which make left click hard: https://github.com/MrCreativ3001/moonlight-web-stream/issues/55
        item.addEventListener("contextmenu", clickEvent => {
            clickEvent.preventDefault()
            removeContextMenu()
            element.callback(clickEvent)
        }, { passive: false })
        contextMenuElement.appendChild(item)
    }

    contextMenuElement.hidden = false

    // Place it, then keep it inside the window
    let x = event.clientX
    let y = event.clientY
    if (anchor) {
        const rect = anchor.getBoundingClientRect()
        x = rect.right - contextMenuElement.offsetWidth
        y = rect.bottom + 4
    }
    x = Math.max(8, Math.min(x, window.innerWidth - contextMenuElement.offsetWidth - 8))
    y = Math.max(8, Math.min(y, window.innerHeight - contextMenuElement.offsetHeight - 8))
    contextMenuElement.style.left = `${x}px`
    contextMenuElement.style.top = `${y}px`

    contextMenuElement.querySelector<HTMLButtonElement>(".sl-menu-item")?.focus({ preventScroll: true })
}

export function removeContextMenu() {
    if (contextMenuElement) {
        contextMenuElement.hidden = true
    }
}
