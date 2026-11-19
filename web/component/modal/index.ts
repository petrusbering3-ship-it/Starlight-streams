import { Component } from "../index"
import { showNotification } from "../notification"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { FormModal } from "./form"

export interface Modal<Output> extends Component {
    onFinish(abort: AbortSignal): Promise<Output>
}

let modalAbort: AbortController | null = null
const modalBackground = document.getElementById("modal-overlay")
const modalParent = document.getElementById("modal-parent")
let previousModal: Modal<unknown> | null = null

// Don't allow context menu event through this background
modalBackground?.addEventListener("contextmenu", event => {
    event.stopImmediatePropagation()
})

export function getModalBackground(): HTMLElement | null {
    return modalBackground
}

export async function showModal<Output>(modal: Modal<Output> | null): Promise<Output | null> {
    const i = getTranslations(getCurrentLanguage()).common
    if (modalParent == null) {
        showNotification(i.missingModalParent)
        return null
    }
    if (modalBackground == null) {
        showNotification(i.missingModalOverlay)
    }

    if (modalAbort != null) {
        if (modalBackground) modalBackground.hidden = true
        modalAbort.abort()
        modalAbort = null
    }

    if (!modal) {
        return null
    }

    if (previousModal) {
        previousModal.unmount(modalParent)
    }
    previousModal = modal

    const abortController = new AbortController()

    modalAbort = abortController
    modal.mount(modalParent)
    if (modalBackground) modalBackground.hidden = false
    modalParent.querySelector<HTMLElement>("input, select, textarea, button[type=submit]")?.focus({ preventScroll: true })

    const output = await modal.onFinish(abortController.signal)

    if (modalBackground) modalBackground.hidden = true
    abortController.abort()
    if (modalAbort === abortController) {
        modalAbort = null
    }

    return output
}

/// --- Helper Modals

// TODO: remove this
export async function showPrompt(prompt: string, promptInit?: PromptInit): Promise<string | null> {
    const modal = new PromptModal(prompt, promptInit)

    return await showModal(modal)
}

type PromptInit = {
    defaultValue?: string,
    name?: string,
    type?: "text" | "password",
}

class PromptModal extends FormModal<string> {
    private message: HTMLElement = document.createElement("p")
    private textInput: HTMLInputElement = document.createElement("input")

    constructor(prompt: string, init?: PromptInit) {
        super()

        this.message.innerText = prompt
        this.message.className = "sl-ink2"
        this.textInput.className = "sl-input"

        if (init?.type) {
            this.textInput.type = init?.type
        }
        if (init?.defaultValue) {
            this.textInput.defaultValue = init?.defaultValue
        }
        if (init?.name) {
            this.textInput.name = init?.name
        }
    }

    reset(): void {
        this.textInput.value = ""
    }
    submit(): string | null {
        return this.textInput.value
    }

    mountForm(form: HTMLElement): void {
        form.appendChild(this.message)
        form.appendChild(this.textInput)
    }
}

type MessageInit = {
    signal?: AbortSignal
}

export async function showMessage(message: string, init?: MessageInit) {
    const modal = new MessageModal(message, init)

    await showModal(modal)
}

class MessageModal implements Component, Modal<void> {

    private signal?: AbortSignal
    private body: HTMLElement = document.createElement("div")
    private textElement: HTMLElement = document.createElement("p")
    private foot: HTMLElement = document.createElement("div")
    private okButton: HTMLButtonElement = document.createElement("button")

    constructor(message: string, init?: MessageInit) {
        const i = getTranslations(getCurrentLanguage()).modal
        this.textElement.innerText = message
        this.textElement.className = "sl-message"
        this.body.className = "sl-modal-body"
        this.body.appendChild(this.textElement)

        this.okButton.innerText = i.ok
        this.okButton.type = "button"
        this.okButton.className = "sl-btn sl-btn-ink"
        this.foot.className = "sl-modal-foot"
        this.foot.appendChild(this.okButton)

        this.signal = init?.signal
    }

    mount(parent: Element): void {
        parent.appendChild(this.body)
        parent.appendChild(this.foot)
    }
    unmount(parent: Element): void {
        parent.removeChild(this.body)
        parent.removeChild(this.foot)
    }

    onFinish(abort: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            let customController: AbortController | null = null

            if (this.signal) {
                customController = new AbortController()
                this.signal.addEventListener("abort", () => {
                    resolve()
                    customController?.abort()
                }, { once: true, signal: customController.signal })
            }

            this.okButton.addEventListener("click", () => {
                resolve()
                customController?.abort()
            }, { signal: customController?.signal })

            if (customController) {
                abort.addEventListener("abort", customController.abort.bind(customController))
            }
        })
    }
}
