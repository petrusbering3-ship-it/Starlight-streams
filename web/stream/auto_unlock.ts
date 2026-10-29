import { Api, apiHostSession, apiHostUnlocked } from "../api"
import { StreamKeys } from "../api_bindings"
import { StreamInput } from "./input"
import { emptyKeyModifiers } from "./keyboard"

// Starlight Streams: unlock the pc when a stream starts.
// When the pc shows the lock screen (or the login screen), the saved Windows PIN is typed into
// it through the stream, like a macro. The server locks the pc again when the stream ends, so
// somebody sitting at the pc still needs the PIN.

function storageKey(hostId: number): string {
    return `starlight-unlock-pin-${hostId}`
}

export function getUnlockPin(hostId: number): string | null {
    try {
        return localStorage.getItem(storageKey(hostId)) || null
    } catch (e) {
        return null
    }
}

export function setUnlockPin(hostId: number, pin: string | null) {
    try {
        if (pin) {
            localStorage.setItem(storageKey(hostId), pin)
        } else {
            localStorage.removeItem(storageKey(hostId))
        }
    } catch (e) {
        // storage might be unavailable
    }
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function pressKey(input: StreamInput, key: number) {
    input.sendKey(true, key, emptyKeyModifiers())
    input.sendKey(false, key, emptyKeyModifiers())
}

/// Whether the pc needs unlocking, null if the power agent can't be reached
export async function needsUnlock(api: Api, hostId: number): Promise<boolean | null> {
    try {
        const session = await apiHostSession(api, { host_id: hostId })
        return !session.logged_in || session.locked
    } catch (e) {
        return null
    }
}

/// Types the pin on the lock screen and returns whether the pc is unlocked afterwards
export async function unlockPc(api: Api, hostId: number, input: StreamInput, pin: string): Promise<boolean> {
    // Any key slides the lock screen picture away; Ctrl doesn't type anything
    pressKey(input, StreamKeys.VK_CONTROL)
    await wait(1200)

    if (/^[0-9]+$/.test(pin)) {
        for (const digit of pin) {
            pressKey(input, StreamKeys.VK_KEY_0 + Number(digit))
            await wait(40)
        }
    } else {
        input.sendText(pin)
        await wait(300)
    }
    // A PIN usually signs in by itself, a password needs Enter
    await wait(1500)
    if (await needsUnlock(api, hostId) != false) {
        pressKey(input, StreamKeys.VK_RETURN)
    }

    for (let i = 0; i < 8; i++) {
        await wait(1000)
        if (await needsUnlock(api, hostId) == false) {
            try {
                await apiHostUnlocked(api, { host_id: hostId })
            } catch (e) {
                // the pc just isn't locked again after the stream
            }
            return true
        }
    }
    return false
}
