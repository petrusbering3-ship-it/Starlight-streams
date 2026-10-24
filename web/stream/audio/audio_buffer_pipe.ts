import { globalObject } from "../../util"
import { Pipe, PipeInfo } from "../pipeline/index"
import { addPipePassthrough } from "../pipeline/pipes"
import { AudioPcmUnit, AudioPlayerSetup, NodeAudioPlayer, PcmAudioPlayer } from "./index"

export class AudioBufferPipe implements PcmAudioPlayer {
    static readonly pipeName = "AudioBufferPipe"

    static async getInfo(): Promise<PipeInfo> {
        return {
            environmentSupported: "AudioBufferSourceNode" in globalObject()
        }
    }

    static readonly baseType = "audionode"
    static readonly type = "audiopcm"

    readonly implementationName: string

    private base: NodeAudioPlayer

    constructor(base: NodeAudioPlayer) {
        this.implementationName = `audio_pcm_buffer -> ${base.implementationName}`
        this.base = base

        addPipePassthrough(this)
    }

    private channels: number = -1
    private sampleRate: number = -1

    private node: AudioNode | null = null

    setup(setup: AudioPlayerSetup) {
        this.channels = setup.channels
        this.sampleRate = setup.sampleRate

        let result
        if ("setup" in this.base && typeof this.base.setup == "function") {
            this.base.setup(...arguments)
        }

        this.node = this.base.getAudioContext().createGain()

        this.base.setSource(this.node)

        return result
    }

    private hadUserInteraction: boolean = false

    onUserInteraction() {
        this.hadUserInteraction = true

        if ("onUserInteraction" in this.base && typeof this.base.onUserInteraction == "function") {
            return this.base.onUserInteraction(...arguments)
        }
    }

    private nextAudioPlayTime: number | null = null

    // Starlight Streams: adaptive buffer. Start small, grow a little after every underrun
    // (crackle) and shrink back slowly while playback is steady.
    private static readonly MIN_LATENCY_SECS = 0.04
    private static readonly MAX_TARGET_LATENCY_SECS = 0.15
    private targetLatency = AudioBufferPipe.MIN_LATENCY_SECS
    private steadySince: number | null = null

    playPcm(unit: AudioPcmUnit): void {
        if (!this.node) {
            return
        }
        if (!this.hadUserInteraction) {
            return
        }

        const now = this.base.getAudioContext().currentTime

        if (this.steadySince == null) {
            this.steadySince = now
        }
        // Steady for a while -> try a smaller buffer again
        if (now - this.steadySince > 5 && this.targetLatency > AudioBufferPipe.MIN_LATENCY_SECS) {
            this.targetLatency = Math.max(AudioBufferPipe.MIN_LATENCY_SECS, this.targetLatency - 0.01)
            this.steadySince = now
        }
        const maxLatency = this.targetLatency + 0.08

        if (this.nextAudioPlayTime == null) {
            this.nextAudioPlayTime = now + this.targetLatency
        }

        let ahead = this.nextAudioPlayTime - this.base.getAudioContext().currentTime

        // Too far ahead -> gently pull back audio
        if (ahead > maxLatency) {
            console.debug("Audio too far ahead, trimming latency");
            this.nextAudioPlayTime = now + this.targetLatency;
            ahead = this.targetLatency;
        }

        // Underrun -> jump forward, and keep a bigger buffer from now on
        if (ahead < 0) {
            this.targetLatency = Math.min(AudioBufferPipe.MAX_TARGET_LATENCY_SECS, this.targetLatency + 0.02)
            this.steadySince = now
            console.debug(`Audio underrun, buffer is now ${Math.round(this.targetLatency * 1000)} ms`)

            this.nextAudioPlayTime = now + this.targetLatency;
        }

        const context = this.base.getAudioContext()

        const buffer = context.createBuffer(this.channels, unit.channelData[0].length, this.sampleRate)

        for (let channel = 0; channel < this.channels; channel++) {
            const channelPcm = unit.channelData[channel]

            buffer.copyToChannel(channelPcm, channel)
        }

        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(this.node)

        source.start(this.nextAudioPlayTime)
        this.nextAudioPlayTime += buffer.duration

        source.onended = () => source.disconnect()
    }

    getBase(): Pipe | null {
        return this.base
    }
}
