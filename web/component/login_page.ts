import { getCurrentLanguage, getTranslations } from "../i18n"
import { el } from "../icons"

// Starlight Streams: the full page login (Swiss Console, design/screens/S-Login).

export type UserAuth = {
    name: string,
    password: string
}

/// Shows the login page until the user logs in (or cancels, when cancelling is allowed).
/// `login` checks the credentials: false shows "Wrong password", the page stays open.
export function showLoginPage(login: (auth: UserAuth) => Promise<boolean>, cancellable = false): Promise<boolean> {
    const i = getTranslations(getCurrentLanguage()).login

    const page = el("div", "sl sl-login")
    page.setAttribute("role", "dialog")
    page.setAttribute("aria-modal", "true")
    page.setAttribute("aria-label", i.title)

    // Left: the wordmark and the three steps
    const intro = el("div", "sl-login-intro")
    const top = el("div", "sl-login-top")
    top.append(el("span", "sl-label", "Starlight Streams"), el("span", "sl-label", i.fork))
    const wordmark = el("h1", "sl-display sl-login-wordmark")
    wordmark.append("Starlight", el("br"), "Streams", el("span", "sl-red", "."))
    const steps = el("div", "sl-login-steps")
    for (const [number, title, text] of [["01", i.step1, i.step1Text], ["02", i.step2, i.step2Text], ["03", i.step3, i.step3Text]]) {
        const step = el("div", "sl-login-step")
        step.append(el("span", "sl-mono sl-muted", number), el("span", "title", title), el("span", "sl-muted text", text))
        steps.appendChild(step)
    }
    intro.append(top, wordmark, steps)

    // Right: the form
    const form = el("form", "sl-login-form")
    form.noValidate = true
    const spacer = el("div", "sl-login-spacer")
    const title = el("h2", "sl-h2 sl-login-title", i.title)

    const nameField = el("div", "sl-field")
    const nameLabel = el("label", "sl-label", i.username)
    nameLabel.htmlFor = "sl-login-name"
    const name = el("input", "sl-input")
    name.id = "sl-login-name"
    name.type = "text"
    name.autocomplete = "username"
    name.required = true
    nameField.append(nameLabel, name)

    const passwordField = el("div", "sl-field")
    const passwordLabel = el("label", "sl-label", i.password)
    passwordLabel.htmlFor = "sl-login-password"
    const password = el("input", "sl-input")
    password.id = "sl-login-password"
    password.type = "password"
    password.autocomplete = "current-password"
    password.required = true
    password.setAttribute("aria-describedby", "sl-login-error")
    const error = el("span", "sl-error")
    error.id = "sl-login-error"
    error.hidden = true

    // Password as a file (e.g. a long generated password)
    const fileInput = el("input")
    fileInput.type = "file"
    fileInput.accept = ".txt"
    fileInput.hidden = true
    const fileButton = el("button", "sl-link sl-login-file", i.passwordFile)
    fileButton.type = "button"
    fileButton.addEventListener("click", () => fileInput.click())
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0]
        if (file) {
            password.value = (await file.text()).replace(/\r/g, "").replace(/\n/g, "")
        }
    })
    passwordField.append(passwordLabel, password, error, fileButton, fileInput)

    const submit = el("button", "sl-btn sl-btn-ink sl-btn-lg sl-btn-block")
    submit.type = "submit"
    const arrow = el("span", undefined, "→")
    arrow.setAttribute("aria-hidden", "true")
    submit.append(i.submit, arrow)

    const foot = el("div", "sl-login-foot")
    foot.appendChild(el("span", "sl-muted", i.forgot))

    form.append(spacer, title, nameField, passwordField, submit)
    let cancel: HTMLButtonElement | null = null
    if (cancellable) {
        cancel = el("button", "sl-btn sl-btn-quiet", i.cancel)
        cancel.type = "button"
        form.appendChild(cancel)
    }
    form.appendChild(foot)

    page.append(intro, form)
    document.body.appendChild(page)
    name.focus()

    const setLoading = (loading: boolean) => {
        submit.classList.toggle("is-loading", loading)
        submit.disabled = loading
        name.disabled = loading
        password.disabled = loading
    }
    const setError = (message: string | null) => {
        error.textContent = message ?? ""
        error.hidden = message == null
        password.setAttribute("aria-invalid", message == null ? "false" : "true")
    }

    return new Promise(resolve => {
        const close = (result: boolean) => {
            page.remove()
            resolve(result)
        }
        cancel?.addEventListener("click", () => close(false))

        form.addEventListener("submit", async event => {
            event.preventDefault()
            if (!name.value || !password.value) {
                setError(i.missing)
                ;(name.value ? password : name).focus()
                return
            }
            setError(null)
            setLoading(true)
            let ok = false
            try {
                ok = await login({ name: name.value, password: password.value })
            } catch (e) {
                ok = false
            }
            setLoading(false)
            if (ok) {
                close(true)
            } else {
                setError(i.wrongPassword)
                password.select()
                password.focus()
            }
        })
    })
}
