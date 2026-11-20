// Starlight Streams: what this device can actually play, so the settings only offer what works.
// Checked once per page (a few milliseconds); the screen refresh rate is measured with frames.

export type DeviceCaps = {
    h264: boolean
    h265: boolean
    av1: boolean
    /// Some codec can decode 3840×2160
    decode4k: boolean
    /// 10-bit video can be decoded (needed for HDR)
    decode10bit: boolean
    /// The screen shows HDR
    hdrScreen: boolean
    /// Measured refresh rate of the screen (frames per second), 0 when unknown
    refreshRate: number
}

let cached: Promise<DeviceCaps> | null = null

export function getDeviceCaps(): Promise<DeviceCaps> {
    cached ??= probe()
    return cached
}

/// The codecs the browser's WebRTC can receive (the stream uses WebRTC first)
function webRtcCodecs(): Set<string> {
    try {
        const capabilities = RTCRtpReceiver.getCapabilities?.("video")
        return new Set((capabilities?.codecs ?? []).map(codec => codec.mimeType.toLowerCase()))
    } catch {
        return new Set()
    }
}

async function canDecode(codec: string, width: number, height: number): Promise<boolean> {
    if ("VideoDecoder" in window) {
        try {
            const result = await VideoDecoder.isConfigSupported({ codec, codedWidth: width, codedHeight: height })
            if (result.supported) {
                return true
            }
        } catch {
            // unknown codec string
        }
    }
    if ("mediaCapabilities" in navigator) {
        try {
            const info = await navigator.mediaCapabilities.decodingInfo({
                type: "media-source",
                video: { contentType: `video/mp4; codecs="${codec}"`, width, height, bitrate: 20_000_000, framerate: 60 },
            })
            if (info.supported) {
                return true
            }
        } catch {
            // not answerable
        }
    }
    return false
}

function measureRefreshRate(): Promise<number> {
    return new Promise(resolve => {
        if (document.visibilityState != "visible") {
            resolve(0)
            return
        }
        const times: Array<number> = []
        const step = (time: number) => {
            times.push(time)
            if (times.length < 31) {
                requestAnimationFrame(step)
                return
            }
            // Median frame time, robust against a slow frame
            const deltas = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b)
            const median = deltas[Math.floor(deltas.length / 2)]
            resolve(median > 0 ? Math.round(1000 / median) : 0)
        }
        requestAnimationFrame(step)
        // A hidden or throttled page: don't wait
        setTimeout(() => resolve(0), 1500)
    })
}

async function probe(): Promise<DeviceCaps> {
    const rtc = webRtcCodecs()
    const [h264, h265, av1, h264_4k, h265_4k, av1_4k, h265_10, av1_10, refreshRate] = await Promise.all([
        canDecode("avc1.42E01F", 1920, 1080),
        canDecode("hvc1.1.6.L120.90", 1920, 1080),
        canDecode("av01.0.08M.08", 1920, 1080),
        canDecode("avc1.640033", 3840, 2160),
        canDecode("hvc1.1.6.L153.90", 3840, 2160),
        canDecode("av01.0.12M.08", 3840, 2160),
        canDecode("hvc1.2.4.L120.90", 1920, 1080),
        canDecode("av01.0.08M.10", 1920, 1080),
        measureRefreshRate(),
    ])

    // A browser that can't answer these questions: don't block anything
    const canTell = "VideoDecoder" in window || "mediaCapabilities" in navigator || rtc.size > 0
    if (!canTell) {
        return { h264: true, h265: true, av1: true, decode4k: true, decode10bit: true, hdrScreen: true, refreshRate }
    }

    return {
        h264: h264 || rtc.has("video/h264") || rtc.size == 0,
        h265: h265 || rtc.has("video/h265"),
        av1: av1 || rtc.has("video/av1"),
        decode4k: h264_4k || h265_4k || av1_4k,
        decode10bit: h265_10 || av1_10,
        hdrScreen: window.matchMedia?.("(dynamic-range: high)").matches ?? false,
        refreshRate,
    }
}
