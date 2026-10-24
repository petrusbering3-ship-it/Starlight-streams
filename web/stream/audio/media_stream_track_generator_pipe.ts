import { globalObject } from "../../util"
import { Pipe, PipeInfo } from "../pipeline/index"
import { addPipePassthrough } from "../pipeline/pipes"
import { SampleAudioPlayer, TrackAudioPlayer } from "./index"

export class AudioMediaStreamTrackGeneratorPipe implements SampleAudioPlayer {
    static readonly pipeName = "AudioMediaStreamTrackGeneratorPipe"

    static readonly baseType = "audiotrack"
    static readonly type = "audiosample"

    static async getInfo(): Promise<PipeInfo> {
        return {
            environmentSupported: "MediaStreamTrackGenerator" in globalObject()
        }
    }

    implementationName: string

    private base: TrackAudioPlayer

    private trackGenerator: MediaStreamTrackGenerator
    private writer: WritableStreamDefaultWriter<AudioData>

    constructor(base: TrackAudioPlayer) {
        this.implementationName = `audio_media_stream_track_generator -> ${base.implementationName}`
        this.base = base

        this.trackGenerator = new MediaStreamTrackGenerator({ kind: "audio" })
        this.writer = this.trackGenerator.writable.getWriter()

        addPipePassthrough(this)
    }

    private isFirstSample = true

    // Starlight Streams: the track plays every sample it gets, so samples that arrive in a burst
    // after a network hiccup would add delay that never goes away. Drop samples while more than
    // MAX_BACKLOG_SECS of sound is waiting, so the sound stays close to the picture.
    private static readonly MAX_BACKLOG_SECS = 0.06
    private clockStart: number | null = null
    private writtenSecs = 0

    submitSample(sample: AudioData): void {
        if (this.isFirstSample) {
            this.isFirstSample = false

            this.base.setTrack(this.trackGenerator)
        }

        const now = performance.now() / 1000
        if (this.clockStart == null) {
            this.clockStart = now
        }

        let backlog = this.writtenSecs - (now - this.clockStart)
        if (backlog < 0) {
            // Everything was played (or the stream paused): count from here
            this.clockStart = now
            this.writtenSecs = 0
            backlog = 0
        }

        if (backlog > AudioMediaStreamTrackGeneratorPipe.MAX_BACKLOG_SECS) {
            sample.close()
            return
        }

        this.writtenSecs += sample.duration / 1_000_000
        this.writer.write(sample)
    }

    getBase(): Pipe | null {
        return this.base
    }

}
