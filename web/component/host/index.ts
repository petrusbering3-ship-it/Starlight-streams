import { DetailedHost, DetailedUser, HostDisplay, UndetailedHost } from "../../api_bindings"
import { Api, apiDeleteHost, apiGetHost, isDetailedHost, apiPostPair, apiWakeUp, apiShutDown, apiSleep, apiHostDisplays, apiGetUser, apiPatchHost, apiHostSession } from "../../api"
import { Component, ComponentEvent } from "../index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { showNotification } from "../notification"
import { showMessage } from "../modal/index"
import { buildUrl } from "../../config_"
import { DEFAULT_DISPLAY_COUNT, getCachedDisplays, getLastStream, getPreferredDisplay, setCachedDisplays, setPreferredDisplay } from "../../stream/display"
import { button, el, icon, starIcon } from "../../icons"
import { confirmDialog, openSlModal } from "../sl_modal"
import { launchTransition, prepareLaunchShot } from "../launch_transition"

// Starlight Streams: one PC on the home page (design/screens/S-Home): a row in the PC index on
// the left, and the detail with the display table on the right when it's selected.

export type HostEventListener = (event: ComponentEvent<Host>) => void

/// How long a PC usually takes to start, for the progress bar
const TYPICAL_START_SECONDS = 45

function twoDigits(n: number): string {
    return String(n).padStart(2, "0")
}

function timeAgo(at: number): string {
    const i = getTranslations(getCurrentLanguage()).host
    const minutes = Math.round((Date.now() - at) / 60_000)
    if (minutes < 1) return i.justNow
    if (minutes < 60) return i.minutesAgo(minutes)
    const hours = Math.round(minutes / 60)
    if (hours < 48) return i.hoursAgo(hours)
    return i.daysAgo(Math.round(hours / 24))
}

export class Host implements Component {
    private api: Api

    private hostId: number
    private userCache: DetailedUser | null = null
    private cache: UndetailedHost | DetailedHost | null = null
    private displays: Array<HostDisplay> | null

    private events = new EventTarget()

    // Index row (left)
    readonly indexRow: HTMLButtonElement = el("button", "sl-index-row")
    private indexNumber = el("span", "sl-mono sl-muted")
    private indexName = el("span", "name")
    private indexStatus = el("span", "sl-status")

    // Detail (right)
    readonly detail: HTMLElement = el("section", "sl-pc")
    private statusLine = el("span", "sl-status")
    private nameElement = el("h1", "sl-h1 sl-pc-name")
    private moreButton = el("button", "sl-btn sl-btn-quiet sl-btn-icon")
    private progress = el("div", "sl-progress sl-pc-progress")
    private progressBar = el("i")
    private table = el("div", "sl-pc-table")
    private rows = el("div", "sl-pc-rows")
    private unpaired = el("div", "sl-pc-unpaired")
    private foot = el("div", "sl-pc-foot")
    private sleepButton = button("sl-btn sl-btn-quiet", "", "moon")
    private powerOffButton = button("sl-btn sl-btn-danger", "", "power")
    private note = el("span", "note")
    private streamButtons: Array<HTMLButtonElement> = []

    private poweringOn = false
    private startingSeconds: number | null = null
    /// Starlight Streams: 0 wake sent, 1 pc on, 2 logged in, 3 ready
    private startStage = 0
    private shotPreparedAt = 0
    private startSteps = el("div", "sl-steps sl-pc-steps")
    private displaysFetchedAt = 0

    constructor(api: Api, hostId: number, host: UndetailedHost | DetailedHost | null) {
        const i = getTranslations(getCurrentLanguage()).host
        this.api = api
        this.hostId = hostId
        this.cache = host
        this.displays = getCachedDisplays(hostId)

        // Index row
        this.indexRow.type = "button"
        this.indexRow.append(this.indexNumber, this.indexName, this.indexStatus)
        this.indexRow.addEventListener("contextmenu", this.onContextMenu.bind(this))

        // Detail: status, name and the "⋯" menu
        const head = el("div", "sl-pc-head")
        const titles = el("div", "sl-pc-titles")
        titles.append(this.statusLine, this.nameElement)
        this.moreButton.type = "button"
        this.moreButton.setAttribute("aria-haspopup", "menu")
        this.moreButton.appendChild(icon("more"))
        this.moreButton.addEventListener("click", event => this.onContextMenu(event, this.moreButton))
        head.append(titles, this.moreButton)
        this.progress.appendChild(this.progressBar)
        this.progress.hidden = true
        this.startSteps.hidden = true

        // The display timetable
        const tableHead = el("div", "sl-table-head")
        for (const label of [i.tableNo, i.tableDisplay, i.tableResolution, i.tableRefresh, i.tableModel, ""]) {
            tableHead.appendChild(el("span", "sl-label", label))
        }
        this.table.append(tableHead, this.rows)

        // Not paired
        const question = el("span", "sl-num sl-red sl-pc-question", "?")
        question.setAttribute("aria-hidden", "true")
        const unpairedText = el("div", "sl-pc-unpaired-text")
        const pairButton = el("button", "sl-btn sl-btn-ink sl-pc-pair")
        pairButton.type = "button"
        pairButton.append(i.pair, el("span", undefined, "→"))
        pairButton.addEventListener("click", () => this.pair())
        unpairedText.append(el("h3", "sl-h3", i.pairFirst), el("p", "sl-ink2", i.pairFirstText), pairButton)
        this.unpaired.append(question, unpairedText)

        // Sleep, power off and the last stream
        this.sleepButton.append(i.sleep)
        this.sleepButton.addEventListener("click", () => this.sleep())
        this.powerOffButton.append(i.powerOff)
        this.powerOffButton.addEventListener("click", () => this.shutDown())
        this.foot.append(this.sleepButton, this.powerOffButton, this.note)

        this.detail.append(head, this.progress, this.startSteps, el("div", "sl-rule"), this.table, this.unpaired, this.foot)
        this.detail.addEventListener("contextmenu", event => {
            if ((event.target as HTMLElement).closest(".sl-pc-head")) {
                this.onContextMenu(event)
            }
        })

        this.renderDisplays()
        this.render()

        // Update cache
        if (host != null) {
            this.updateCache(host, null)

            apiGetUser(api).then((user) => {
                this.userCache = user
                this.render()
            })
        } else {
            this.forceFetch()
        }
    }

    // -- data

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

        this.refreshDisplays()
        this.render()
    }

    /// Asks which displays the pc has (at most every 30 seconds). The server remembers them, also while the pc is off
    private async refreshDisplays() {
        if (Date.now() - this.displaysFetchedAt < 30_000 || this.poweringOn) {
            return
        }
        this.displaysFetchedAt = Date.now()

        try {
            const displays = (await apiHostDisplays(this.api, { host_id: this.hostId })).displays
            if (displays.length == 0) {
                return
            }
            if (JSON.stringify(this.displays) != JSON.stringify(displays)) {
                setCachedDisplays(this.hostId, displays)
                this.displays = displays
                this.renderDisplays()
                this.render()
            }
        } catch (e) {
            // Older power agent or not reachable: keep the displays we know
        }
    }

    // -- rendering

    private isGuest(): boolean {
        return this.userCache?.name.startsWith("guest-") ?? false
    }

    private renderDisplays() {
        const i = getTranslations(getCurrentLanguage()).host
        const count = this.displays?.length ?? DEFAULT_DISPLAY_COUNT

        this.rows.replaceChildren()
        this.streamButtons = []
        for (let display = 1; display <= count; display++) {
            const info = this.displays?.[display - 1]

            const row = el("div", "sl-display-row")
            row.dataset.display = `${display}`
            // Wakes the screenshot taker on the pc, for the start animation
            row.addEventListener("pointerenter", () => {
                if (this.cache?.server_state != null && Date.now() - this.shotPreparedAt > 4000) {
                    this.shotPreparedAt = Date.now()
                    prepareLaunchShot(this.api, this.getHostId(), display)
                }
            })

            const titleCell = el("div", "sl-display-title")
            const title = el("span", "title", i.displayName(display))
            if (info?.primary) {
                title.appendChild(starIcon(i.primaryDisplay))
            }
            const lastUsed = el("span", "sl-label sl-red sl-last-used", i.lastUsed)
            titleCell.append(title, lastUsed)

            const stream = el("button", "sl-btn sl-btn-go")
            stream.type = "button"
            stream.append(i.stream, icon("play"))
            stream.setAttribute("aria-label", `${i.stream} ${i.displayName(display)}`)
            stream.addEventListener("click", () => this.powerOnAndPlay(display))
            this.streamButtons.push(stream)

            row.append(
                el("span", "sl-num", twoDigits(display)),
                titleCell,
                el("span", "sl-mono res", info ? `${info.width}×${info.height}` : "—"),
                el("span", "sl-mono hz", info ? `${info.refresh_rate} Hz` : "—"),
                el("span", "sl-ink2 model", info?.name ?? ""),
                stream,
            )
            this.rows.appendChild(row)
        }

        // A display that doesn't exist anymore can't be streamed
        if (this.displays && getPreferredDisplay(this.hostId) > count) {
            setPreferredDisplay(this.hostId, 1)
        }
    }

    /// Updates everything that depends on the state of the pc
    private render() {
        const i = getTranslations(getCurrentLanguage()).host
        const name = this.cache?.name ?? ""
        const off = this.cache?.server_state == null
        const paired = this.cache?.paired == "Paired"
        const starting = this.startingSeconds != null
        const displayCount = this.displays?.length ?? DEFAULT_DISPLAY_COUNT
        const address = this.cache && isDetailedHost(this.cache) ? this.cache.address : null

        this.indexName.textContent = name
        this.nameElement.textContent = name
        this.moreButton.setAttribute("aria-label", i.moreFor(name))

        // Status in the index and above the name
        let state: "ready" | "off" | "unpaired" | "starting"
        let short: string
        let long: string
        if (starting) {
            state = "starting"
            short = i.startingUp(this.startingSeconds!)
            long = `${short} · ${i.wakingThePc}`
        } else if (off) {
            state = "off"
            short = i.statusOff
            long = [i.statusOff, i.displayCount(displayCount), address].filter(Boolean).join(" · ")
        } else if (!paired) {
            state = "unpaired"
            short = i.statusNotPaired
            long = [i.statusNotPaired, address].filter(Boolean).join(" · ")
        } else {
            state = "ready"
            short = i.statusReady
            long = [i.statusReady, i.displayCount(displayCount), address].filter(Boolean).join(" · ")
        }
        const statusClass = { ready: "sl-status", off: "sl-status sl-status--off", unpaired: "sl-status sl-status--unpaired", starting: "sl-status sl-status--starting" }[state]
        this.indexStatus.className = statusClass
        this.indexStatus.textContent = short
        this.statusLine.className = statusClass
        this.statusLine.textContent = long
        this.detail.dataset.state = state
        this.indexRow.classList.toggle("is-starting", starting)

        // Not paired: pair first instead of the table
        const showUnpaired = !off && !paired && !starting
        this.table.hidden = showUnpaired
        this.unpaired.hidden = !showUnpaired

        // Last used display
        const preferred = getPreferredDisplay(this.hostId)
        for (const row of Array.from(this.rows.children) as Array<HTMLElement>) {
            row.classList.toggle("is-last", Number(row.dataset.display) == preferred)
        }

        // Starting progress: time, but never behind the steps that are done
        this.progress.hidden = !starting
        this.startSteps.hidden = !starting
        if (starting) {
            const byTime = this.startingSeconds! / TYPICAL_START_SECONDS * 100
            this.progressBar.style.width = `${Math.min(95, Math.max(byTime, this.startStage * 25 + 5))}%`
            const names = [i.stageWake, i.stagePcOn, i.stageLogin, i.stageReady]
            this.startSteps.replaceChildren(...names.map((name, index) =>
                el("span", index < this.startStage ? "is-done" : index == this.startStage ? "is-now" : undefined, `${index < this.startStage ? "✓ " : ""}${name}`)))
        }

        // Guests may not turn off the pc
        const guest = this.isGuest()
        this.sleepButton.hidden = guest || off
        this.powerOffButton.hidden = guest || off

        // Note on the right of the footer
        const last = getLastStream(this.hostId)
        if (starting) {
            this.note.textContent = i.startsByItself
        } else if (off) {
            this.note.textContent = i.offNote
        } else if (last) {
            this.note.textContent = i.lastStream(i.displayName(last.display), last.size, last.fps, timeAgo(last.at))
        } else {
            this.note.textContent = ""
        }
    }

    // -- selection (by the host list)

    setNumber(number: number) {
        this.indexNumber.textContent = twoDigits(number)
    }
    setSelected(selected: boolean) {
        this.indexRow.setAttribute("aria-current", selected ? "true" : "false")
    }

    // -- menu

    private onContextMenu(event: MouseEvent, anchor?: HTMLElement) {
        const i = getTranslations(getCurrentLanguage()).host
        const elements = []
        const online = this.cache?.server_state != null
        const paired = this.cache?.paired == "Paired"

        if (online) {
            elements.push({ name: i.showDetails, icon: "info" as const, callback: this.showDetails.bind(this) })
            if (paired) {
                elements.push({ name: i.showGames, icon: "play" as const, callback: () => this.open() })
            }
        } else if (paired) {
            elements.push({ name: i.sendWakeUpPacket, icon: "power" as const, callback: this.wakeUp.bind(this) })
        }
        if (online && !paired) {
            elements.push({ name: i.pair, icon: "key" as const, callback: this.pair.bind(this) })
        }
        elements.push({ name: i.reload, icon: "retry" as const, callback: async () => this.forceFetch() })

        // Make private / global
        if (this.userCache?.role == "Admin") {
            if (this.cache?.owner == "Global") {
                elements.push({ name: i.makePrivate, icon: "eyeOff" as const, callback: this.makePrivate.bind(this) })
            } else if (this.cache?.owner == "ThisUser") {
                elements.push({ name: i.makeGlobal, icon: "globe" as const, callback: this.makeGlobal.bind(this) })
            }
        }

        if (this.cache?.owner == "ThisUser" || this.userCache?.role == "Admin") {
            elements.push({ name: i.removeHost, icon: "trash" as const, separator: true, classes: ["context-menu-element-red"], callback: this.remove.bind(this) })
        }

        setContextMenu(event, { elements }, anchor)
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

    // -- events

    addHostRemoveListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.addEventListener("ml-hostremove", listener as any, options)
    }
    removeHostRemoveListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.removeEventListener("ml-hostremove", listener as any, options)
    }

    addHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.addEventListener("ml-hostopen", listener as any, options)
    }
    removeHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.removeEventListener("ml-hostopen", listener as any, options)
    }

    /// Opens the game list of this pc
    private open() {
        this.events.dispatchEvent(new ComponentEvent("ml-hostopen", this))
    }

    // -- actions

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
        const i = getTranslations(getCurrentLanguage()).host
        const confirmed = await confirmDialog({
            title: i.removeConfirm(this.cache?.name ?? ""),
            text: i.removeConfirmText,
            confirm: i.removeHost,
            danger: true,
            icon: "trash",
        })
        if (!confirmed) {
            return
        }

        await apiDeleteHost(this.api, {
            host_id: this.getHostId()
        })

        this.events.dispatchEvent(new ComponentEvent("ml-hostremove", this))
    }
    private async wakeUp() {
        const i = getTranslations(getCurrentLanguage()).host
        await apiWakeUp(this.api, {
            host_id: this.getHostId()
        })

        showNotification(i.wakeUpSent, "info")
    }

    /// Starlight Streams: wakes the pc, waits until it's online and then starts the last played game on the chosen display
    private async powerOnAndPlay(display: number) {
        const i = getTranslations(getCurrentLanguage()).host
        if (this.poweringOn) {
            return
        }
        this.poweringOn = true

        setPreferredDisplay(this.hostId, display)
        const button = this.streamButtons[display - 1]
        button.classList.add("is-loading")
        this.render()

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
                this.startStage = 1
                this.startingSeconds = 0
                this.render()
                // The seconds count every second, the pc is asked every 3
                const ticker = window.setInterval(() => {
                    this.startingSeconds = Math.round((Date.now() - start) / 1000)
                    this.render()
                }, 1000)
                try {
                    while (this.cache?.server_state == null) {
                        if ((Date.now() - start) / 1000 > 180) {
                            await showMessage(i.startTimeout)
                            return
                        }

                        await new Promise(resolve => setTimeout(resolve, 3000))
                        // The power agent answers once Windows runs, then says if somebody is logged in
                        const session = await Promise.race([
                            apiHostSession(this.api, { host_id: this.getHostId() }).catch(() => null),
                            new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
                        ])
                        if (session) {
                            this.startStage = Math.max(this.startStage, session.logged_in ? 3 : 2)
                        }
                        await this.forceFetch().catch(() => { })
                        this.render()
                    }
                    // Ready: all steps done for a moment, the display numbers come up
                    this.startStage = 4
                    this.render()
                    this.detail.classList.add("is-just-ready")
                    window.setTimeout(() => this.detail.classList.remove("is-just-ready"), 1200)
                    await new Promise(resolve => setTimeout(resolve, 600))
                } finally {
                    window.clearInterval(ticker)
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
                // The row glides away and a black box grows into the stream
                button.classList.remove("is-loading")
                const row = Array.from(this.rows.children).find(row => (row as HTMLElement).dataset.display == `${display}`) as HTMLElement | undefined
                await launchTransition(row ?? null, { api: this.api, hostId: this.getHostId(), display })
                // Same tab: opening a new tab after waiting would be blocked as a popup
                window.location.href = buildUrl(`/stream.html?${query}`)
            } else {
                this.open()
            }
        } finally {
            this.poweringOn = false
            this.startingSeconds = null
            this.startStage = 0
            button.classList.remove("is-loading")
            this.render()
        }
    }

    private async sleep() {
        const i = getTranslations(getCurrentLanguage()).host
        try {
            await apiSleep(this.api, {
                host_id: this.getHostId()
            })
        } catch (e) {
            showNotification(i.shutDownFailed, "error")
            return
        }

        showNotification(i.sleepSent, "info")
    }

    private async shutDown() {
        const i = getTranslations(getCurrentLanguage()).host
        const confirmed = await confirmDialog({
            label: i.powerLabel,
            title: i.shutDownConfirm(this.cache?.name ?? ""),
            text: i.shutDownConfirmText,
            confirm: i.powerOff,
            danger: true,
            icon: "power",
        })
        if (!confirmed) {
            return
        }

        try {
            await apiShutDown(this.api, {
                host_id: this.getHostId()
            })
        } catch (e) {
            showNotification(i.shutDownFailed, "error")
            return
        }

        showNotification(i.shutDownSent, "info")
    }

    private async pair() {
        const i = getTranslations(getCurrentLanguage()).host
        if (this.cache?.paired == "Paired") {
            await this.forceFetch()

            if (this.cache?.paired == "Paired") {
                showNotification(i.alreadyPaired, "info")
                return;
            }
        }

        const responseStream = await apiPostPair(this.api, {
            host_id: this.getHostId()
        })

        if (typeof responseStream.response == "string") {
            throw `failed to pair (stage 1): ${responseStream.response}`
        }

        // Pairing dialog with the PIN (design/screens/S-Home-Modals, 02)
        const modal = openSlModal({ title: i.pairTitle(this.cache?.name ?? ""), label: i.pairingLabel })
        const pin = el("div", "sl-pin")
        pin.setAttribute("role", "img")
        pin.setAttribute("aria-label", `PIN ${responseStream.response.Pin.split("").join(" ")}`)
        for (const digit of responseStream.response.Pin) {
            pin.appendChild(el("span", undefined, digit))
        }
        const waiting = el("div", "sl-pair-waiting")
        waiting.append(el("span", "sl-spinner"), el("span", "sl-ink2", i.waitingForPin))
        modal.body.append(el("p", "sl-ink2", i.typePin), pin, el("p", "sl-help", i.pinHint), waiting)
        const cancel = button("sl-btn sl-btn-quiet", getTranslations(getCurrentLanguage()).modal.cancel)
        cancel.addEventListener("click", () => modal.close())
        modal.foot.appendChild(cancel)

        const resultResponse = await Promise.race([responseStream.next(), modal.closed.then(() => "cancelled" as const)])
        modal.close()
        if (resultResponse == "cancelled") {
            return
        }

        if (!resultResponse) {
            throw "missing stage 2 of pairing"
        } else if (typeof resultResponse == "string") {
            throw `failed to pair (stage 2): ${resultResponse}`
        }

        this.updateCache(resultResponse.Paired, null)
    }

    // The host list places the index row and the detail itself
    mount(parent: HTMLElement): void {
        parent.appendChild(this.detail)
    }
    unmount(parent: HTMLElement): void {
        if (this.detail.parentElement == parent) {
            parent.removeChild(this.detail)
        }
    }
}
