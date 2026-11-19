import { Component } from "../index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { Modal } from "./index"

export abstract class FormModal<Output> implements Component, Modal<Output | null> {

    private formElement: HTMLFormElement = document.createElement("form")
    private bodyElement: HTMLDivElement = document.createElement("div")
    private footElement: HTMLDivElement = document.createElement("div")
    private mounted: boolean = false
    protected submitButton: HTMLButtonElement = document.createElement("button")
    protected cancelButton: HTMLButtonElement = document.createElement("button")

    constructor() {
        const i = getTranslations(getCurrentLanguage()).modal
        this.submitButton.type = "submit"
        this.submitButton.className = "sl-btn sl-btn-ink"
        this.submitButton.innerText = i.ok

        this.cancelButton.type = "button"
        this.cancelButton.className = "sl-btn sl-btn-quiet"
        this.cancelButton.innerText = i.cancel

        this.formElement.className = "sl-modal-form"
        this.bodyElement.className = "sl-modal-body"
        this.footElement.className = "sl-modal-foot"

        this.formElement.addEventListener("submit", (event) => event.preventDefault())
    }

    abstract reset(): void
    abstract submit(): Output | null

    abstract mountForm(form: HTMLElement): void

    mount(parent: Element): void {
        if (!this.mounted) {
            this.mounted = true
            this.mountForm(this.bodyElement)
            this.footElement.appendChild(this.cancelButton)
            this.footElement.appendChild(this.submitButton)
            this.formElement.appendChild(this.bodyElement)
            this.formElement.appendChild(this.footElement)
        }

        this.reset()

        parent.appendChild(this.formElement)
    }
    unmount(parent: Element): void {
        parent.removeChild(this.formElement)
    }

    onFinish(signal: AbortSignal): Promise<Output | null> {
        const abortController = new AbortController()
        signal.addEventListener("abort", abortController.abort.bind(abortController))

        return new Promise((resolve, reject) => {
            this.formElement.addEventListener("submit", event => {
                const output = this.submit()

                if (output == null) {
                    return
                }

                abortController.abort()
                resolve(output)
            }, { signal: abortController.signal })

            this.cancelButton.addEventListener("click", event => {
                event.preventDefault()

                abortController.abort()
                resolve(null)
            }, { signal: abortController.signal })
        })
    }
}
