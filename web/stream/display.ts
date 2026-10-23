import { StreamKeys } from "../api_bindings"
import { StreamInput } from "./input"
import { emptyKeyModifiers } from "./keyboard"

// Starlight Streams: choose which display of the pc is streamed.
// Sunshine switches the streamed display with the shortcut Ctrl+Alt+Shift+F1..F12.

export const MAX_DISPLAYS = 6

function sendSwitchShortcut(input: StreamInput, display: number) {
    const fKey = StreamKeys.VK_F1 + (display - 1)
    const all = { ...emptyKeyModifiers(), ctrl: true, alt: true, shift: true }

    input.sendKey(true, StreamKeys.VK_CONTROL, { ...emptyKeyModifiers(), ctrl: true })
    input.sendKey(true, StreamKeys.VK_MENU, { ...emptyKeyModifiers(), ctrl: true, alt: true })
    input.sendKey(true, StreamKeys.VK_SHIFT, all)
    input.sendKey(true, fKey, all)
    input.sendKey(false, fKey, all)
    input.sendKey(false, StreamKeys.VK_SHIFT, { ...emptyKeyModifiers(), ctrl: true, alt: true })
    input.sendKey(false, StreamKeys.VK_MENU, { ...emptyKeyModifiers(), ctrl: true })
    input.sendKey(false, StreamKeys.VK_CONTROL, emptyKeyModifiers())
}

/// Number of display boxes shown on the host card
export const HOST_CARD_DISPLAYS = 2

function storageKey(hostId: number): string {
    return `starlight-display-${hostId}`
}

/// The display that will be streamed when a stream starts (1 if never chosen)
export function getPreferredDisplay(hostId: number): number {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(hostId)) ?? "null")
        if (saved && typeof saved.current == "number") {
            return saved.current
        }
    } catch (e) {
        // storage might be unavailable
    }
    return 1
}

/// Chooses the display that is streamed when the next stream starts
export function setPreferredDisplay(hostId: number, display: number) {
    const current = getPreferredDisplay(hostId)
    const previous = display != current ? current : (display == 1 ? 2 : 1)
    try {
        localStorage.setItem(storageKey(hostId), JSON.stringify({ current: display, previous }))
    } catch (e) {
        // storage might be unavailable
    }
}

/// Remembers the chosen display per host, and the one before it for the quick switch hotkey
export class DisplaySwitcher {
    private storageKey: string
    private current: number | null = null
    private previous: number = 2

    constructor(hostId: number) {
        this.storageKey = storageKey(hostId)

        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? "null")
            if (saved && typeof saved.current == "number" && typeof saved.previous == "number") {
                this.current = saved.current
                this.previous = saved.previous
            }
        } catch (e) {
            // storage might be unavailable
        }
    }

    getCurrent(): number {
        return this.current ?? 1
    }

    switchTo(input: StreamInput, display: number) {
        const current = this.getCurrent()
        if (display != current) {
            this.previous = current
        }
        this.current = display

        sendSwitchShortcut(input, display)
        this.save()
    }

    /// Switches between the current and the previously used display
    switchToOther(input: StreamInput): number {
        const other = this.previous != this.getCurrent() ? this.previous : (this.getCurrent() == 1 ? 2 : 1)
        this.switchTo(input, other)
        return other
    }

    /// Switches to the display chosen last time, if the user ever chose one
    applySaved(input: StreamInput) {
        if (this.current != null) {
            sendSwitchShortcut(input, this.current)
        }
    }

    private save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({ current: this.current, previous: this.previous }))
        } catch (e) {
            // storage might be unavailable
        }
    }
}
