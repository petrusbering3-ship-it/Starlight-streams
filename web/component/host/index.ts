import { DetailedHost, DetailedUser, UndetailedHost } from "../../api_bindings"
import { Api, apiDeleteHost, apiGetHost, isDetailedHost, apiPostPair, apiWakeUp, apiShutDown, apiGetUser, apiPatchHost } from "../../api"
import { Component, ComponentEvent } from "../index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { showNotification } from "../notification"
import { showMessage } from "../modal/index"
import { buildUrl } from "../../config_"
import { getPreferredDisplay, HOST_CARD_DISPLAYS, setPreferredDisplay } from "../../stream/display"
import { HOST_IMAGE, HOST_OVERLAY_LOCK, HOST_OVERLAY_NONE, HOST_OVERLAY_OFFLINE } from "../../resources/index"

export type HostEventListener = (event: ComponentEvent<Host>) => void

export class Host implements Component {
    private api: Api

    private hostId: number
    private userCache: DetailedUser | null = null
    private cache: UndetailedHost | DetailedHost | null = null

    private divElement: HTMLDivElement = document.createElement("div")

    private imageElement: HTMLImageElement = document.createElement("img")
    private imageOverlayElement: HTMLImageElement = document.createElement("img")
    private nameElement: HTMLElement = document.createElement("p")
    private statusElement: HTMLElement = document.createElement("p")
    private displaysElement: HTMLDivElement = document.createElement("div")
    private displayBoxes: Array<HTMLDivElement> = []
    private streamButtons: Array<HTMLButtonElement> = []
    private powerElement: HTMLDivElement = document.createElement("div")
    private powerOffButton: HTMLButtonElement = document.createElement("button")

    constructor(api: Api, hostId: number, host: UndetailedHost | DetailedHost | null) {
        this.api = api

        this.hostId = hostId
        this.cache = host

        // Configure image
        this.imageElement.classList.add("host-image")
        this.imageElement.src = HOST_IMAGE

        // Configure image overlay
        this.imageOverlayElement.classList.add("host-image-overlay")

        // Configure name
        this.nameElement.classList.add("host-name")

        // Append elements
        this.divElement.appendChild(this.imageElement)
        this.divElement.appendChild(this.imageOverlayElement)
        this.divElement.appendChild(this.nameElement)

        this.statusElement.classList.add("host-status")
        this.divElement.appendChild(this.statusElement)

        // Display boxes, each with a stream button (Starlight Streams)
        const i = getTranslations(getCurrentLanguage()).host
        this.displaysElement.classList.add("host-displays")
        for (let display = 1; display <= HOST_CARD_DISPLAYS; display++) {
            const box = document.createElement("div")
            box.classList.add("host-display")

            const screen = document.createElement("div")
            screen.classList.add("host-display-screen")
            screen.innerText = `${display}`
            box.appendChild(screen)

            const label = document.createElement("p")
            label.classList.add("host-display-label")
            label.innerText = i.displayName(display)
            box.appendChild(label)

            const streamButton = document.createElement("button")
            streamButton.classList.add("host-stream-button")
            streamButton.innerText = `▶ ${i.stream}`
            streamButton.addEventListener("click", (event) => {
                event.stopPropagation()
                this.powerOnAndPlay(display)
            })
            box.appendChild(streamButton)

            this.displaysElement.appendChild(box)
            this.displayBoxes.push(box)
            this.streamButtons.push(streamButton)
        }
        this.divElement.appendChild(this.displaysElement)
        this.updateDisplayBoxes()

        // Power off
        this.powerElement.classList.add("host-power")
        this.powerOffButton.classList.add("host-power-button", "host-power-off")
        this.powerOffButton.innerText = `⏻ ${i.powerOff}`
        this.powerOffButton.addEventListener("click", (event) => {
            event.stopPropagation()
            this.shutDown()
        })
        this.powerElement.appendChild(this.powerOffButton)
        this.divElement.appendChild(this.powerElement)

        this.divElement.addEventListener("click", this.onClick.bind(this))
        this.divElement.addEventListener("contextmenu", this.onContextMenu.bind(this))

        // Update cache
        if (host != null) {
            this.updateCache(host, null)

            apiGetUser(api).then((user) => {
                this.userCache = user
                this.updatePowerButtons()
            })
        } else {
            this.forceFetch()
        }
    }

    async forceFetch() {
        const [newCache, user] = await Promise.all([
            apiGetHost(this.api, {
                host_id: this.hostId,
            }),
            apiGetUser(this.api)
        ])

        this.updateCache(newCache, user)
    }
    async getCurrentGame(): Promise<number | null> {
        await this.forceFetch()

        if (this.cache && isDetailedHost(this.cache) && this.cache.current_game != 0) {
            return this.cache.current_game
        } else {
            return null
        }
    }

    private async onClick(event: MouseEvent) {
        if (this.cache?.server_state == null) {
            this.onContextMenu(event)
        } else if (this.cache?.paired == "Paired") {
            this.divElement.dispatchEvent(new ComponentEvent("ml-hostopen", this))
        } else {
            await this.pair()
        }
    }

    private onContextMenu(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).host
        const elements = []

        if (this.cache?.server_state != null) {
            elements.push({
                name: i.showDetails,
                callback: this.showDetails.bind(this),
            })

            elements.push({
                name: i.open,
                callback: this.onClick.bind(this)
            })

            elements.push({
                name: i.shutDown,
                callback: this.shutDown.bind(this),
                classes: ["context-menu-element-red"]
            })
        } else if (this.cache?.paired == "Paired") {
            elements.push({
                name: i.sendWakeUpPacket,
                callback: this.wakeUp.bind(this)
            })
        }

        elements.push({
            name: i.reload,
            callback: async () => this.forceFetch()
        })

        if (this.cache?.server_state != null && this.cache?.paired == "NotPaired") {
            elements.push({
                name: i.pair,
                callback: this.pair.bind(this)
            })
        }

        // Make private / global
        if (this.userCache?.role == "Admin") {
            if (this.cache?.owner == "Global") {
                elements.push({
                    name: i.makePrivate,
                    callback: this.makePrivate.bind(this),
                    classes: ["context-menu-element-red"]
                })
            } else if (this.cache?.owner == "ThisUser") {
                elements.push({
                    name: i.makeGlobal,
                    callback: this.makeGlobal.bind(this),
                    classes: ["context-menu-element-red"]
                })
            }
        }

        if (this.cache?.owner == "ThisUser" || this.userCache?.role == "Admin") {
            elements.push({
                name: i.removeHost,
                callback: this.remove.bind(this)
            })
        }

        setContextMenu(event, {
            elements
        })
    }

    private async showDetails() {
        const i = getTranslations(getCurrentLanguage()).host
        let host = this.cache;
        if (!host || !isDetailedHost(host)) {
            host = await apiGetHost(this.api, {
                host_id: this.hostId,
            })
        }
        if (!host || !isDetailedHost(host)) {
            showNotification(i.failedToGetDetails(this.hostId))
            return;
        }
        this.updateCache(host, this.userCache)

        await showMessage(i.details(host))
    }

    addHostRemoveListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.divElement.addEventListener("ml-hostremove", listener as any, options)
    }
    removeHostRemoveListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.divElement.removeEventListener("ml-hostremove", listener as any, options)
    }

    addHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.divElement.addEventListener("ml-hostopen", listener as any, options)
    }
    removeHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.divElement.removeEventListener("ml-hostopen", listener as any, options)
    }

    private async makeGlobal() {
        await apiPatchHost(this.api, {
            host_id: this.hostId,
            change_owner: true,
            owner: null,
        })

        if (this.cache) {
            this.cache.owner = "Global"
        }
    }
    private async makePrivate() {
        const user = this.userCache ?? await apiGetUser(this.api)

        await apiPatchHost(this.api, {
            host_id: this.hostId,
            change_owner: true,
            owner: user.id,
        })

        if (this.cache) {
            this.cache.owner = "ThisUser"
        }
    }

    private async remove() {
        await apiDeleteHost(this.api, {
            host_id: this.getHostId()
        })

        this.divElement.dispatchEvent(new ComponentEvent("ml-hostremove", this))
    }
    private async wakeUp() {
        const i = getTranslations(getCurrentLanguage()).host
        await apiWakeUp(this.api, {
            host_id: this.getHostId()
        })

        await showMessage(i.wakeUpSent)
    }
    private updatePowerButtons() {
        // Guests may not turn off the pc
        const isGuest = this.userCache?.name.startsWith("guest-") ?? false
        this.powerOffButton.style.display = isGuest ? "none" : ""
    }

    private updateDisplayBoxes() {
        const preferred = getPreferredDisplay(this.hostId)
        this.displayBoxes.forEach((box, index) => {
            box.classList.toggle("host-display-last", index + 1 == preferred)
        })
    }

    private poweringOn = false

    /// Starlight Streams: wakes the pc, waits until it's online and then starts the last played game on the chosen display
    private async powerOnAndPlay(display: number) {
        const i = getTranslations(getCurrentLanguage()).host
        if (this.poweringOn) {
            return
        }
        this.poweringOn = true

        setPreferredDisplay(this.hostId, display)
        this.updateDisplayBoxes()
        const button = this.streamButtons[display - 1]

        try {
            await this.forceFetch().catch(() => { })

            if (this.cache?.server_state == null) {
                try {
                    await apiWakeUp(this.api, { host_id: this.getHostId() })
                } catch (e) {
                    await showMessage(i.wakeUpFailed)
                    return
                }

                const start = Date.now()
                while (this.cache?.server_state == null) {
                    const seconds = Math.round((Date.now() - start) / 1000)
                    if (seconds > 180) {
                        await showMessage(i.startTimeout)
                        return
                    }
                    button.innerText = i.startingUp(seconds)

                    await new Promise(resolve => setTimeout(resolve, 3000))
                    await this.forceFetch().catch(() => { })
                }
            }

            if (this.cache?.paired != "Paired") {
                await this.pair()
                return
            }

            let lastAppId: string | null = null
            try {
                lastAppId = localStorage.getItem(`starlight-last-app-${this.getHostId()}`)
            } catch (e) {
                // storage might be unavailable
            }

            if (lastAppId) {
                const query = new URLSearchParams({ hostId: `${this.getHostId()}`, appId: lastAppId })
                // Same tab: opening a new tab after waiting would be blocked as a popup
                window.location.href = buildUrl(`/stream.html?${query}`)
            } else {
                this.divElement.dispatchEvent(new ComponentEvent("ml-hostopen", this))
            }
        } finally {
            this.poweringOn = false
            button.innerText = `▶ ${i.stream}`
        }
    }

    private async shutDown() {
        const i = getTranslations(getCurrentLanguage()).host
        if (!confirm(i.shutDownConfirm(this.cache?.name ?? ""))) {
            return
        }

        try {
            await apiShutDown(this.api, {
                host_id: this.getHostId()
            })
        } catch (e) {
            await showMessage(i.shutDownFailed)
            return
        }

        await showMessage(i.shutDownSent)
    }
    private async pair() {
        const i = getTranslations(getCurrentLanguage()).host
        if (this.cache?.paired == "Paired") {
            await this.forceFetch()

            if (this.cache?.paired == "Paired") {
                showMessage(i.alreadyPaired)
                return;
            }
        }

        const responseStream = await apiPostPair(this.api, {
            host_id: this.getHostId()
        })

        if (typeof responseStream.response == "string") {
            throw `failed to pair (stage 1): ${responseStream.response}`
        }

        const messageAbort = new AbortController()
        showMessage(i.pairPrompt(this.getCache()?.name ?? "", responseStream.response.Pin), { signal: messageAbort.signal })

        const resultResponse = await responseStream.next()
        messageAbort.abort()

        if (!resultResponse) {
            throw "missing stage 2 of pairing"
        } else if (typeof resultResponse == "string") {
            throw `failed to pair (stage 2): ${resultResponse}`
        }

        this.updateCache(resultResponse.Paired, null)
    }

    getHostId(): number {
        return this.hostId
    }

    getCache(): DetailedHost | UndetailedHost | null {
        return this.cache
    }

    updateCache(host: UndetailedHost | DetailedHost, user: DetailedUser | null) {
        const i = getTranslations(getCurrentLanguage()).host
        if (this.getHostId() != host.host_id) {
            showNotification(i.overwriteMismatch(this.getHostId(), host.host_id))
            return
        }

        if (this.cache == null) {
            this.cache = host
        } else {
            // if server_state == null it means this host is offline
            // -> updating cache means setting it to offline
            if (this.cache.server_state != null) {
                Object.assign(this.cache, host)
            } else {
                this.cache = host
            }
        }

        if (user) {
            this.userCache = user
        }
        this.updatePowerButtons()

        // Update Elements
        this.nameElement.innerText = this.cache.name

        if (this.cache.server_state == null) {
            this.imageOverlayElement.src = HOST_OVERLAY_OFFLINE
            this.statusElement.innerText = `○ ${i.statusOff}`
            this.statusElement.dataset.state = "off"
        } else if (this.cache.paired != "Paired") {
            this.imageOverlayElement.src = HOST_OVERLAY_LOCK
            this.statusElement.innerText = `🔒 ${i.statusNotPaired}`
            this.statusElement.dataset.state = "locked"
        } else {
            this.imageOverlayElement.src = HOST_OVERLAY_NONE
            this.statusElement.innerText = `● ${i.statusReady}`
            this.statusElement.dataset.state = "ready"
        }
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.divElement)
    }
}
