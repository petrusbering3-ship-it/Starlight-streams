import { Settings } from "../component/settings_menu"
import { StatValue } from "./stats"

// Starlight Streams: auto quality during the stream.
// Watches the connection while streaming and asks for a lower quality when the network gets
// worse, and for a higher one (up to the quality the stream started with) when it's good again.

export type QualityLevel = {
    videoSize: Settings["videoSize"]
    bitrate: number
    fps: number
}

const MIN_BITRATE = 3000
const STEP = 0.7

/// Resolutions in order, "custom" keeps its size
const SIZE_ORDER: Array<Settings["videoSize"]> = ["720p", "1080p", "1440p", "4k", "native"]

/// The lowest bitrate (kbps) a resolution still looks fine at
function minBitrateFor(size: Settings["videoSize"]): number {
    switch (size) {
        case "720p": return 0
        case "1080p": return 8000
        default: return 15000
    }
}

function sizeIndex(size: Settings["videoSize"]): number {
    return SIZE_ORDER.indexOf(size)
}

function roundBitrate(kbps: number): number {
    return Math.round(kbps / 500) * 500
}

export function stepDown(level: QualityLevel): QualityLevel | null {
    let bitrate = roundBitrate(level.bitrate * STEP)
    let fps = level.fps

    if (bitrate < MIN_BITRATE) {
        if (level.bitrate > MIN_BITRATE) {
            bitrate = MIN_BITRATE
        } else if (fps > 30) {
            // Already at the lowest bitrate: halve the frames instead
            return { ...level, fps: 30 }
        } else {
            return null
        }
    }

    // Lower the resolution when the bitrate gets too low for it
    let videoSize = level.videoSize
    while (sizeIndex(videoSize) > 0 && bitrate < minBitrateFor(videoSize)) {
        videoSize = SIZE_ORDER[sizeIndex(videoSize) - 1]
    }

    return { videoSize, bitrate, fps }
}

export function stepUp(level: QualityLevel, ceiling: QualityLevel): QualityLevel | null {
    if (level.fps < ceiling.fps) {
        return { ...level, fps: ceiling.fps }
    }
    if (level.bitrate >= ceiling.bitrate) {
        return null
    }

    const bitrate = Math.min(ceiling.bitrate, roundBitrate(level.bitrate / STEP))

    // Raise the resolution as far as the bitrate allows, but not above where the stream started
    let videoSize = level.videoSize
    if (sizeIndex(videoSize) >= 0 && sizeIndex(ceiling.videoSize) >= 0) {
        while (sizeIndex(videoSize) < sizeIndex(ceiling.videoSize)
            && bitrate >= minBitrateFor(SIZE_ORDER[sizeIndex(videoSize) + 1])) {
            videoSize = SIZE_ORDER[sizeIndex(videoSize) + 1]
        }
    }
    if (bitrate >= ceiling.bitrate) {
        videoSize = ceiling.videoSize
    }

    return { videoSize, bitrate, fps: level.fps }
}

const SAMPLE_INTERVAL_MS = 2000
/// Bad samples in a row before stepping down (6 s)
const BAD_SAMPLES_FOR_DOWN = 3
/// Good samples in a row before stepping up (90 s)
const GOOD_SAMPLES_FOR_UP = 45
/// Don't judge the first seconds: the connection is still settling
const WARMUP_MS = 8000

function num(value: StatValue | undefined): number | null {
    return typeof value == "number" && isFinite(value) ? value : null
}

export class QualityMonitor {
    private getStats: () => Promise<Record<string, StatValue> | null>
    private onChange: (direction: "down" | "up") => void

    private intervalId: number | null = null
    private startedAt = 0

    private lastLost: number | null = null
    private lastReceived: number | null = null
    private lastDecoded: number | null = null
    private lastDropped: number | null = null
    private minRtt: number | null = null

    private badStreak = 0
    private goodStreak = 0

    constructor(getStats: () => Promise<Record<string, StatValue> | null>, onChange: (direction: "down" | "up") => void) {
        this.getStats = getStats
        this.onChange = onChange
    }

    start() {
        this.startedAt = performance.now()
        this.intervalId = window.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    }

    stop() {
        if (this.intervalId != null) {
            window.clearInterval(this.intervalId)
            this.intervalId = null
        }
    }

    private async sample() {
        let stats
        try {
            stats = await this.getStats()
        } catch (e) {
            return
        }
        if (!stats || this.intervalId == null) {
            return
        }

        let bad = false
        let good = true

        // WebRTC: packet loss and frames the browser had to drop
        const lost = num(stats.packetsLost)
        const received = num(stats.packetsReceived)
        if (lost != null && received != null) {
            if (this.lastLost != null && this.lastReceived != null) {
                const newLost = Math.max(0, lost - this.lastLost)
                const newReceived = Math.max(0, received - this.lastReceived)
                const total = newLost + newReceived
                if (total > 50) {
                    const loss = newLost / total
                    bad ||= loss > 0.03
                    good &&= loss < 0.005
                }
            }
            this.lastLost = lost
            this.lastReceived = received
        }

        const decoded = num(stats.framesDecoded)
        const dropped = num(stats.framesDropped)
        if (decoded != null && dropped != null) {
            if (this.lastDecoded != null && this.lastDropped != null) {
                const newDecoded = Math.max(0, decoded - this.lastDecoded)
                const newDropped = Math.max(0, dropped - this.lastDropped)
                if (newDecoded + newDropped > 20) {
                    const dropRate = newDropped / (newDecoded + newDropped)
                    bad ||= dropRate > 0.1
                    good &&= dropRate < 0.02
                }
            }
            this.lastDecoded = decoded
            this.lastDropped = dropped
        }

        // Web Sockets: the round trip grows when the connection can't keep up
        const rtt = num(stats.relayToClientRttMs)
        if (rtt != null) {
            this.minRtt = this.minRtt == null ? rtt : Math.min(this.minRtt, rtt)
            bad ||= rtt > Math.max(150, this.minRtt * 2.5)
            good &&= rtt < this.minRtt * 1.5 + 30
        }

        if (performance.now() - this.startedAt < WARMUP_MS) {
            return
        }

        if (bad) {
            this.goodStreak = 0
            this.badStreak++
            if (this.badStreak >= BAD_SAMPLES_FOR_DOWN) {
                this.badStreak = 0
                this.onChange("down")
            }
        } else if (good) {
            this.badStreak = 0
            this.goodStreak++
            if (this.goodStreak >= GOOD_SAMPLES_FOR_UP) {
                this.goodStreak = 0
                this.onChange("up")
            }
        } else {
            this.badStreak = 0
            this.goodStreak = 0
        }
    }
}
