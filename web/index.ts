import "./polyfill/index"
import { Api, getApi, apiPostHost, apiPostGuest, loginFromGuestLink, apiStarlightInfo, apiStarlightUpdate, FetchError, apiLogout, apiGetUser, tryLogin, apiGetHost, apiGetRole, apiPatchRole } from "./api"
import { AddHostModal } from "./component/host/add_modal"
import { HostList } from "./component/host/list"
import { Component, ComponentEvent } from "./component/index"
import { showNotification } from "./component/notification"
import { showMessage, showModal, showPrompt } from "./component/modal/index"
import { setContextMenu } from "./component/context_menu"
import { GameList } from "./component/game/list"
import { Host } from "./component/host/index"
import { App, DetailedRole, DetailedUser } from "./api_bindings"
import { getLocalStreamSettings, globalDefaultSettings, setLocalStreamSettings, StreamSettingsComponent } from "./component/settings_menu"
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations } from "./i18n"
import { setTouchContextMenuEnabled } from "./polyfill/ios_right_click"
import { buildUrl } from "./config_"
import { setStyle as setPageStyle } from "./styles/index"

// TODO: look at this? https://developer.mozilla.org/en-US/docs/Web/API/Web_components

let I = getTranslations(getCurrentLanguage())

// Starlight Streams: where updates come from (must match installer/laptop/update.ps1)
const STARLIGHT_REPOSITORY = "petrusbering3-ship-it/Starlight-streams"

async function startApp() {
    setTouchContextMenuEnabled(true)

    await loginFromGuestLink()

    const api = await getApi()

    const bootstrapRole = await apiGetRole(api, { id: null })
    adoptRoleDefaultLanguage(bootstrapRole.role.default_settings)
    I = getTranslations(getCurrentLanguage())

    const rootElement = document.getElementById("root");
    if (rootElement == null) {
        showNotification(I.index.rootNotFound, "error")
        return;
    }

    let lastAppState: AppState | null = null
    if (sessionStorage) {
        const lastStateText = sessionStorage.getItem("mlState")
        if (lastStateText) {
            lastAppState = JSON.parse(lastStateText)
        }
    }

    const app = new MainApp(api, bootstrapRole.role)
    app.mount(rootElement)

    window.addEventListener("popstate", event => {
        app.setAppState(event.state, false)
    })

    app.forceFetch()

    if (lastAppState) {
        app.setAppState(lastAppState)
    }
}

startApp()

type DisplayStates = "hosts" | "games" | "settings"

type AppState = { display: DisplayStates, hostId?: number }
function setAppState(state: AppState, pushHistory: boolean) {
    if (pushHistory) {
        history.pushState(state, "")
    }

    if (sessionStorage) {
        sessionStorage.setItem("mlState", JSON.stringify(state))
    }
}
function backAppState() {
    history.back()
}

class MainApp implements Component {
    private api: Api
    private user: DetailedUser | null = null
    private role: DetailedRole | null = null

    private divElement = document.createElement("div")

    // Top Line
    private topLine = document.createElement("div")

    private moonlightTextElement = document.createElement("h1")

    private topLineActions = document.createElement("div")
    private logoutButton = document.createElement("button")
    // This is for the default user
    private loginButton = document.createElement("button")
    private adminButton = document.createElement("button")

    // Actions
    private actionElement = document.createElement("div")

    private backButton: HTMLButtonElement = document.createElement("button")

    private hostAddButton: HTMLButtonElement = document.createElement("button")
    private guestLinkButton: HTMLButtonElement = document.createElement("button")
    private updateButton: HTMLButtonElement = document.createElement("button")
    private updateChecked = false
    private settingsButton: HTMLButtonElement = document.createElement("button")
    private saveRoleDefaultsButton: HTMLButtonElement = document.createElement("button")

    // Different submenus
    private currentDisplay: DisplayStates | null = null

    private hostList: HostList
    private gameList: GameList | null = null
    private settings: StreamSettingsComponent | null = null

    constructor(api: Api, bootstrapRole: DetailedRole) {
        this.api = api
        this.role = bootstrapRole

        // Top Line
        this.topLine.classList.add("top-line")

        this.moonlightTextElement.innerHTML = I.index.appTitle
        this.topLine.appendChild(this.moonlightTextElement)

        this.topLine.appendChild(this.topLineActions)
        this.topLineActions.classList.add("top-line-actions")

        this.logoutButton.addEventListener("click", async () => {
            await apiLogout(this.api)
            window.location.reload()
        })
        this.logoutButton.classList.add("logout-button")

        this.loginButton.addEventListener("click", async () => {
            const success = await tryLogin()
            if (success) {
                window.location.reload()
            }
        })
        this.loginButton.classList.add("login-button")

        this.adminButton.addEventListener("click", async () => {
            window.location.href = buildUrl("/admin.html")
        })
        this.adminButton.classList.add("admin-button")

        // Actions
        this.actionElement.classList.add("actions-list")

        // Back button
        this.backButton.innerText = I.index.back
        this.backButton.classList.add("button-fit-content")
        this.backButton.addEventListener("click", backAppState)
        this.backButton.dataset.variant = "back-button"

        // Host add button
        this.hostAddButton.classList.add("host-add")
        this.hostAddButton.addEventListener("click", this.addHost.bind(this))

        // Guest link button (admins only)
        this.guestLinkButton.innerText = `🔗 ${I.index.guestLink}`
        this.guestLinkButton.classList.add("button-fit-content", "guest-link-button")
        this.guestLinkButton.addEventListener("click", this.createGuestLink.bind(this))

        // Host list
        this.hostList = new HostList(api)
        this.hostList.addHostOpenListener(this.onHostOpen.bind(this))

        // Settings Button
        this.settingsButton.classList.add("open-settings")
        this.settingsButton.addEventListener("click", () => this.setCurrentDisplay("settings"))

        this.saveRoleDefaultsButton.innerText = I.settings.saveRoleDefaults
        this.saveRoleDefaultsButton.classList.add("button-fit-content")
        this.saveRoleDefaultsButton.addEventListener("click", this.onSaveRoleDefaults.bind(this))
        this.saveRoleDefaultsButton.dataset.variant = "save-button"

        // Settings
        this.settings = new StreamSettingsComponent(
            bootstrapRole.permissions,
            getLocalStreamSettings(bootstrapRole.default_settings)
        )
        this.settings.addChangeListener(this.onSettingsChange.bind(this))

        // Append default elements
        this.divElement.appendChild(this.topLine)
        this.divElement.appendChild(this.actionElement)

        this.setCurrentDisplay("hosts")

        // Context Menu
        document.body.addEventListener("contextmenu", this.onContextMenu.bind(this), { passive: false })
    }

    setAppState(state: AppState, pushIntoHistory?: boolean) {
        if (state.display == "hosts") {
            this.setCurrentDisplay("hosts", null, pushIntoHistory)
        } else if (state.display == "games" && state.hostId != null) {
            this.setCurrentDisplay("games", { hostId: state.hostId }, pushIntoHistory)
        } else if (state.display == "settings") {
            this.setCurrentDisplay("settings", null, pushIntoHistory)
        }
    }

    private async addHost() {
        const modal = new AddHostModal(this.api)

        let host = await showModal(modal);

        if (host) {
            let newHost
            try {
                newHost = await apiPostHost(this.api, host)
            } catch (e) {
                if (e instanceof FetchError) {
                    const response = e.getResponse()
                    if (response && response.status == 404) {
                        showNotification(I.index.addHostUnreachable(host.address))
                        return
                    }
                }
                throw e
            }

            this.hostList.insertList(newHost.host_id, newHost)
        }
    }

    private onContextMenu(event: MouseEvent) {
        if (this.currentDisplay == "hosts" || this.currentDisplay == "games") {
            const elements = [
                {
                    name: I.index.reload,
                    callback: this.forceFetch.bind(this)
                }
            ]

            setContextMenu(event, {
                elements
            })
        }
    }

    /// Starlight Streams: shows an update button when GitHub has a newer release
    private async checkForUpdate() {
        if (this.updateChecked) {
            return
        }
        this.updateChecked = true

        try {
            const info = await apiStarlightInfo(this.api)
            if (!info.can_update || info.version == "dev") {
                return
            }

            const response = await fetch(`https://api.github.com/repos/${STARLIGHT_REPOSITORY}/releases/latest`, { cache: "no-store" })
            if (!response.ok) {
                return
            }
            const latest = (await response.json()).tag_name
            if (typeof latest != "string" || latest == info.version) {
                return
            }

            this.updateButton.innerText = `⬆ ${I.index.updateAvailable(latest)}`
            this.updateButton.classList.add("button-fit-content", "update-button")
            this.updateButton.onclick = () => this.runUpdate(info.version, latest)
            this.topLineActions.appendChild(this.updateButton)
        } catch (e) {
            console.warn("failed to check for updates", e)
        }
    }

    private async runUpdate(currentVersion: string, latest: string) {
        if (!confirm(I.index.updateConfirm(latest))) {
            return
        }

        const result = await apiStarlightUpdate(this.api).catch(() => null)
        if (!result?.started) {
            await showMessage(I.index.updateFailed)
            return
        }

        this.updateButton.disabled = true
        this.updateButton.innerText = I.index.updating
        showNotification(I.index.updating, "info")

        // The server restarts with the new version, then the page is reloaded
        const start = Date.now()
        while (Date.now() - start < 5 * 60 * 1000) {
            await new Promise(resolve => setTimeout(resolve, 5000))
            try {
                const info = await apiStarlightInfo(this.api)
                if (info.version != currentVersion) {
                    window.location.reload()
                    return
                }
            } catch (e) {
                // the server is restarting
            }
        }

        await showMessage(I.index.updateTimeout)
        this.updateButton.disabled = false
    }

    private async createGuestLink() {
        const hoursText = await showPrompt(I.index.guestLinkHours, { defaultValue: "3" })
        if (hoursText == null) {
            return
        }
        const hours = parseInt(hoursText)
        if (!(hours > 0 && hours <= 168)) {
            await showMessage(I.index.guestLinkFailed)
            return
        }

        let guest
        try {
            guest = await apiPostGuest(this.api, { hours })
        } catch (e) {
            await showMessage(I.index.guestLinkFailed)
            return
        }

        const link = `${window.location.origin}${window.location.pathname}#guest=${encodeURIComponent(`${guest.name}:${guest.password}`)}`

        let copied = false
        try {
            await navigator.clipboard.writeText(link)
            copied = true
        } catch (e) {
            // clipboard is only available in secure contexts
        }

        await showMessage(I.index.guestLinkCreated(link, hours, copied))

        // Hosts may have been shared with guests
        await this.hostList.forceFetch()
    }

    private async onHostOpen(event: ComponentEvent<Host>) {
        const hostId = event.component.getHostId()

        this.setCurrentDisplay("games", { hostId })
    }

    private onSettingsChange() {
        if (!this.settings) {
            showNotification(I.index.saveSettingsFailed)
            return
        }

        const previousLanguage = getLocalStreamSettings(globalDefaultSettings()).language
        const newSettings = this.settings.getStreamSettings()

        // store settings in localStorage
        setLocalStreamSettings(newSettings)
        // apply style
        setPageStyle(newSettings.pageStyle)

        if (previousLanguage !== newSettings.language) {
            window.location.reload()
        }
    }

    private async onSaveRoleDefaults() {
        if (!this.settings || !this.role || this.user?.role !== "Admin") {
            showNotification(I.settings.saveRoleDefaultsFailed)
            return
        }

        this.saveRoleDefaultsButton.disabled = true

        try {
            const newSettings = this.settings.getStreamSettings()
            await apiPatchRole(this.api, {
                id: this.role.id,
                name: null,
                ty: this.role.ty,
                default_settings: newSettings,
                permissions: null,
            })

            this.role = {
                ...this.role,
                default_settings: newSettings,
            }

            await showMessage(I.settings.saveRoleDefaultsSuccess)
        } catch {
            showNotification(I.settings.saveRoleDefaultsFailed)
        } finally {
            this.saveRoleDefaultsButton.disabled = false
        }
    }

    private setCurrentDisplay(display: "hosts",
        extraInfo?: null,
        pushIntoHistory?: boolean
    ): void
    private setCurrentDisplay(
        display: "games",
        extraInfo?: {
            hostId?: number | null,
            hostCache?: Array<App>
        },
        pushIntoHistory?: boolean
    ): void
    private setCurrentDisplay(display: "settings", extraInfo?: null, pushIntoHistory?: boolean): void

    private setCurrentDisplay(
        display: "hosts" | "games" | "settings",
        extraInfo?: {
            hostId?: number | null,
            hostCache?: Array<App>
        } | null,
        pushIntoHistory_?: boolean
    ) {
        const pushIntoHistory = pushIntoHistory_ === undefined ? true : pushIntoHistory_

        if (display == "games" && extraInfo?.hostId == null) {
            // invalid input state
            throw "invalid display state was requested"
        }

        // Check if we need to change
        if (this.currentDisplay == display) {
            if (this.currentDisplay == "games" && this.gameList?.getHostId() != extraInfo?.hostId) {
                // fall through
            } else {
                return
            }
        }

        // Unmount the current display
        if (this.currentDisplay == "hosts") {
            this.actionElement.removeChild(this.hostAddButton)
            this.actionElement.removeChild(this.settingsButton)

            this.hostList.unmount(this.divElement)
        } else if (this.currentDisplay == "games") {
            this.actionElement.removeChild(this.backButton)
            this.actionElement.removeChild(this.settingsButton)

            this.gameList?.unmount(this.divElement)
        } else if (this.currentDisplay == "settings") {
            this.actionElement.removeChild(this.backButton)
            if (this.actionElement.contains(this.saveRoleDefaultsButton)) {
                this.actionElement.removeChild(this.saveRoleDefaultsButton)
            }

            this.settings?.unmount(this.divElement)
        }

        // Mount the new display
        if (display == "hosts") {
            this.actionElement.appendChild(this.hostAddButton)
            this.actionElement.appendChild(this.settingsButton)

            this.hostList.mount(this.divElement)

            setAppState({ display: "hosts" }, pushIntoHistory)
        } else if (display == "games" && extraInfo?.hostId != null) {
            this.actionElement.appendChild(this.backButton)
            this.actionElement.appendChild(this.settingsButton)

            if (this.gameList?.getHostId() != extraInfo?.hostId) {
                this.gameList = new GameList(this.api, extraInfo?.hostId, extraInfo?.hostCache ?? null)
                this.gameList.addForceReloadListener(this.forceFetch.bind(this))
            }

            this.gameList.mount(this.divElement)

            this.refreshGameListActiveGame()

            setAppState({ display: "games", hostId: this.gameList?.getHostId() }, pushIntoHistory)
        } else if (display == "settings") {
            this.actionElement.appendChild(this.backButton)
            if (this.user?.role == "Admin") {
                this.actionElement.appendChild(this.saveRoleDefaultsButton)
            }

            this.settings?.mount(this.divElement)

            setAppState({ display: "settings" }, pushIntoHistory)
        }

        this.currentDisplay = display
    }

    async forceFetch() {
        const promiseUser = this.refreshUserRole()
        const promiseRoles = this.refreshUserPermissions()

        await Promise.all([
            this.hostList.forceFetch(),
            this.gameList?.forceFetch()
        ])

        if (this.currentDisplay == "games"
            && this.gameList
            && !this.hostList.getHost(this.gameList.getHostId())) {
            // The newly fetched list doesn't contain the hosts game view we're in -> go to hosts
            this.setCurrentDisplay("hosts")
        }

        await Promise.all([
            promiseUser,
            promiseRoles,
            this.refreshGameListActiveGame()
        ])
    }
    private async refreshUserRole() {
        this.user = await apiGetUser(this.api)

        if (this.topLineActions.contains(this.logoutButton)) {
            this.topLineActions.removeChild(this.logoutButton)
        }
        if (this.topLineActions.contains(this.loginButton)) {
            this.topLineActions.removeChild(this.loginButton)
        }
        if (this.topLineActions.contains(this.adminButton)) {
            this.topLineActions.removeChild(this.adminButton)
        }
        if (this.topLineActions.contains(this.guestLinkButton)) {
            this.topLineActions.removeChild(this.guestLinkButton)
        }

        if (this.user.is_default_user) {
            this.topLineActions.appendChild(this.loginButton)
        } else {
            this.topLineActions.appendChild(this.logoutButton)
        }

        if (this.user.role == "Admin") {
            this.checkForUpdate()
            this.topLineActions.insertBefore(this.guestLinkButton, this.topLineActions.firstChild)
            this.topLineActions.appendChild(this.adminButton)
            if (this.currentDisplay == "settings" && !this.actionElement.contains(this.saveRoleDefaultsButton)) {
                this.actionElement.appendChild(this.saveRoleDefaultsButton)
            }
        } else if (this.actionElement.contains(this.saveRoleDefaultsButton)) {
            this.actionElement.removeChild(this.saveRoleDefaultsButton)
        }
    }
    private async refreshUserPermissions() {
        const response = await apiGetRole(this.api, { id: null })
        this.role = response.role

        if (this.role.permissions.allow_add_hosts) {
            this.hostAddButton.disabled = false
        } else {
            this.hostAddButton.disabled = true
        }
    }
    private async refreshGameListActiveGame() {
        const gameList = this.gameList
        const hostId = gameList?.getHostId()
        if (hostId == null) {
            return
        }

        const host = this.hostList.getHost(hostId)

        let currentGame = null
        if (host != null) {
            currentGame = await host.getCurrentGame()
        } else {
            const host = await apiGetHost(this.api, { host_id: hostId })
            if (host.current_game != 0) {
                currentGame = host.current_game
            }
        }

        if (currentGame != null) {
            gameList?.setActiveGame(currentGame)
        } else {
            gameList?.setActiveGame(null)
        }
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.divElement)
    }
}
