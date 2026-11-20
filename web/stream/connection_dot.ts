import { el } from "../icons"
import { getCurrentLanguage, getTranslations } from "../i18n"
import { StatValue } from "./stats"

// Starlight Streams: a small dot in the corner of the stream. Green, yellow or red for how the
// connection is; hover (or tap) shows ping, fps, bitrate and lost packets.

type Level = "good" | "ok" | "bad" | "none"

const UPDATE_MS = 1000

function num(value: StatValue | undefined): number | null {
    return typeof value == "number" && Number.isFinite(value) ? value : null
}

export class ConnectionDot {
    private root = el("div", "sl-conn")
    private dot = el("button", "sl-conn-dot")
    private panel = el("div", "sl-conn-panel")
    private rows: Record<"ping" | "fps" | "bitrate" | "loss", HTMLElement> = {
        ping: el("span", "v", "–"),
        fps: el("span", "v", "–"),
        bitrate: el("span", "v", "–"),
        loss: el("span", "v", "–"),
    }
    private title = el("span", "sl-label")
    private timer: number | null = null
    private lastLost: number | null = null
    private lastReceived: number | null = null
    private lastMbps: number | null = null

    constructor(private getStats: () => Promise<Record<string, StatValue> | null>) {
        const i = getTranslations(getCurrentLanguage()).stream
        this.dot.type = "button"
        this.dot.setAttribute("aria-label", i.connection)
        this.dot.addEventListener("click", event => {
            event.stopPropagation()
            this.root.classList.toggle("is-open")
        })
        for (const type of ["mousedown", "mouseup", "touchstart", "touchend"]) {
            this.root.addEventListener(type, event => event.stopPropagation())
        }

        this.panel.appendChild(this.title)
        const labels: Record<keyof typeof this.rows, string> = { ping: i.ping, fps: "FPS", bitrate: i.bitrateShort, loss: i.packetLoss }
        for (const key of Object.keys(this.rows) as Array<keyof typeof this.rows>) {
            const row = el("div", "sl-conn-row")
            row.append(el("span", "k", labels[key]), this.rows[key])
            this.panel.appendChild(row)
        }
        this.root.append(this.dot, this.panel)
        this.setLevel("none")
    }

    mount(parent: HTMLElement) {
        parent.appendChild(this.root)
        this.timer ??= window.setInterval(() => this.update(), UPDATE_MS)
    }

    unmount() {
        if (this.timer != null) {
            window.clearInterval(this.timer)
            this.timer = null
        }
        this.root.remove()
    }

    /// A new stream (reconnect, quality change): counters start again
    reset() {
        this.lastLost = null
        this.lastReceived = null
        this.lastMbps = null
        this.setLevel("none")
    }

    private async update() {
        let stats: Record<string, StatValue> | null = null
        try {
            stats = await this.getStats()
        } catch {
            stats = null
        }
        if (!stats) {
            this.setLevel("none")
            return
        }

        const ping = num(stats.roundTripMs) ?? num(stats.relayToClientRttMs)
        const fps = num(stats.currentFps)
        const mbps = num(stats.videoMbps)
        if (mbps != null) {
            this.lastMbps = mbps
        }

        // Lost packets since the last update, in percent
        let loss: number | null = null
        const lost = num(stats.packetsLost)
        const received = num(stats.packetsReceived)
        if (lost != null && received != null) {
            if (this.lastLost != null && this.lastReceived != null) {
                const newLost = Math.max(0, lost - this.lastLost)
                const newReceived = Math.max(0, received - this.lastReceived)
                loss = newLost + newReceived > 0 ? newLost / (newLost + newReceived) * 100 : 0
            }
            this.lastLost = lost
            this.lastReceived = received
        }

        this.rows.ping.textContent = ping != null ? `${Math.round(ping)} ms` : "–"
        this.rows.fps.textContent = fps != null ? `${Math.round(fps)}` : "–"
        this.rows.bitrate.textContent = this.lastMbps != null ? `${this.lastMbps.toFixed(1)} Mbit/s` : "–"
        this.rows.loss.textContent = loss != null ? `${loss.toFixed(1)} %` : "–"

        const bad = (ping != null && ping > 120) || (loss != null && loss > 3)
        const ok = (ping != null && ping > 60) || (loss != null && loss > 0.5)
        this.setLevel(ping == null && loss == null ? "none" : bad ? "bad" : ok ? "ok" : "good")
    }

    private setLevel(level: Level) {
        const i = getTranslations(getCurrentLanguage()).stream
        this.root.dataset.level = level
        this.title.textContent = level == "good" ? i.connectionGood : level == "ok" ? i.connectionOk : level == "bad" ? i.connectionBad : i.connection
    }
}
