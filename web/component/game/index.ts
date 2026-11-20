import { Component, ComponentEvent } from "../index"
import { Api, apiGetAppImage, apiHostCancel } from "../../api"
import { App } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { showMessage } from "../modal/index"
import { APP_NO_IMAGE } from "../../resources/index"
import { buildUrl } from "../../config_"
import { button, el } from "../../icons"
import { launchTransition } from "../launch_transition"

export type GameCache = App & { activeApp: number | null }

export type GameEventListener = (event: ComponentEvent<Game>) => void

export class Game implements Component {
    private api: Api

    private hostId: number
    private appId: number

    private mounted: number = 0
    private divElement: HTMLDivElement = document.createElement("div")
    private coverButton: HTMLButtonElement = document.createElement("button")
    private titleElement: HTMLElement = el("span", "title")
    private runningLabel: HTMLElement = el("span", "sl-label sl-red")
    private strip: HTMLElement = el("div", "sl-game-strip")

    private imageBlob: Blob | null = null
    private imageBlobUrl: string | null = null
    private imageElement: HTMLImageElement = document.createElement("img")

    private cache: GameCache

    constructor(api: Api, hostId: number, appId: number, cache: GameCache) {
        this.api = api

        this.hostId = hostId
        this.appId = appId

        this.cache = cache

        // Configure image
        this.imageElement.classList.add("app-image")
        this.imageElement.src = APP_NO_IMAGE

        this.forceLoadImage(false)

        // Swiss Console game card (design/screens/S-Games): cover, title, and Resume / Stop when it runs
        const i = getTranslations(getCurrentLanguage()).game
        this.divElement.className = "sl-game"
        this.coverButton.type = "button"
        this.coverButton.className = "sl-game-cover"
        this.coverButton.appendChild(this.imageElement)
        this.coverButton.addEventListener("click", this.onClick.bind(this))

        const resume = button("sl-btn sl-btn-go sl-btn-sm", i.resumeSession, "play", true)
        resume.addEventListener("click", () => {
            this.startStream()
            this.divElement.dispatchEvent(new ComponentEvent("ml-gamereload", this))
        })
        const stop = button("sl-btn sl-btn-danger sl-btn-sm", i.stopCurrentSession, "stop")
        stop.addEventListener("click", () => this.stopSession())
        this.strip.append(resume, stop)

        this.runningLabel.textContent = i.running
        const caption = el("div", "sl-game-caption")
        caption.append(this.titleElement, this.runningLabel)
        this.divElement.append(this.coverButton, caption, this.strip)
        this.divElement.addEventListener("contextmenu", this.onContextMenu.bind(this))

        this.updateCache(cache)
    }

    async forceLoadImage(forceServerRefresh: boolean) {
        this.imageBlob = await apiGetAppImage(this.api, {
            host_id: this.hostId,
            app_id: this.appId,
            force_refresh: forceServerRefresh
        })

        this.updateImage()
    }
    private updateImage() {
        // generate and set url
        if (this.imageBlob && !this.imageBlobUrl && this.mounted > 0) {
            this.imageBlobUrl = URL.createObjectURL(this.imageBlob)

            this.imageElement.classList.add("app-image-loaded")
            this.imageElement.src = this.imageBlobUrl
        }

        // revoke url
        if (this.imageBlobUrl && this.mounted <= 0) {
            URL.revokeObjectURL(this.imageBlobUrl)
            this.imageBlobUrl = null

            this.imageElement.classList.remove("app-image-loaded")
            this.imageElement.src = ""
        }
    }

    updateCache(cache: GameCache) {
        this.cache = cache

        this.titleElement.textContent = cache.title
        this.coverButton.setAttribute("aria-label", cache.title)
        this.divElement.classList.toggle("is-running", this.isActive())
        this.runningLabel.hidden = !this.isActive()
        this.strip.hidden = !this.isActive()
    }

    getTitle(): string {
        return this.cache.title
    }

    private async stopSession() {
        const i = getTranslations(getCurrentLanguage()).game
        const response = await apiHostCancel(this.api, { host_id: this.hostId })
        if (!response.success) {
            await showMessage(i.failedToCloseApp)
        }

        this.divElement.dispatchEvent(new ComponentEvent("ml-gamereload", this))
    }

    private async onClick(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).game
        if (this.cache.activeApp != null) {
            const elements = []

            if (this.isActive()) {
                elements.push({
                    name: i.resumeSession,
                    callback: async () => {
                        this.startStream()

                        const event = new ComponentEvent("ml-gamereload", this)
                        this.divElement.dispatchEvent(event)
                    }
                })
            }

            elements.push({
                name: i.stopCurrentSession,
                icon: "stop" as const,
                classes: ["context-menu-element-red"],
                callback: () => this.stopSession()
            })

            setContextMenu(event, {
                elements
            })
        } else {
            this.startStream()

            await new Promise(r => window.setTimeout(r, 6000))

            const event = new ComponentEvent("ml-gamereload", this)
            this.divElement.dispatchEvent(event)
        }
    }
    private async startStream() {
        // Starlight Streams: remembered for "Power On & Play"
        try {
            localStorage.setItem(`starlight-last-app-${this.getHostId()}`, `${this.getAppId()}`)
        } catch (e) {
            // storage might be unavailable
        }

        let query = new URLSearchParams({
            hostId: this.getHostId(),
            appId: this.getAppId(),
        } as any)

        if (window.matchMedia('(display-mode: standalone)').matches) {
            // If we're in a pwa: open in the current tab
            // If we don't do this we might get a url bar at the top
            await launchTransition(this.divElement, this.divElement, Number(this.getHostId()))
            window.location.href = buildUrl(`/stream.html?${query}`)
        } else {
            window.open(buildUrl(`/stream.html?${query}`), "_blank")
        }
    }

    private onContextMenu(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).game
        const elements = []

        elements.push({
            name: i.showDetails,
            icon: "info" as const,
            callback: this.showDetails.bind(this),
        })

        elements.push({
            name: i.open,
            icon: "play" as const,
            callback: async () => {
                this.startStream()

                const event = new ComponentEvent("ml-gamereload", this)
                this.divElement.dispatchEvent(event)
            }
        })

        setContextMenu(event, {
            elements
        })
    }

    private async showDetails() {
        const app = this.cache
        const i = getTranslations(getCurrentLanguage()).game
        await showMessage(i.details(app))
    }

    private isActive(): boolean {
        return this.cache.activeApp == this.appId
    }

    addForceReloadListener(listener: GameEventListener) {
        this.divElement.addEventListener("ml-gamereload", listener as any)
    }
    removeForceReloadListener(listener: GameEventListener) {
        this.divElement.removeEventListener("ml-gamereload", listener as any)
    }

    getHostId(): number {
        return this.hostId
    }
    getAppId(): number {
        return this.appId
    }

    mount(parent: HTMLElement): void {
        this.mounted++
        this.updateImage()

        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {

        parent.removeChild(this.divElement)

        this.mounted--
        this.updateImage()
    }
}
