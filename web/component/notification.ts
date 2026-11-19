import { icon } from "../icons"

// Starlight Streams: toasts (Swiss Console .sl-toast). At most 2 at a time, top centre.
// Info and warnings hide after 3 seconds, errors stay until closed.

type NotificationLevel = "error" | "warn" | "info" | "ok"

const AUTO_HIDE_MS = 3000
const MAX_TOASTS = 2

const notificationListElement = document.getElementById("notification-list")

function removeToast(toast: HTMLElement) {
    if (toast.classList.contains("is-leaving")) {
        return
    }
    toast.classList.add("is-leaving")
    setTimeout(() => toast.remove(), 220)
}

export function showNotification(message: string, level: NotificationLevel = "error", errorObject?: any) {
    if (level == "error") {
        console.error(message, errorObject)
    } else {
        console.info(message)
    }

    if (!notificationListElement) {
        alert(message)
        return
    }

    const toast = document.createElement("div")
    toast.className = "sl-toast"
    if (level == "error") {
        toast.classList.add("sl-toast--error")
        toast.setAttribute("role", "alert")
    } else if (level == "warn") {
        toast.classList.add("sl-toast--warn")
    } else if (level == "ok") {
        toast.classList.add("sl-toast--ok")
    }

    const text = document.createElement("span")
    text.textContent = message
    toast.appendChild(text)

    if (level == "error") {
        const close = document.createElement("button")
        close.type = "button"
        close.className = "sl-btn sl-btn-quiet sl-btn-icon sl-btn-sm sl-toast-close"
        close.setAttribute("aria-label", "Close")
        close.appendChild(icon("close"))
        close.addEventListener("click", () => removeToast(toast))
        toast.appendChild(close)
    } else {
        setTimeout(() => removeToast(toast), AUTO_HIDE_MS)
    }

    notificationListElement.appendChild(toast)

    // Only the newest ones
    const toasts = Array.from(notificationListElement.querySelectorAll(".sl-toast:not(.is-leaving)")) as Array<HTMLElement>
    for (const old of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) {
        removeToast(old)
    }
}

function handleError(event: ErrorEvent) {
    showNotification(`${event.error}`, "error", event)
}
function handleRejection(event: PromiseRejectionEvent) {
    showNotification(`${event.reason}`, "error", event)
}

window.addEventListener("error", handleError)
window.addEventListener("unhandledrejection", handleRejection)
