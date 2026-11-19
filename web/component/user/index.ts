import { Api, apiDeleteUser, apiGetUser } from "../../api"
import { DetailedUser } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { Component, ComponentEvent } from "../index"

export type UserEventListener = (event: ComponentEvent<User>) => void

export async function tryDeleteUser(api: Api, id: number) {
    await apiDeleteUser(api, { id })
}

export class User implements Component {

    private api: Api

    private user: DetailedUser | { id: number }

    private div = document.createElement("div")
    private nameElement = document.createElement("p")
    private subElement = document.createElement("span")

    constructor(api: Api, user: DetailedUser | { id: number }) {
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

        this.user = user
        if ("name" in user) {
            this.updateCache(user)
        } else {
            this.forceFetch()
        }
    }

    async forceFetch() {
        const user = await apiGetUser(this.api, {
            name: null,
            user_id: this.user.id,
        })

        this.updateCache(user)
    }
    updateCache(user: DetailedUser) {
        this.user = user

        this.nameElement.innerText = user.name
        this.subElement.innerText = user.role
    }

    private onClick() {
        this.div.dispatchEvent(new ComponentEvent("ml-userclicked", this))
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

    addClickedListener(listener: UserEventListener, options?: EventListenerOptions) {
        this.div.addEventListener("ml-userclicked", listener as any, options)
    }
    removeClickedListener(listener: UserEventListener) {
        this.div.removeEventListener("ml-userclicked", listener as any)
    }

    private onDelete() {
        tryDeleteUser(this.api, this.user.id)

        this.div.dispatchEvent(new ComponentEvent("ml-userdeleted", this))
    }

    addDeletedListener(listener: UserEventListener, options?: EventListenerOptions) {
        this.div.addEventListener("ml-userdeleted", listener as any, options)
    }
    removeDeletedListener(listener: UserEventListener) {
        this.div.removeEventListener("ml-userdeleted", listener as any)
    }

    getCache(): DetailedUser | null {
        if ("name" in this.user) {
            return this.user
        } else {
            return null
        }
    }

    getUserId(): number {
        return this.user.id
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
