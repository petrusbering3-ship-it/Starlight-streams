import { Component, ComponentEvent } from "../index"
import { Api, apiGetDefaultRole, apiPatchRole, apiPutDefaultRole } from "../../api"
import { DetailedRole, PatchRoleRequest, RoleType } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { InputComponent, SelectComponent } from "../input"
import { tryDeleteRole, RoleEventListener } from "./index"
import { RolePermissionsMenu } from "./permissions"
import { StreamSettingsComponent } from "../settings_menu"
import { button, el } from "../../icons"
import { confirmDialog } from "../sl_modal"
import { showNotification } from "../notification"

export class DetailedRolePage implements Component {

    private api: Api

    private formRoot = document.createElement("form")
    private grid = el("div", "sl-admin-grid")
    private defaultTag = el("span", "sl-tag")
    private role: DetailedRole

    // -- General role info
    private id

    private idElement: InputComponent
    private name: InputComponent
    private ty: SelectComponent

    // -- Permissions
    private permissionsHeader = el("h3", "sl-h3 sl-admin-section")
    private permissions: RolePermissionsMenu

    // -- Default Settings
    private defaultSettingsHeader = el("h3", "sl-h3 sl-admin-section")
    private permissionsSlot = el("div")
    private defaultSettingsSlot = el("div", "sl-admin-settings")
    private defaultSettings: StreamSettingsComponent

    // -- Apply buttons
    private applyButton = el("button", "sl-btn sl-btn-ink")
    private deleteButton = button("sl-btn sl-btn-danger", "", "trash")
    private resetButton = el("button", "sl-btn sl-btn-quiet")
    private setDefaultButton = el("button", "sl-btn")

    constructor(api: Api, role: DetailedRole) {
        this.api = api
        this.id = role.id
        const i = getTranslations(getCurrentLanguage()).admin

        this.role = role
        this.formRoot.classList.add("sl-admin-detail")

        // Title (design/screens/S-Admin-Roles)
        const head = el("div", "sl-admin-detail-head")
        const titles = el("div", "sl-admin-detail-titles")
        titles.append(el("span", "sl-label", i.roleLabel), el("h1", "sl-h1 sl-admin-name", role.name))
        this.defaultTag.textContent = i.defaultRoleTag
        this.defaultTag.hidden = true
        head.append(titles, this.defaultTag)
        this.formRoot.append(head, el("div", "sl-rule"), this.grid)

        // Role stuff
        this.idElement = new InputComponent("roleId", "number", i.roleId, {
            defaultValue: `${role.id}`
        })
        this.idElement.setEnabled(false)

        this.name = new InputComponent("roleName", "text", i.roleName, {
            defaultValue: role.name,
        })
        this.name.mount(this.grid)

        this.ty = new SelectComponent("roleTy", [
            { value: "User", name: "User" },
            { value: "Admin", name: "Admin" },
        ], {
            displayName: i.roleType,
            preSelectedOption: role.ty,
        })
        this.ty.mount(this.grid)
        this.idElement.mount(this.grid)

        // Permissions
        this.permissionsHeader.innerText = i.permissions
        this.formRoot.appendChild(this.permissionsHeader)

        this.permissions = new RolePermissionsMenu(role.permissions)
        this.permissions.mount(this.permissionsSlot)
        this.formRoot.appendChild(this.permissionsSlot)
        this.permissions.addChangeListener(this.onPermissionsChange.bind(this))

        // Default Settings
        this.defaultSettingsHeader.innerText = i.defaultSettings
        this.formRoot.appendChild(this.defaultSettingsHeader)

        this.defaultSettings = new StreamSettingsComponent(role.permissions, role.default_settings, false)
        this.defaultSettings.mount(this.defaultSettingsSlot)
        this.formRoot.appendChild(this.defaultSettingsSlot)

        // Default role
        const defaultRow = el("div", "sl-setting sl-admin-default")
        const defaultText = el("div", "txt")
        defaultText.append(el("span", "title", i.setDefaultRole), el("span", "sl-help", i.setDefaultRoleHelp))
        this.setDefaultButton.type = "button"
        this.setDefaultButton.textContent = i.setDefaultRole
        this.setDefaultButton.addEventListener("click", this.setDefault.bind(this))
        defaultRow.append(defaultText, this.setDefaultButton)
        this.formRoot.appendChild(defaultRow)

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

        this.updateDefault()

        this.formRoot.addEventListener("submit", this.apply.bind(this))
    }

    private onPermissionsChange() {
        const currentSettings = this.defaultSettings.getStreamSettings()

        this.defaultSettings.unmount(this.defaultSettingsSlot)

        this.defaultSettings = new StreamSettingsComponent(this.permissions.getPermissions(), currentSettings, false)
        this.defaultSettings.mount(this.defaultSettingsSlot)
    }

    private async updateDefault() {
        try {
            const isDefault = (await apiGetDefaultRole(this.api)).id == this.id
            this.defaultTag.hidden = !isDefault
            this.setDefaultButton.hidden = isDefault
        } catch {
            // Keep the button
        }
    }

    private reset() {
        this.name.setValue(this.role.name)
        this.ty.reset()

        this.permissions.unmount(this.permissionsSlot)
        this.permissions = new RolePermissionsMenu(this.role.permissions)
        this.permissions.addChangeListener(this.onPermissionsChange.bind(this))
        this.permissions.mount(this.permissionsSlot)

        this.defaultSettings.unmount(this.defaultSettingsSlot)
        this.defaultSettings = new StreamSettingsComponent(this.role.permissions, this.role.default_settings, false)
        this.defaultSettings.mount(this.defaultSettingsSlot)
    }

    private async apply(event: SubmitEvent) {
        event.preventDefault()

        const request: PatchRoleRequest = {
            id: this.id,
            name: this.name.getValue(),
            ty: this.ty.getValue() as RoleType,
            default_settings: this.defaultSettings.getStreamSettings(),
            permissions: this.permissions.getPermissions()
        };

        this.applyButton.classList.add("is-loading")
        try {
            await apiPatchRole(this.api, request)
            showNotification(getTranslations(getCurrentLanguage()).admin.saved, "ok")
        } finally {
            this.applyButton.classList.remove("is-loading")
        }
    }

    private async delete() {
        const i = getTranslations(getCurrentLanguage()).admin
        const confirmed = await confirmDialog({ title: i.deleteRoleConfirm(this.role.name), text: i.deleteConfirmText, confirm: i.delete, danger: true, icon: "trash" })
        if (!confirmed) {
            return
        }
        if (!await tryDeleteRole(this.api, this.id)) {
            return
        }

        this.formRoot.dispatchEvent(new ComponentEvent("ml-roledeleted", this))
    }

    private async setDefault() {
        await apiPutDefaultRole(this.api, {
            id: this.id,
        })
        await this.updateDefault()
    }

    addDeletedListener(listener: RoleEventListener, options?: EventListenerOptions) {
        this.formRoot.addEventListener("ml-roledeleted", listener as any, options)
    }
    removeDeletedListener(listener: RoleEventListener) {
        this.formRoot.removeEventListener("ml-roledeleted", listener as any)
    }

    getRoleId(): number {
        return this.id
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.formRoot)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.formRoot)
    }
}
