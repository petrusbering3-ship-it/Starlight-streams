import { button, el, icon } from "../icons"
import { getCurrentLanguage, getTranslations } from "../i18n"

// Starlight Streams: Swiss Console dialogs (design/screens/S-Home-Modals): white panel,
// 1px ink border, ink rule over the footer, scrim behind it. Esc and the scrim close it.

export type SlModal = {
    /// The dialog panel
    panel: HTMLDivElement
    title: HTMLHeadingElement
    body: HTMLDivElement
    foot: HTMLDivElement
    close(): void
    /// Resolves when the dialog was closed (by code, Esc, the scrim or the close button)
    closed: Promise<void>
}

export type SlModalInit = {
    title: string
    /// Small mono label above the title
    label?: string
    size?: "sm" | "lg"
    /// false: only code can close it (no close button, Esc or scrim)
    closable?: boolean
}

export function openSlModal(init: SlModalInit): SlModal {
    const i = getTranslations(getCurrentLanguage()).modal

    const scrim = el("div", "sl sl-scrim sl-dialog-scrim")
    const panel = el("div", `sl-modal${init.size ? ` sl-modal--${init.size}` : ""}`)
    panel.setAttribute("role", "dialog")
    panel.setAttribute("aria-modal", "true")

    const head = el("div", "sl-modal-head")
    const titles = el("div", "sl-modal-titles")
    if (init.label) {
        titles.appendChild(el("span", "sl-label", init.label))
    }
    const title = el("h2", "sl-h3", init.title)
    title.id = `sl-modal-title-${Math.random().toString(36).slice(2)}`
    panel.setAttribute("aria-labelledby", title.id)
    titles.appendChild(title)
    head.appendChild(titles)

    const body = el("div", "sl-modal-body")
    const foot = el("div", "sl-modal-foot")
    panel.append(head, body, foot)
    scrim.appendChild(panel)

    let resolveClosed: () => void = () => { }
    const closed = new Promise<void>(resolve => resolveClosed = resolve)

    const onKey = (event: KeyboardEvent) => {
        if (event.key == "Escape") {
            event.stopPropagation()
            close()
        }
    }
    const close = () => {
        if (!scrim.isConnected) {
            return
        }
        document.removeEventListener("keydown", onKey, true)
        scrim.remove()
        resolveClosed()
    }

    if (init.closable != false) {
        const closeButton = el("button", "sl-btn sl-btn-quiet sl-btn-icon sl-btn-sm")
        closeButton.type = "button"
        closeButton.setAttribute("aria-label", i.close)
        closeButton.appendChild(icon("close"))
        closeButton.addEventListener("click", close)
        head.appendChild(closeButton)

        scrim.addEventListener("mousedown", event => {
            if (event.target == scrim) {
                close()
            }
        })
        document.addEventListener("keydown", onKey, true)
    }

    // Clicks and keys in the dialog are not for the page below (e.g. a stream)
    for (const type of ["click", "mousedown", "mouseup", "contextmenu", "wheel", "keyup", "touchstart", "touchend"]) {
        scrim.addEventListener(type, event => event.stopPropagation())
    }
    scrim.addEventListener("keydown", event => event.stopPropagation())

    document.body.appendChild(scrim)
    requestAnimationFrame(() => panel.querySelector<HTMLElement>("input, button[data-autofocus]")?.focus())

    return { panel, title, body, foot, close, closed }
}

export type ConfirmInit = {
    label?: string
    title: string
    text?: string
    confirm: string
    danger?: boolean
    icon?: Parameters<typeof icon>[0]
}

/// A yes / no question. Resolves true when confirmed.
export function confirmDialog(init: ConfirmInit): Promise<boolean> {
    const i = getTranslations(getCurrentLanguage()).modal
    const modal = openSlModal({ title: init.title, label: init.label, size: "sm" })
    if (init.text) {
        modal.body.appendChild(el("p", "sl-ink2", init.text))
    } else {
        modal.body.remove()
    }

    return new Promise(resolve => {
        let result = false
        const cancel = button("sl-btn sl-btn-quiet", i.cancel)
        cancel.addEventListener("click", () => modal.close())
        const confirm = button(init.danger ? "sl-btn sl-btn-danger-solid" : "sl-btn sl-btn-ink", init.confirm, init.icon)
        confirm.dataset.autofocus = ""
        confirm.addEventListener("click", () => {
            result = true
            modal.close()
        })
        modal.foot.append(cancel, confirm)
        modal.closed.then(() => resolve(result))
    })
}
