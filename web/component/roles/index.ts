import { Api, apiDeleteRole, apiGetRole, apiGetUsers } from "../../api"
import { DetailedRole, UndetailedRole } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { Component, ComponentEvent } from "../index"
import { showMessage } from "../modal/index"

export type RoleEventListener = (event: ComponentEvent<Role>) => void

export function formatRoleName(role: UndetailedRole | DetailedRole): string {
    return `${role.name} (${role.id})`
}

export async function tryDeleteRole(api: Api, id: number): Promise<boolean> {
    const i = getTranslations(getCurrentLanguage()).admin
    // Check if any user still has this role and show error if they do
    const usersResponse = await apiGetUsers(api)
    const usersWithRole = usersResponse.users.filter(user => user.role_id == id)
    if (usersWithRole.length > 0) {
        await showMessage(i.roleDeleteBlocked(usersWithRole.map(user => user.name)))
        return false
    }

    // Actually delete the role
    await apiDeleteRole(api, { id })

    return true
}

export class Role implements Component {

    private api: Api

    private role: DetailedRole | { id: number }

    private div = document.createElement("div")
    private nameElement = document.createElement("p")
    private subElement = document.createElement("span")

    constructor(api: Api, role: DetailedRole | { id: number }) {
        this.api = api

        // Swiss Console index row (design/screens/S-Admin-Users)
        this.div.className = "sl-admin-row"
        this.div.tabIndex = 0
        this.div.setAttribute("role", "button")
        this.nameElement.className = "name"
        this.subElement.className = "sl-muted sub"
        const text = document.createElement("span")
        text.className = "sl-admin-row-text"
        text.append(this.nameElement, this.subElement)
        this.div.appendChild(text)
        this.div.addEventListener("keydown", event => {
            if (event.key == "Enter" || event.key == " ") {
                event.preventDefault()
                this.div.click()
            }
        })
        this.div.addEventListener("click", this.onClick.bind(this))
        this.div.addEventListener("contextmenu", this.onContextMenu.bind(this))

        this.role = role
        if ("name" in role) {
            this.updateCache(role)
        } else {
            this.forceFetch()
        }
    }

    async forceFetch() {
        const response = await apiGetRole(this.api, {
            id: this.role.id,
        })

        this.updateCache(response.role)
    }
    updateCache(role: DetailedRole) {
        this.role = role

        this.nameElement.innerText = role.name
        this.subElement.innerText = role.ty ?? ""
        if (role.ty == undefined) {
            // The list only has id + name; fetch the type for the subtitle
            this.forceFetch()
        }
    }

    private onClick() {
        this.div.dispatchEvent(new ComponentEvent("ml-roleclicked", this))
    }

    private onContextMenu(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).admin
        setContextMenu(event, {
            elements: [
                {
                    name: i.delete,
                    callback: this.onDelete.bind(this)
                }
            ]
        })
    }

    addClickedListener(listener: RoleEventListener, options?: EventListenerOptions) {
        this.div.addEventListener("ml-roleclicked", listener as any, options)
    }
    removeClickedListener(listener: RoleEventListener) {
        this.div.removeEventListener("ml-roleclicked", listener as any)
    }

    private async onDelete() {
        if (!await tryDeleteRole(this.api, this.role.id)) {
            return
        }

        this.div.dispatchEvent(new ComponentEvent("ml-roledeleted", this))
    }

    addDeletedListener(listener: RoleEventListener, options?: EventListenerOptions) {
        this.div.addEventListener("ml-roledeleted", listener as any, options)
    }
    removeDeletedListener(listener: RoleEventListener) {
        this.div.removeEventListener("ml-roledeleted", listener as any)
    }

    getCache(): DetailedRole | null {
        if ("name" in this.role) {
            return this.role
        } else {
            return null
        }
    }

    getRoleId(): number {
        return this.role.id
    }

    setSelected(selected: boolean) {
        this.div.setAttribute("aria-current", selected ? "true" : "false")
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.div)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.div)
    }
}
