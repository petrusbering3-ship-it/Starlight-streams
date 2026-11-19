import { Api, apiGetApps } from "../../api"
import { App } from "../../api_bindings"
import { FetchListComponent } from "../fetch_list"
import { ComponentEvent } from "../index"
import { Game, GameCache, GameEventListener } from "./index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { el, icon } from "../../icons"
import { getCachedDisplays, getPreferredDisplay } from "../../stream/display"

export class GameList extends FetchListComponent<App, Game> {
    private api: Api

    private eventTarget = new EventTarget()

    private hostId: number
    private activeApp: number | null = null

    // Swiss Console (design/screens/S-Games)
    private root = el("main", "sl-games")
    private displayLabel = el("span", "sl-label")
    private search = el("input", "sl-input sl-input-sm")

    constructor(api: Api, hostId: number, cache: App[] | null) {
        super({
            listClasses: ["sl-games-grid"],
            elementLiClasses: ["sl-games-item"]
        })

        this.api = api

        this.hostId = hostId

        const i = getTranslations(getCurrentLanguage()).game
        const head = el("div", "sl-games-head")
        const titles = el("div", "sl-games-titles")
        titles.append(this.displayLabel, el("h1", "sl-h2", i.pickGame))
        const tools = el("div", "sl-games-tools")
        const searchWrap = el("div", "sl-games-search")
        this.search.type = "search"
        this.search.placeholder = i.search
        this.search.setAttribute("aria-label", i.search)
        this.search.addEventListener("input", () => {
            const text = this.search.value.trim().toLowerCase()
            this.list.setFilter(game => game.getTitle().toLowerCase().includes(text))
        })
        searchWrap.append(icon("search"), this.search)
        tools.append(el("span", "sl-muted sl-games-remember", i.remember), searchWrap)
        head.append(titles, tools)
        this.root.appendChild(head)
        this.list.mount(this.root)
        this.updateDisplayLabel()

        // Update cache
        if (cache != null) {
            this.updateCache(cache)
        } else {
            this.forceFetch()
        }
    }

    setActiveGame(appId: number | null) {
        this.activeApp = appId

        this.forceFetch()
    }

    async forceFetch() {
        const apps = await apiGetApps(this.api, {
            host_id: this.hostId,
        })

        this.updateCache(apps)
    }
    private createCache(data: App): GameCache {
        const cache = data as GameCache
        cache.activeApp = this.activeApp
        return cache
    }

    protected updateComponentData(component: Game, data: App): void {
        const cache = this.createCache(data)

        component.updateCache(cache)
    }
    protected getComponentDataId(component: Game): number {
        return component.getAppId()
    }
    protected getDataId(data: App): number {
        return data.app_id
    }
    protected insertList(dataId: number, data: App): void {
        const cache = this.createCache(data)

        const game = new Game(this.api, this.hostId, dataId, cache)
        game.addForceReloadListener(this.onForceReload.bind(this))

        this.list.append(game)
    }

    private onForceReload(event: ComponentEvent<Game>) {
        this.eventTarget.dispatchEvent(new ComponentEvent("ml-gamereload", event.component))
    }

    addForceReloadListener(listener: GameEventListener) {
        this.eventTarget.addEventListener("ml-gamereload", listener as any)
    }
    removeForceReloadListener(listener: GameEventListener) {
        this.eventTarget.removeEventListener("ml-gamereload", listener as any)
    }

    getHostId(): number {
        return this.hostId
    }

    /// "Display 1 · 2560×1440 · 144 Hz": the display the game will be streamed on
    private updateDisplayLabel() {
        const i = getTranslations(getCurrentLanguage()).host
        const display = getPreferredDisplay(this.hostId)
        const info = getCachedDisplays(this.hostId)?.[display - 1]
        this.displayLabel.textContent = [i.displayName(display), info ? `${info.width}×${info.height}` : null, info ? `${info.refresh_rate} Hz` : null].filter(Boolean).join(" · ")
    }

    mount(parent: HTMLElement): void {
        this.updateDisplayLabel()
        parent.appendChild(this.root)
    }
    unmount(parent: HTMLElement): void {
        if (this.root.parentElement == parent) {
            parent.removeChild(this.root)
        }
    }
}
