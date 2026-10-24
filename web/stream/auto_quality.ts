import { Api, fetchApi } from "../api"
import { Settings } from "../component/settings_menu"

// Starlight Streams: measures the connection to the server right before a stream starts
// and picks resolution, fps and bitrate from it.

export type AutoQuality = {
    mbps: number
    settings: Partial<Settings>
}

const MAX_TEST_BYTES = 16_000_000

async function measureMbps(api: Api): Promise<number> {
    // Grow the download until it takes long enough to be a meaningful measurement
    let bytes = 1_000_000
    let mbps = 0
    for (let round = 0; round < 3; round++) {
        const start = performance.now()
        const response = await fetchApi(api, "/starlight/speedtest", "GET", {
            response: "ignore",
            query: { bytes }
        }, 15000)
        await response.arrayBuffer()
        const seconds = Math.max((performance.now() - start) / 1000, 0.001)

        mbps = bytes * 8 / seconds / 1_000_000
        if (seconds > 0.5 || bytes >= MAX_TEST_BYTES) {
            break
        }
        bytes = Math.min(MAX_TEST_BYTES, Math.ceil(bytes * Math.max(2, 0.8 / seconds)))
    }
    return mbps
}

export function pickQuality(mbps: number): Partial<Settings> {
    // Use ~60% of the measured speed, so short dips don't make the stream stutter
    const bitrate = Math.round(Math.min(50000, Math.max(3000, mbps * 1000 * 0.6)) / 500) * 500

    if (mbps >= 45) {
        return { videoSize: "native", fps: 60, bitrate }
    } else if (mbps >= 12) {
        return { videoSize: "1080p", fps: 60, bitrate }
    } else if (mbps >= 6) {
        return { videoSize: "720p", fps: 60, bitrate }
    } else {
        return { videoSize: "720p", fps: 30, bitrate }
    }
}

export async function measureAutoQuality(api: Api): Promise<AutoQuality | null> {
    try {
        const mbps = await measureMbps(api)
        return { mbps, settings: pickQuality(mbps) }
    } catch (e) {
        console.warn("auto quality: speed test failed, using the saved settings", e)
        return null
    }
}
