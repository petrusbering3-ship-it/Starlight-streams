import { DetailedHost, UndetailedHost } from "../../api_bindings"
import { Api, apiGetHosts } from "../../api"
import { ComponentEvent } from "../index"
import { Host, HostEventListener } from "./index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { el } from "../../icons"

// Starlight Streams: the home page (design/screens/S-Home): the PC index on the left and the
// selected PC on the right.

const SELECTED_KEY = "starlight-selected-host"

export class HostList {
    private api: Api
    private hosts: Array<Host> = []
    private selectedId: number | null = null
    private canAddHosts = true

    private events = new EventTarget()

    private root = el("div", "sl-main")
    private nav = el("nav", "sl-index")
    private count = el("div", "sl-label sl-index-label")
    private rows = el("div", "sl-index-rows")
    private addRow = el("button", "sl-index-row sl-index-add")
    private detailSlot = el("div", "sl-pc-slot")
    private empty = el("div", "sl-state")
    private error = el("div", "sl-state sl-state--error")
    private hasError = false

    constructor(api: Api) {
        const i = getTranslations(getCurrentLanguage()).home
        this.api = api

        try {
            this.selectedId = Number(localStorage.getItem(SELECTED_KEY)) || null
        } catch (e) {
            // storage might be unavailable
        }

        this.nav.setAttribute("aria-label", i.pcs)
        this.addRow.type = "button"
        this.addRow.append(el("span", "sl-mono sl-muted", "+"), el("span", "sl-index-add-text", i.addPc), el("span"))
        this.addRow.addEventListener("click", () => this.events.dispatchEvent(new Event("ml-hostadd")))
        this.nav.append(this.count, this.rows, this.addRow, el("p", "sl-muted sl-index-hint", i.offHint))

        // Empty: no PCs yet
        const emptyAdd = el("button", "sl-btn sl-btn-ink")
        emptyAdd.type = "button"
        emptyAdd.append(i.addPc, el("span", undefined, "→"))
        emptyAdd.addEventListener("click", () => this.events.dispatchEvent(new Event("ml-hostadd")))
        this.empty.append(el("span", "sl-num sl-state-num", "0"), el("h2", "sl-h3", i.noPcs), el("p", "sl-ink2", i.noPcsText), emptyAdd)

        this.root.append(this.nav, this.detailSlot)
        this.render()
    }

    async forceFetch() {
        let hosts
        try {
            hosts = await apiGetHosts(this.api)
        } catch (e) {
            this.setError(true)
            throw e
        }
        this.setError(false)

        this.updateCache(hosts.response.hosts)

        let update
        while (update = await hosts.next()) {
            this.getHost(update.host_id)?.updateCache(update, null)
        }
    }

    private updateCache(cache: Array<DetailedHost | UndetailedHost>) {
        // Removed PCs
        for (const host of [...this.hosts]) {
            if (!cache.some(data => data.host_id == host.getHostId())) {
                this.removeHost(host)
            }
        }
        // New and changed PCs
        for (const data of cache) {
            const host = this.getHost(data.host_id)
            if (host) {
                host.updateCache(data, null)
            } else {
                this.insertList(data.host_id, data)
            }
        }
    }

    public insertList(dataId: number, data: DetailedHost | UndetailedHost | null): void {
        const host = new Host(this.api, dataId, data)
        host.addHostRemoveListener(event => this.removeHost(event.component))
        host.addHostOpenListener(event => this.events.dispatchEvent(new ComponentEvent("ml-hostopen", event.component)))
        host.indexRow.addEventListener("click", () => this.select(host.getHostId()))
        this.hosts.push(host)

        // A newly added PC is shown right away
        if (data && this.hosts.length > 1 && this.selectedId != null && this.getHost(this.selectedId)) {
            // keep the current selection
        }
        this.render()
    }

    private removeHost(host: Host) {
        this.hosts = this.hosts.filter(other => other != host)
        host.indexRow.remove()
        host.detail.remove()
        this.render()
    }

    getHost(hostId: number): Host | undefined {
        return this.hosts.find(host => host.getHostId() == hostId)
    }

    select(hostId: number) {
        this.selectedId = hostId
        try {
            localStorage.setItem(SELECTED_KEY, `${hostId}`)
        } catch (e) {
            // storage might be unavailable
        }
        this.render()
    }

    setCanAddHosts(canAdd: boolean) {
        this.canAddHosts = canAdd
        this.render()
    }

    /// The server can't be reached: the error state instead of the selected PC
    setError(error: boolean) {
        this.hasError = error
        this.render()
    }
    setErrorContent(...content: Array<Node>) {
        this.error.replaceChildren(...content)
    }

    private render() {
        const i = getTranslations(getCurrentLanguage()).home
        this.count.textContent = `${i.pcs} · ${this.hosts.length}`
        this.addRow.hidden = !this.canAddHosts

        this.rows.replaceChildren(...this.hosts.map((host, index) => {
            host.setNumber(index + 1)
            return host.indexRow
        }))

        let selected = this.selectedId != null ? this.getHost(this.selectedId) : undefined
        if (!selected) {
            selected = this.hosts[0]
        }
        for (const host of this.hosts) {
            host.setSelected(host == selected)
        }

        if (this.hasError) {
            this.detailSlot.replaceChildren(this.error)
        } else if (selected) {
            if (this.detailSlot.firstChild != selected.detail) {
                this.detailSlot.replaceChildren(selected.detail)
            }
        } else {
            this.detailSlot.replaceChildren(this.empty)
            this.empty.querySelector("button")!.hidden = !this.canAddHosts
        }
    }

    addHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.addEventListener("ml-hostopen", listener as EventListenerOrEventListenerObject, options)
    }
    removeHostOpenListener(listener: HostEventListener, options?: EventListenerOptions) {
        this.events.removeEventListener("ml-hostopen", listener as EventListenerOrEventListenerObject, options)
    }
    addHostAddListener(listener: () => void) {
        this.events.addEventListener("ml-hostadd", listener)
    }

    mount(parent: Element): void {
        parent.appendChild(this.root)
    }
    unmount(parent: Element): void {
        if (this.root.parentElement == parent) {
            parent.removeChild(this.root)
        }
    }
}
