// Starlight Streams: picture sharpening.
//
// Draws the stream's <video> element into a WebGL2 canvas on top of it, scaled to the
// screen's real pixels and sharpened with Contrast Adaptive Sharpening (the sharpening of
// AMD FidelityFX CAS / FSR1): edges get crisper without halos on already sharp areas.
// Works with every pipeline that ends in a <video> element (the default); the canvas ignores
// the mouse, so input still reaches the stream.

export type SharpeningMode = "off" | "auto" | "low" | "medium" | "high"

const SHARPNESS: Record<Exclude<SharpeningMode, "off" | "auto">, number> = {
    low: 0.25,
    medium: 0.55,
    high: 0.9,
}

/// In "auto" mode, sharpen only when the picture is scaled up by at least this much
const AUTO_MIN_UPSCALE = 1.1

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_sharpness;
in vec2 v_uv;
out vec4 o_color;
void main() {
    vec3 c = texture(u_tex, v_uv).rgb;
    vec3 n = texture(u_tex, v_uv + vec2(0.0, -u_texel.y)).rgb;
    vec3 s = texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb;
    vec3 w = texture(u_tex, v_uv + vec2(-u_texel.x, 0.0)).rgb;
    vec3 e = texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb;

    // Contrast adaptive sharpening: less sharpening where the contrast is already high
    vec3 mn = min(c, min(min(n, s), min(w, e)));
    vec3 mx = max(c, max(max(n, s), max(w, e)));
    vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-5)), 0.0, 1.0));
    vec3 weight = amp * (-1.0 / mix(8.0, 5.0, u_sharpness));

    vec3 color = (c + (n + s + w + e) * weight) / (1.0 + 4.0 * weight);
    o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type)
    if (!shader) {
        return null
    }
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn("sharpening: shader failed to compile", gl.getShaderInfoLog(shader))
        return null
    }
    return shader
}

export class VideoEnhancer {
    private mode: SharpeningMode

    private canvas = document.createElement("canvas")
    private gl: WebGL2RenderingContext | null = null
    private texture: WebGLTexture | null = null
    private texelLocation: WebGLUniformLocation | null = null
    private sharpnessLocation: WebGLUniformLocation | null = null

    private video: HTMLVideoElement | null = null
    private findVideoTimer: number | null = null
    private active = false

    constructor(mode: SharpeningMode) {
        this.mode = mode

        this.canvas.classList.add("video-stream", "video-enhancer")
        this.canvas.hidden = true
    }

    /// Starts looking for the stream's video element (it is replaced when the transport changes)
    start() {
        if (this.mode == "off" || !this.setupGl()) {
            return
        }

        this.findVideoTimer = window.setInterval(() => this.findVideo(), 1000)
        this.findVideo()
    }

    stop() {
        if (this.findVideoTimer != null) {
            window.clearInterval(this.findVideoTimer)
            this.findVideoTimer = null
        }
        this.setActive(false)
        this.canvas.remove()
    }

    setMode(mode: SharpeningMode) {
        const wasOff = this.mode == "off"
        this.mode = mode
        if (wasOff && mode != "off") {
            this.start()
        } else if (mode == "off") {
            this.stop()
        }
    }

    private setupGl(): boolean {
        if (this.gl) {
            return true
        }

        const gl = this.canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            desynchronized: true,
            preserveDrawingBuffer: false,
        }) as WebGL2RenderingContext | null
        if (!gl) {
            console.warn("sharpening: WebGL2 is not available")
            return false
        }

        const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
        const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
        const program = gl.createProgram()
        if (!vertex || !fragment || !program) {
            return false
        }
        gl.attachShader(program, vertex)
        gl.attachShader(program, fragment)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn("sharpening: program failed to link", gl.getProgramInfoLog(program))
            return false
        }
        gl.useProgram(program)

        // One triangle that covers the whole viewport
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, "a_pos")
        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

        this.texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

        this.texelLocation = gl.getUniformLocation(program, "u_texel")
        this.sharpnessLocation = gl.getUniformLocation(program, "u_sharpness")
        gl.uniform1i(gl.getUniformLocation(program, "u_tex"), 0)

        this.gl = gl
        return true
    }

    private findVideo() {
        const video = document.querySelector("video.video-stream") as HTMLVideoElement | null
        if (video == this.video) {
            return
        }
        this.video = video
        if (video) {
            // Right after the video: on top of it, but below the menus and stats
            video.after(this.canvas)
            this.scheduleFrame(video)
        } else {
            this.setActive(false)
        }
    }

    private scheduleFrame(video: HTMLVideoElement) {
        const onFrame = () => {
            if (this.video != video || this.findVideoTimer == null) {
                return
            }
            this.draw(video)
            this.scheduleFrame(video)
        }

        if ("requestVideoFrameCallback" in video) {
            // Called for every new frame of the stream, as soon as it can be drawn
            video.requestVideoFrameCallback(onFrame)
        } else {
            requestAnimationFrame(onFrame)
        }
    }

    private setActive(active: boolean) {
        if (this.active == active) {
            return
        }
        this.active = active
        this.canvas.hidden = !active
    }

    private sharpness(videoWidth: number, videoHeight: number, shownWidth: number, shownHeight: number): number | null {
        if (this.mode == "off") {
            return null
        }
        if (this.mode == "auto") {
            const upscale = Math.min(shownWidth / videoWidth, shownHeight / videoHeight)
            return upscale >= AUTO_MIN_UPSCALE ? SHARPNESS.medium : null
        }
        return SHARPNESS[this.mode]
    }

    private draw(video: HTMLVideoElement) {
        const gl = this.gl
        const videoWidth = video.videoWidth
        const videoHeight = video.videoHeight
        if (!gl || videoWidth == 0 || videoHeight == 0) {
            return
        }

        // Size the canvas to the screen's real pixels. Measure the video: it has the same size,
        // and the canvas has none while it is hidden
        const rect = video.getBoundingClientRect()
        const scale = window.devicePixelRatio || 1
        const width = Math.max(1, Math.round(rect.width * scale))
        const height = Math.max(1, Math.round(rect.height * scale))
        if (this.canvas.width != width || this.canvas.height != height) {
            this.canvas.width = width
            this.canvas.height = height
        }

        // Fit the picture like object-fit: contain
        const fit = Math.min(width / videoWidth, height / videoHeight)
        const shownWidth = Math.round(videoWidth * fit)
        const shownHeight = Math.round(videoHeight * fit)

        const sharpness = this.sharpness(videoWidth, videoHeight, shownWidth, shownHeight)
        if (sharpness == null) {
            this.setActive(false)
            return
        }

        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        } catch (e) {
            // e.g. a protected or not yet decodable frame
            this.setActive(false)
            return
        }

        gl.viewport(0, 0, width, height)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.viewport(Math.floor((width - shownWidth) / 2), Math.floor((height - shownHeight) / 2), shownWidth, shownHeight)
        gl.uniform2f(this.texelLocation, 1 / videoWidth, 1 / videoHeight)
        gl.uniform1f(this.sharpnessLocation, sharpness)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        this.setActive(true)
    }
}
