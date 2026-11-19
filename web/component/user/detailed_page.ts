import { Component, ComponentEvent } from "../index"
import { Api, apiDeleteDefaultUser, apiGetDefaultUser, apiGetRoles, apiPatchUser, apiPutDefaultUser } from "../../api"
import { DetailedUser, PatchUserRequest } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { InputComponent, SelectComponent } from "../input"
import { createSelectRoleInput } from "./role_select"
import { tryDeleteUser, UserEventListener } from "./index"
import { showNotification } from "../notification"
import { button, el } from "../../icons"
import { confirmDialog } from "../sl_modal"

export class DetailedUserPage implements Component {

    private api: Api

    private formRoot = document.createElement("form")
    private grid = el("div", "sl-admin-grid")
    private defaultTag = el("span", "sl-tag")
    private defaultRow = el("div", "sl-setting sl-admin-default")
    private user: DetailedUser

    private id

    private idElement: InputComponent
    private name: InputComponent
    private password: InputComponent
    private role: SelectComponent
    private clientUniqueId: InputComponent

    private applyButton = el("button", "sl-btn sl-btn-ink")
    private deleteButton = button("sl-btn sl-btn-danger", "", "trash")
    private resetButton = el("button", "sl-btn sl-btn-quiet")
    private setDefaultButton = el("button", "sl-btn")
    private removeAsDefaultButton = el("button", "sl-btn")

    constructor(api: Api, user: DetailedUser) {
        this.api = api
        this.id = user.id
        const i = getTranslations(getCurrentLanguage()).admin

        this.user = user
        this.formRoot.classList.add("sl-admin-detail")

        // Title (design/screens/S-Admin-Users)
        const head = el("div", "sl-admin-detail-head")
        const titles = el("div", "sl-admin-detail-titles")
        titles.append(el("span", "sl-label", i.userLabel), el("h1", "sl-h1 sl-admin-name", user.name))
        this.defaultTag.textContent = i.defaultUserTag
        this.defaultTag.hidden = true
        head.append(titles, this.defaultTag)
        this.formRoot.append(head, el("div", "sl-rule"), this.grid)

        this.idElement = new InputComponent("userId", "number", i.userId, {
            defaultValue: `${user.id}`
        })
        this.idElement.setEnabled(false)

        this.name = new InputComponent("userName", "text", i.userName, {
            defaultValue: user.name,
        })
        this.name.setEnabled(false)
        this.name.mount(this.grid)

        this.role = createSelectRoleInput([], user.role_id)
        this.role.mount(this.grid)

        this.password = new InputComponent("userPassword", "text", i.newPassword, {
            placeholer: i.keepPasswordHint,
            formRequired: true,
            hasEnableCheckbox: true
        })
        this.password.setEnabled(false)
        this.password.mount(this.grid)

        this.clientUniqueId = new InputComponent("userClientUniqueId", "text", i.moonlightClientId, {
            defaultValue: user.client_unique_id,
        })
        this.clientUniqueId.mount(this.grid)
        this.idElement.mount(this.grid)

        apiGetRoles(api).then(roles => {
            this.role.unmount(this.grid)

            this.role = createSelectRoleInput(roles.roles, user.role_id)
            this.role.mountBefore(this.grid, this.password)
        })

        // Default user
        const defaultText = el("div", "txt")
        defaultText.append(el("span", "title", i.setDefaultUser), el("span", "sl-help", i.setDefaultUserHelp))
        this.setDefaultButton.type = "button"
        this.setDefaultButton.textContent = i.setDefaultUser
        this.setDefaultButton.addEventListener("click", this.setDefault.bind(this))
        this.removeAsDefaultButton.type = "button"
        this.removeAsDefaultButton.textContent = i.removeAsDefault
        this.removeAsDefaultButton.addEventListener("click", this.removeAsDefault.bind(this))
        this.removeAsDefaultButton.hidden = true
        this.defaultRow.append(defaultText, this.setDefaultButton, this.removeAsDefaultButton)
        this.formRoot.appendChild(this.defaultRow)

        // Delete · Reset · Apply
        const foot = el("div", "sl-admin-foot")
        this.deleteButton.append(i.delete)
        this.deleteButton.addEventListener("click", this.delete.bind(this))
        this.resetButton.type = "button"
        this.resetButton.textContent = i.reset
        this.resetButton.addEventListener("click", () => this.reset())
        this.applyButton.type = "submit"
        this.applyButton.append(i.apply, el("span", undefined, "→"))
        foot.append(this.deleteButton, el("span", "sl-admin-foot-gap"), this.resetButton, this.applyButton)
        this.formRoot.appendChild(foot)

        this.checkIsDefault()

        this.formRoot.addEventListener("submit", this.apply.bind(this))
    }

    private async apply(event: SubmitEvent) {
        event.preventDefault()
        const i = getTranslations(getCurrentLanguage()).admin

        let password = null
        if (this.password.isEnabled()) {
            password = this.password.getValue()
        }

        const role = this.role.getValue()
        if (!role) {
            showNotification(i.pleaseSelectRole)
            return
        }

        const request: PatchUserRequest = {
            id: this.id,
            role_id: parseInt(role),
            password,
            client_unique_id: this.clientUniqueId.getValue()
        };

        this.applyButton.classList.add("is-loading")
        try {
            await apiPatchUser(this.api, request)
            showNotification(i.saved, "ok")
        } finally {
            this.applyButton.classList.remove("is-loading")
        }
    }

    private reset() {
        this.password.setValue("")
        this.password.setEnabled(false)
        this.role.reset()
        this.clientUniqueId.setValue(this.user.client_unique_id)
    }

    private async delete() {
        const i = getTranslations(getCurrentLanguage()).admin
        const confirmed = await confirmDialog({ title: i.deleteUserConfirm(this.user.name), text: i.deleteConfirmText, confirm: i.delete, danger: true, icon: "trash" })
        if (!confirmed) {
            return
        }
        await tryDeleteUser(this.api, this.id)

        this.formRoot.dispatchEvent(new ComponentEvent("ml-userdeleted", this))
    }

    private async setDefault() {
        const i = getTranslations(getCurrentLanguage()).admin
        const accepted = await confirmDialog({ title: i.defaultUserConfirm(this.user.name), text: i.defaultUserConfirmText(this.user.name), confirm: i.setDefaultUser })
        if (!accepted) {
            return
        }

        await apiPutDefaultUser(this.api, {
            id: this.id,
        })

        this.checkIsDefault()
    }

    private async removeAsDefault() {
        await apiDeleteDefaultUser(this.api)

        this.checkIsDefault()
    }

    private async checkIsDefault() {
        const defaultUser = await apiGetDefaultUser(this.api)
        const isDefault = defaultUser.id == this.id
        this.defaultTag.hidden = !isDefault
        this.setDefaultButton.hidden = isDefault
        this.removeAsDefaultButton.hidden = !isDefault
    }

    addDeletedListener(listener: UserEventListener, options?: EventListenerOptions) {
        this.formRoot.addEventListener("ml-userdeleted", listener as any, options)
    }
    removeDeletedListener(listener: UserEventListener) {
        this.formRoot.removeEventListener("ml-userdeleted", listener as any)
    }

    getUserId(): number {
        return this.id
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.formRoot)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.formRoot)
    }
}
