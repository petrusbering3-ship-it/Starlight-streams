import "./polyfill/index"
import "./styles/index"
import { Api, apiGetRole, apiGetUser, apiLogout, apiPostRole, apiPostUser, FetchError, getApi } from "./api"
import { Component, ComponentEvent } from "./component/index"
import { showNotification } from "./component/notification"
import { setTouchContextMenuEnabled } from "./polyfill/ios_right_click"
import { UserList } from "./component/user/list"
import { AddUserModal } from "./component/user/add_modal"
import { showMessage, showModal } from "./component/modal/index"
import { buildUrl } from "./config_"
import { DetailedUserPage } from "./component/user/detailed_page"
import { User, UserEventListener } from "./component/user/index"
import { DetailedRole, DetailedUser } from "./api_bindings"
import { Role, RoleEventListener } from "./component/roles/index"
import { RoleList } from "./component/roles/list"
import { DetailedRolePage } from "./component/roles/detailed_page"
import { AddRoleModal } from "./component/roles/add_modal"
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations } from "./i18n"
import { button, el, icon } from "./icons"
import { apiStarlightInfo } from "./api"

let I = getTranslations(getCurrentLanguage())

async function startApp() {
    setTouchContextMenuEnabled(true)

    const api = await getApi()

    const bootstrapRole = await apiGetRole(api, { id: null })
    adoptRoleDefaultLanguage(bootstrapRole.role.default_settings)
    I = getTranslations(getCurrentLanguage())

    checkPermissions(api)

    const rootElement = document.getElementById("root")
    if (rootElement == null) {
        showNotification(I.admin.rootNotFound, "error")
        return;
    }

    const app = new AdminApp(api)
    app.mount(rootElement)

    app.forceFetch()

    // -- App states
    let lastAppState: AppState | null = null
    if (sessionStorage) {
        const lastStateText = sessionStorage.getItem("mlAdminState")
        if (lastStateText) {
            lastAppState = JSON.parse(lastStateText)
        }
    }

    window.addEventListener("popstate", event => {
        if (event.state) {
            app.setAppState(event.state, false)
        }
    })

    if (lastAppState) {
        app.setAppState(lastAppState)
    } else {
        // set default state
        app.setAppState({ tab: "users", user_id: null })
    }
}

async function checkPermissions(api: Api) {
    const user = await apiGetUser(api)

    if (user.role != "Admin") {
        await showMessage(I.admin.unauthorized)

        window.location.href = buildUrl("/")
    }
}

type AppState = { tab: "users", user_id: number | null } |
{ tab: "roles", role_id: number | null }
function pushAppState(state: AppState, pushHistory: boolean) {
    if (pushHistory) {
        history.pushState(state, "")
    }

    if (sessionStorage) {
        sessionStorage.setItem("mlAdminState", JSON.stringify(state))
    }
}
function backAppState() {
    history.back()
}

startApp()

class AdminApp implements Component {

    private api: Api

    private root = document.createElement("div")

    private currentState: AppState | null = null

    // Status bar, header and tabs (design/screens/S-Admin-Users)
    private statusText = el("span", "sl-label")
    private versionText = el("span", "sl-label")
    private userTabButton = el("button", "sl-tab")
    private rolesTabButton = el("button", "sl-tab")

    // Content
    private content = el("div", "sl-admin-content")

    // The actual content of the tabs
    private users: UserPanel | null = null
    private roles: RolePanel | null = null

    constructor(api: Api) {
        this.api = api
        this.root.className = "sl-app sl-admin"

        const statusBar = el("div", "sl-statusbar")
        statusBar.append(this.statusText, this.versionText)
        this.statusText.textContent = I.home.serverOnline
        this.watchServer(statusBar)

        const header = el("header", "sl-header")
        const back = button("sl-link sl-back", I.index.back, "chevronLeft")
        back.addEventListener("click", () => window.location.href = buildUrl("/"))
        const logout = button("sl-link", I.home.logout)
        logout.addEventListener("click", async () => {
            await apiLogout(this.api)
            window.location.reload()
        })
        header.append(back, el("span", "sl-h3 sl-page-title", I.home.admin), el("span", "sl-tag sl-tag--role", "Admin"), logout)

        // Tabs
        const tabs = el("div", "sl-tabs sl-admin-tabs")
        tabs.setAttribute("role", "tablist")
        for (const [tab, text, state] of [[this.userTabButton, I.admin.users, { tab: "users", user_id: null }], [this.rolesTabButton, I.admin.roles, { tab: "roles", role_id: null }]] as const) {
            tab.type = "button"
            tab.setAttribute("role", "tab")
            tab.textContent = text
            tab.addEventListener("click", () => this.setAppState(state as AppState))
            tabs.appendChild(tab)
        }

        this.root.append(statusBar, header, tabs, this.content)
    }

    /// The ping in the status bar
    private async watchServer(statusBar: HTMLElement) {
        while (true) {
            const start = performance.now()
            let ok = true
            try {
                const info = await apiStarlightInfo(this.api)
                this.versionText.textContent = info.version
            } catch (e) {
                ok = !(e instanceof FetchError) || e.getResponse() != null
            }
            this.statusText.textContent = ok ? `${I.home.serverOnline} · ${Math.round(performance.now() - start)} ms` : I.home.unreachableBar
            statusBar.classList.toggle("sl-statusbar--error", !ok)
            await new Promise(resolve => setTimeout(resolve, ok ? 10_000 : 5_000))
        }
    }

    async forceFetch() {
        if (this.currentState?.tab == "users") {
            await this.users?.forceFetch()
        } else if (this.currentState?.tab == "roles") {
            await this.roles?.forceFetch()
        }
    }

    setAppState(state: AppState, pushIntoHistory?: boolean) {
        // check if tab changed and mount accordingly
        if (this.currentState?.tab != state.tab) {
            // Unmount old tab
            if (this.currentState?.tab == "users") {
                this.users?.unmount(this.content)
            } else if (this.currentState?.tab == "roles") {
                this.roles?.unmount(this.content)
            }

            // Mount and create (if necessary) new tab
            if (state.tab == "users") {
                if (!this.users) {
                    this.users = new UserPanel(this.api)
                    this.users.addUserChangedListener(event => {
                        pushAppState({ tab: "users", user_id: event.component.getUserId() }, true)
                    })
                }

                this.users.mount(this.content)
            } else if (state.tab == "roles") {
                if (!this.roles) {
                    this.roles = new RolePanel(this.api)
                    this.roles.addRoleChangedListener(event => {
                        pushAppState({ tab: "roles", role_id: event.component.getRoleId() }, true)
                    })
                }

                this.roles.mount(this.content)
            }
        }

        this.userTabButton.setAttribute("aria-selected", state.tab == "users" ? "true" : "false")
        this.rolesTabButton.setAttribute("aria-selected", state.tab == "roles" ? "true" : "false")

        // Save app state to browser history
        pushAppState(state, pushIntoHistory ?? true)

        // Change the content (e.g. user / role) of the tab
        this.currentState = state
        if (state.tab == "users" && state.user_id != null) {
            this.users?.setUserId(state.user_id)
        } else if (state.tab == "roles" && state.role_id != null) {
            this.roles?.setRoleId(state.role_id)
        }

        // Force fetch self to update data
        this.forceFetch()
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.root)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.root)
    }
}

class UserPanel implements Component {

    private api: Api

    private rootDiv = document.createElement("div")

    private userPanel = document.createElement("div")
    private addUserButton = document.createElement("button")
    private userSearch = document.createElement("input")
    private userList: UserList

    private userInfoPage: DetailedUserPage | null = null
    private emptyDetail = el("p")

    constructor(api: Api) {
        this.api = api

        this.rootDiv.classList.add("sl-admin-cols")

        // Select User Panel
        this.userPanel.classList.add("sl-admin-side")
        this.rootDiv.appendChild(this.userPanel)
        this.rootDiv.appendChild(this.emptyDetail)
        this.emptyDetail.className = "sl-admin-empty sl-muted"
        this.emptyDetail.textContent = I.admin.pickUser

        this.addUserButton.className = "sl-btn sl-btn-ink sl-admin-add"
        this.addUserButton.type = "button"
        this.addUserButton.replaceChildren(icon("plus"), I.admin.addUser)
        this.addUserButton.addEventListener("click", async () => {
            const addUserModal = new AddUserModal(api)

            const userRequest = await showModal(addUserModal)

            if (userRequest) {
                try {
                    const newUser = await apiPostUser(this.api, userRequest)

                    this.userList.insertList(newUser.id, newUser)
                } catch (e) {
                    // 409 = Conflict
                    if (e instanceof FetchError && e.getResponse()?.status == 409) {
                        // Name already exists
                        await showMessage(I.admin.userExists(userRequest.name))
                    } else {
                        throw e
                    }
                }
            }
        })
        this.userSearch.placeholder = I.admin.searchUser
        this.userSearch.type = "search"
        this.userSearch.className = "sl-input sl-input-sm"
        this.userSearch.setAttribute("aria-label", I.admin.searchUser)
        this.userSearch.addEventListener("input", this.onUserSearchChange.bind(this))
        const userTools = el("div", "sl-admin-tools")
        const userSearchWrap = el("div", "sl-games-search sl-admin-search")
        userSearchWrap.append(icon("search"), this.userSearch)
        userTools.append(userSearchWrap, this.addUserButton)
        this.userPanel.appendChild(userTools)

        this.userList = new UserList(api)
        this.userList.addUserClickedListener(this.onUserClicked.bind(this))
        this.userList.addUserDeletedListener(this.onUserDeleted.bind(this))
        this.userList.mount(this.userPanel)
    }

    addUserChangedListener(listener: UserEventListener) {
        this.userList.addUserClickedListener(listener)
    }

    getCurrentUserId(): number | null {
        return this.userInfoPage?.getUserId() ?? null
    }

    async forceFetch() {
        await this.userList.forceFetch()
    }

    private onUserSearchChange() {
        this.userList.setFilter(this.userSearch.value)
    }

    private async onUserClicked(event: ComponentEvent<User>) {
        await this.setUserId(event.component.getUserId())
    }
    async setUserId(userId: number) {
        const user = await apiGetUser(this.api, {
            user_id: userId,
            name: null
        })

        this.setUserInfo(user)
    }
    private setUserInfo(user: DetailedUser | null) {
        if (this.userInfoPage) {
            this.userInfoPage.unmount(this.rootDiv)
            this.userInfoPage.removeDeletedListener(this.onUserDeleted.bind(this))
        }

        this.userInfoPage = null
        this.emptyDetail.hidden = user != null
        if (user) {
            this.userInfoPage = new DetailedUserPage(this.api, user)
            this.userInfoPage.addDeletedListener(this.onUserDeleted.bind(this))
            this.userInfoPage.mount(this.rootDiv)
        }
        this.userList.setSelected(user?.id ?? null)
    }

    private onUserDeleted(event: ComponentEvent<User>) {
        if (this.userInfoPage?.getUserId() == event.component.getUserId()) {
            this.setUserInfo(null)
        }
        this.userList.removeUser(event.component.getUserId())
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.rootDiv)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.rootDiv)
    }
}

class RolePanel implements Component {

    private api: Api

    private rootDiv = document.createElement("div")

    private rolePanel = document.createElement("div")
    private addRoleButton = document.createElement("button")
    private roleSearch = document.createElement("input")
    private roleList: RoleList

    private roleInfoPage: DetailedRolePage | null = null
    private emptyDetail = el("p")

    constructor(api: Api) {
        this.api = api

        this.rootDiv.classList.add("sl-admin-cols")

        // Select Role Panel
        this.rolePanel.classList.add("sl-admin-side")
        this.rootDiv.appendChild(this.rolePanel)
        this.rootDiv.appendChild(this.emptyDetail)
        this.emptyDetail.className = "sl-admin-empty sl-muted"
        this.emptyDetail.textContent = I.admin.pickRole

        this.addRoleButton.className = "sl-btn sl-btn-ink sl-admin-add"
        this.addRoleButton.type = "button"
        this.addRoleButton.replaceChildren(icon("plus"), I.admin.addRole)
        this.addRoleButton.addEventListener("click", async () => {
            const addRoleModal = new AddRoleModal()

            const roleRequest = await showModal(addRoleModal)

            if (roleRequest) {
                try {
                    const newRole = await apiPostRole(this.api, roleRequest)

                    this.roleList.insertList(newRole.role.id, newRole.role)
                } catch (e) {
                    // 409 = Conflict
                    if (e instanceof FetchError && e.getResponse()?.status == 409) {
                        // Name already exists
                        await showMessage(I.admin.roleExists(roleRequest.name))
                    } else {
                        throw e
                    }
                }
            }
        })
        this.roleSearch.placeholder = I.admin.searchRole
        this.roleSearch.type = "search"
        this.roleSearch.className = "sl-input sl-input-sm"
        this.roleSearch.setAttribute("aria-label", I.admin.searchRole)
        this.roleSearch.addEventListener("input", this.onRoleSearchChange.bind(this))
        const roleTools = el("div", "sl-admin-tools")
        const roleSearchWrap = el("div", "sl-games-search sl-admin-search")
        roleSearchWrap.append(icon("search"), this.roleSearch)
        roleTools.append(roleSearchWrap, this.addRoleButton)
        this.rolePanel.appendChild(roleTools)

        this.roleList = new RoleList(api)
        this.roleList.addRoleClickedListener(this.onRoleClicked.bind(this))
        this.roleList.addRoleDeletedListener(this.onRoleDeleted.bind(this))
        this.roleList.mount(this.rolePanel)
    }

    addRoleChangedListener(listener: RoleEventListener) {
        this.roleList.addRoleClickedListener(listener)
    }

    getCurrentRoleId(): number | null {
        return this.roleInfoPage?.getRoleId() ?? null
    }

    async forceFetch() {
        await this.roleList.forceFetch()
    }

    private onRoleSearchChange() {
        this.roleList.setFilter(this.roleSearch.value)
    }

    private async onRoleClicked(event: ComponentEvent<Role>) {
        await this.setRoleId(event.component.getRoleId())
    }
    async setRoleId(roleId: number) {
        const role = await apiGetRole(this.api, {
            id: roleId,
        })

        this.setRoleInfo(role.role)
    }
    private setRoleInfo(role: DetailedRole | null) {
        if (this.roleInfoPage) {
            this.roleInfoPage.unmount(this.rootDiv)
            this.roleInfoPage.removeDeletedListener(this.onRoleDeleted.bind(this))
        }

        this.roleInfoPage = null
        this.emptyDetail.hidden = role != null
        if (role) {
            this.roleInfoPage = new DetailedRolePage(this.api, role)
            this.roleInfoPage.addDeletedListener(this.onRoleDeleted.bind(this))
            this.roleInfoPage.mount(this.rootDiv)
        }
        this.roleList.setSelected(role?.id ?? null)
    }

    private onRoleDeleted(event: ComponentEvent<Role>) {
        if (this.roleInfoPage?.getRoleId() == event.component.getRoleId()) {
            this.setRoleInfo(null)
        }
        this.roleList.removeRole(event.component.getRoleId())
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.rootDiv)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.rootDiv)
    }
}
