import "./polyfill/index"
import { Api, getApi, apiPostHost, apiPostGuest, loginFromGuestLink, apiStarlightInfo, apiStarlightUpdate, FetchError, apiLogout, apiGetUser, tryLogin, apiGetHost, apiGetRole, apiPatchRole } from "./api"
import { showAddPcDialog } from "./component/host/add_modal"
import { HostList } from "./component/host/list"
import { Component, ComponentEvent } from "./component/index"
import { showNotification } from "./component/notification"
import { showMessage } from "./component/modal/index"
import { confirmDialog, openSlModal } from "./component/sl_modal"
import { button, el, icon } from "./icons"
import { setContextMenu } from "./component/context_menu"
import { GameList } from "./component/game/list"
import { Host } from "./component/host/index"
import { App, DetailedRole, DetailedUser } from "./api_bindings"
import { getLocalStreamSettings, globalDefaultSettings, setLocalStreamSettings, StreamSettingsComponent } from "./component/settings_menu"
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations } from "./i18n"
import { setTouchContextMenuEnabled } from "./polyfill/ios_right_click"
import { buildUrl } from "./config_"
import "./styles/index"

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

    private divElement = el("div", "sl-app")

    // Status bar: server ping and version
    private statusBar = el("div", "sl-statusbar")
    private statusText = el("span", "sl-label")
    private versionText = el("span", "sl-label")
    private reachable = true

    // Header
    private header = el("header", "sl-header")
    private backButton = button("sl-link sl-back", "", "chevronLeft")
    private pageTitle = el("span", "sl-h3 sl-page-title")
    private updateButton = el("button", "sl-pill")
    private updateChecked = false
    private settingsButton = button("sl-link", "", "sliders")
    private guestLinkButton = button("sl-link", "", "shield")
    private adminButton = button("sl-link", "", "key")
    private loginButton = button("sl-link", "", "arrowUp")
    private logoutButton = button("sl-link", "", "exit")

    // Different submenus
    private currentDisplay: DisplayStates | null = null
    private content = el("div", "sl-content")

    private hostList: HostList
    private gameList: GameList | null = null
    private settings: StreamSettingsComponent | null = null
    private settingsView = el("div", "sl sl-panel-scrim")
    private settingsBody = el("div", "sl-panel-body")
    private adminBlock = el("div", "sl-panel-admin")
    private saveRoleDefaultsButton = button("sl-btn sl-btn-ink", "", "save")

    constructor(api: Api, bootstrapRole: DetailedRole) {
        this.api = api
        this.role = bootstrapRole

        // Status bar
        this.statusText.textContent = I.home.serverOnline
        this.statusBar.append(this.statusText, this.versionText)

        // Header: wordmark, update, links
        const wordmark = el("a", "sl-wordmark")
        wordmark.href = buildUrl("/")
        wordmark.append(el("span", "sl-mark"), I.index.appTitle)
        wordmark.addEventListener("click", event => {
            if (this.currentDisplay != "hosts") {
                event.preventDefault()
                this.setCurrentDisplay("hosts")
            }
        })

        this.backButton.appendChild(el("span", "txt", I.index.back))
        this.backButton.addEventListener("click", backAppState)
        this.backButton.hidden = true

        this.updateButton.type = "button"
        this.updateButton.hidden = true

        const link = (button: HTMLButtonElement, text: string) => {
            button.appendChild(el("span", "txt", text))
            button.setAttribute("aria-label", text)
        }
        link(this.settingsButton, I.home.settings)
        this.settingsButton.addEventListener("click", () => this.setCurrentDisplay("settings"))
        link(this.guestLinkButton, I.index.guestLink)
        this.guestLinkButton.addEventListener("click", this.createGuestLink.bind(this))
        this.guestLinkButton.hidden = true
        link(this.adminButton, I.home.admin)
        this.adminButton.addEventListener("click", () => window.location.href = buildUrl("/admin.html"))
        this.adminButton.hidden = true
        link(this.loginButton, I.home.login)
        this.loginButton.addEventListener("click", async () => {
            if (await tryLogin(true)) {
                window.location.reload()
            }
        })
        this.loginButton.hidden = true
        link(this.logoutButton, I.home.logout)
        this.logoutButton.addEventListener("click", async () => {
            await apiLogout(this.api)
            window.location.reload()
        })
        this.logoutButton.hidden = true

        this.pageTitle.hidden = true
        this.header.append(this.backButton, this.pageTitle, wordmark, this.updateButton, this.settingsButton, this.guestLinkButton, this.adminButton, this.loginButton, this.logoutButton)

        // PCs
        this.hostList = new HostList(api)
        this.hostList.addHostOpenListener(this.onHostOpen.bind(this))
        this.hostList.addHostAddListener(() => this.addHost())
        const retry = button("sl-btn", I.home.tryAgain, "retry")
        retry.addEventListener("click", () => this.forceFetch().catch(() => { }))
        const bang = el("span", "sl-num sl-red sl-state-num", "!")
        bang.setAttribute("aria-hidden", "true")
        this.hostList.setErrorContent(bang, el("h2", "sl-h3", I.home.unreachable), el("p", "sl-ink2", I.home.unreachableText), retry)

        // Settings (moves into the side panel with the settings restyle)
        this.saveRoleDefaultsButton.appendChild(document.createTextNode(I.settings.saveRoleDefaults))
        this.saveRoleDefaultsButton.addEventListener("click", this.onSaveRoleDefaults.bind(this))
        this.settings = new StreamSettingsComponent(
            bootstrapRole.permissions,
            getLocalStreamSettings(bootstrapRole.default_settings)
        )
        this.settings.addChangeListener(this.onSettingsChange.bind(this))

        // Settings side panel (design/screens/S-Settings)
        const panel = el("aside", "sl-panel")
        panel.setAttribute("role", "dialog")
        panel.setAttribute("aria-label", I.settings.settingsTitle)
        const panelHead = el("div", "sl-panel-head")
        const closePanel = el("button", "sl-btn sl-btn-quiet sl-btn-icon sl-btn-sm")
        closePanel.type = "button"
        closePanel.setAttribute("aria-label", I.modal.close)
        closePanel.appendChild(icon("close"))
        closePanel.addEventListener("click", () => this.closeSettings())
        panelHead.append(el("h2", "sl-h3", I.settings.settingsTitle), closePanel)
        const adminTitle = el("div", "sl-panel-admin-title")
        adminTitle.append(el("h3", "sl-h3", I.settings.adminOnly), el("span", "sl-tag sl-tag--role", "Admin"))
        this.adminBlock.append(adminTitle, el("p", "sl-help", I.settings.adminHelp), this.saveRoleDefaultsButton)
        const panelFoot = el("div", "sl-panel-foot")
        const done = el("button", "sl-btn sl-btn-ink")
        done.type = "button"
        done.append(I.settings.done, el("span", undefined, "→"))
        done.addEventListener("click", () => this.closeSettings())
        panelFoot.appendChild(done)
        panel.append(panelHead, this.settingsBody, panelFoot)
        this.settingsView.appendChild(panel)
        this.settingsView.addEventListener("mousedown", event => {
            if (event.target == this.settingsView) {
                this.closeSettings()
            }
        })
        document.addEventListener("keydown", event => {
            if (event.key == "Escape" && this.currentDisplay == "settings") {
                this.closeSettings()
            }
        })

        this.divElement.append(this.statusBar, this.header, this.content)

        this.setCurrentDisplay("hosts")
        this.watchServer()

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

    /// Starlight Streams: the ping in the status bar, and the error state when the server can't be reached
    private async watchServer() {
        while (true) {
            const start = performance.now()
            let ok = false
            try {
                const info = await apiStarlightInfo(this.api)
                ok = true
                this.versionText.textContent = info.version == "dev" ? "dev" : info.version
            } catch (e) {
                ok = !(e instanceof FetchError) || e.getResponse() != null
            }
            const ms = Math.round(performance.now() - start)

            if (ok) {
                this.statusText.textContent = `${I.home.serverOnline} · ${ms} ms`
                this.statusBar.classList.remove("sl-statusbar--error")
                if (!this.reachable) {
                    this.reachable = true
                    this.hostList.setError(false)
                    this.forceFetch().catch(() => { })
                }
            } else {
                this.statusText.textContent = I.home.unreachableBar
                this.statusBar.classList.add("sl-statusbar--error")
                this.reachable = false
                this.hostList.setError(true)
            }

            await new Promise(resolve => setTimeout(resolve, ok ? 10_000 : 5_000))
        }
    }

    private async addHost() {
        const host = await showAddPcDialog(this.api)

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
            this.hostList.select(newHost.host_id)
        }
    }

    private onContextMenu(event: MouseEvent) {
        if (this.currentDisplay == "hosts" || this.currentDisplay == "games") {
            const elements = [
                {
                    name: I.index.reload,
                    icon: "retry" as const,
                    callback: this.forceFetch.bind(this)
                }
            ]

            setContextMenu(event, {
                elements
            })
        }
    }

    /// Starlight Streams: shows the update pill when GitHub has a newer release
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

            this.updateButton.replaceChildren(icon("arrowUp"), I.index.updateAvailable(latest))
            this.updateButton.onclick = () => this.runUpdate(info.version, latest)
            this.updateButton.hidden = false
        } catch (e) {
            console.warn("failed to check for updates", e)
        }
    }

    private async runUpdate(currentVersion: string, latest: string) {
        const confirmed = await confirmDialog({
            title: I.index.updateAvailable(latest),
            text: I.index.updateConfirm(latest),
            confirm: I.home.update,
            icon: "arrowUp",
        })
        if (!confirmed) {
            return
        }

        const result = await apiStarlightUpdate(this.api).catch(() => null)
        if (!result?.started) {
            showNotification(I.index.updateFailed, "error")
            return
        }

        this.updateButton.classList.add("is-loading")
        this.updateButton.replaceChildren(el("span", "sl-spinner"), I.index.updating)
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

        showNotification(I.index.updateTimeout, "error")
        this.updateButton.classList.remove("is-loading")
        this.updateButton.replaceChildren(icon("arrowUp"), I.index.updateAvailable(latest))
    }

    /// Guest link (design/screens/S-Home-Modals, 03 + 04)
    private async createGuestLink() {
        const modal = openSlModal({ title: I.index.guestLink })
        const field = el("div", "sl-field")
        const label = el("label", "sl-label", I.home.validFor)
        label.htmlFor = "sl-guest-hours"
        const wrap = el("div", "sl-input-suffix")
        const hoursInput = el("input", "sl-input")
        hoursInput.id = "sl-guest-hours"
        hoursInput.inputMode = "numeric"
        hoursInput.value = "3"
        wrap.append(hoursInput, el("span", "sl-mono sl-muted suffix", I.home.hours))
        const error = el("span", "sl-error")
        error.hidden = true
        field.append(label, wrap, el("span", "sl-help", I.home.validForHelp), error)
        modal.body.appendChild(field)

        const cancel = button("sl-btn sl-btn-quiet", I.modal.cancel)
        cancel.addEventListener("click", () => modal.close())
        const create = el("button", "sl-btn sl-btn-ink")
        create.type = "button"
        create.append(I.home.createLink, el("span", undefined, "→"))
        modal.foot.append(cancel, create)

        const submit = async () => {
            const hours = parseInt(hoursInput.value)
            if (!(hours > 0 && hours <= 168)) {
                error.textContent = I.home.hoursInvalid
                error.hidden = false
                hoursInput.setAttribute("aria-invalid", "true")
                return
            }
            create.classList.add("is-loading")

            let guest
            try {
                guest = await apiPostGuest(this.api, { hours })
            } catch (e) {
                create.classList.remove("is-loading")
                error.textContent = I.index.guestLinkFailed
                error.hidden = false
                return
            }

            const link = `${window.location.origin}${window.location.pathname}#guest=${encodeURIComponent(`${guest.name}:${guest.password}`)}`

            // Step 2: the link
            modal.title.textContent = I.home.guestLinkReady
            const linkRow = el("div", "sl-copy-row")
            const linkInput = el("input", "sl-input sl-mono")
            linkInput.readOnly = true
            linkInput.value = link
            const copy = button("sl-btn sl-btn-ink", I.home.copy, "copy")
            copy.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(link)
                    showNotification(I.home.linkCopied, "ok")
                } catch (e) {
                    // clipboard is only available in secure contexts
                    linkInput.select()
                }
            })
            linkRow.append(linkInput, copy)
            const note = el("p", "sl-guest-note")
            note.append(icon("shield"), el("span", undefined, I.home.guestNote), el("span", "sl-muted", ` ${I.home.expiresIn(hours)}`))
            modal.body.replaceChildren(linkRow, note)

            const done = button("sl-btn", I.home.done)
            done.addEventListener("click", () => modal.close())
            modal.foot.replaceChildren(done)
            linkInput.select()

            // Hosts may have been shared with guests
            await this.hostList.forceFetch()
        }
        create.addEventListener("click", submit)
        hoursInput.addEventListener("keydown", event => {
            if (event.key == "Enter") {
                submit()
            }
        })
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

        if (previousLanguage !== newSettings.language) {
            window.location.reload()
        }
    }

    private async onSaveRoleDefaults() {
        if (!this.settings || !this.role || this.user?.role !== "Admin") {
            showNotification(I.settings.saveRoleDefaultsFailed)
            return
        }

        this.saveRoleDefaultsButton.classList.add("is-loading")

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

            showNotification(I.settings.saveRoleDefaultsSuccess, "ok")
        } catch {
            showNotification(I.settings.saveRoleDefaultsFailed)
        } finally {
            this.saveRoleDefaultsButton.classList.remove("is-loading")
        }
    }

    private closeSettings() {
        this.setCurrentDisplay("hosts")
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
            // Settings opens over the home page
            if (display != "settings") {
                this.hostList.unmount(this.content)
            }
        } else if (this.currentDisplay == "games") {
            this.gameList?.unmount(this.content)
        } else if (this.currentDisplay == "settings") {
            this.settings?.unmount(this.settingsBody)
            this.settingsView.remove()
            if (display != "hosts") {
                this.hostList.unmount(this.content)
            }
        }


        // Sub pages: "← Back" and a title instead of the wordmark and links (settings opens over the home page)
        const sub = display == "games"
        this.backButton.hidden = !sub
        this.settingsButton.hidden = false
        this.header.classList.toggle("is-sub", sub)
        this.pageTitle.hidden = !sub
        if (display == "games" && extraInfo?.hostId != null) {
            this.pageTitle.textContent = this.hostList.getHost(extraInfo.hostId)?.getCache()?.name ?? ""
        } else if (display == "settings") {
            this.pageTitle.textContent = I.home.settings
        }

        // Mount the new display
        if (display == "hosts") {
            if (this.currentDisplay != "settings") {
                this.hostList.mount(this.content)
            }

            setAppState({ display: "hosts" }, pushIntoHistory)
        } else if (display == "games" && extraInfo?.hostId != null) {
            if (this.gameList?.getHostId() != extraInfo?.hostId) {
                this.gameList = new GameList(this.api, extraInfo?.hostId, extraInfo?.hostCache ?? null)
                this.gameList.addForceReloadListener(this.forceFetch.bind(this))
            }

            this.gameList.mount(this.content)

            this.refreshGameListActiveGame()

            setAppState({ display: "games", hostId: this.gameList?.getHostId() }, pushIntoHistory)
        } else if (display == "settings") {
            // The home page stays below the panel
            if (this.currentDisplay != "hosts") {
                this.hostList.mount(this.content)
            }
            this.settingsBody.replaceChildren()
            this.settings?.mount(this.settingsBody)
            if (this.user?.role == "Admin") {
                this.settingsBody.appendChild(this.adminBlock)
            }
            document.body.appendChild(this.settingsView)
            this.settingsView.querySelector<HTMLElement>(".sl-panel-head button")?.focus()

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

        if (this.currentDisplay == "games" && this.gameList) {
            this.pageTitle.textContent = this.hostList.getHost(this.gameList.getHostId())?.getCache()?.name ?? ""
        }

        await Promise.all([
            promiseUser,
            promiseRoles,
            this.refreshGameListActiveGame()
        ])
    }
    private async refreshUserRole() {
        this.user = await apiGetUser(this.api)

        this.loginButton.hidden = !this.user.is_default_user
        this.logoutButton.hidden = this.user.is_default_user

        const admin = this.user.role == "Admin"
        this.guestLinkButton.hidden = !admin
        this.adminButton.hidden = !admin
        if (admin) {
            this.checkForUpdate()
            if (this.currentDisplay == "settings" && !this.settingsBody.contains(this.adminBlock)) {
                this.settingsBody.appendChild(this.adminBlock)
            }
        } else {
            this.adminBlock.remove()
        }
    }
    private async refreshUserPermissions() {
        const response = await apiGetRole(this.api, { id: null })
        this.role = response.role

        this.hostList.setCanAddHosts(this.role.permissions.allow_add_hosts)
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
