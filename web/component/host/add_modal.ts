import { DiscoveredHost, PostHostRequest } from "../../api_bindings"
import { Api, apiDiscoverHosts } from "../../api"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { InputComponent } from "../input"
import { FormModal } from "../modal/form"

export class AddHostModal extends FormModal<PostHostRequest> {

    private api: Api

    private header: HTMLElement = document.createElement("h2")

    // Starlight Streams: pcs found on the local network
    private discoveredHeader: HTMLElement = document.createElement("p")
    private discoveredList: HTMLDivElement = document.createElement("div")
    private manualHeader: HTMLElement = document.createElement("p")

    private address: InputComponent
    private httpPort: InputComponent

    constructor(api: Api) {
        super()
        this.api = api
        const i = getTranslations(getCurrentLanguage()).addHost

        this.header.innerText = i.header

        this.discoveredHeader.classList.add("add-host-section")
        this.discoveredList.classList.add("add-host-discovered")
        this.manualHeader.classList.add("add-host-section")
        this.manualHeader.innerText = i.manual

        this.address = new InputComponent("address", "text", i.address, {
            formRequired: true
        })

        this.httpPort = new InputComponent("httpPort", "text", i.port, {
            inputMode: "numeric"
        })
    }

    private async discover() {
        const i = getTranslations(getCurrentLanguage()).addHost

        this.discoveredHeader.innerText = i.searching
        this.discoveredList.replaceChildren()

        let hosts: Array<DiscoveredHost>
        try {
            hosts = (await apiDiscoverHosts(this.api)).hosts
        } catch (e) {
            hosts = []
        }

        this.discoveredHeader.innerText = hosts.length > 0 ? i.found : i.nothingFound

        for (const host of hosts) {
            const button = document.createElement("button")
            button.type = "button"
            button.classList.add("add-host-discovered-host")
            button.innerText = host.already_added ? i.alreadyAdded(host.name) : `🖥 ${host.name}  ·  ${host.address}`
            button.disabled = host.already_added
            button.addEventListener("click", () => {
                this.address.setValue(host.address)
                this.httpPort.setValue(`${host.http_port}`)
                button.form?.requestSubmit()
            })
            this.discoveredList.appendChild(button)
        }
    }

    reset(): void {
        this.address.reset()
        this.httpPort.reset()
        this.discover()
    }
    submit(): PostHostRequest | null {
        const address = this.address.getValue()
        const httpPort = parseInt(this.httpPort.getValue())

        return {
            address,
            http_port: httpPort
        }
    }

    mountForm(form: HTMLFormElement): void {
        form.appendChild(this.header)
        form.appendChild(this.discoveredHeader)
        form.appendChild(this.discoveredList)
        form.appendChild(this.manualHeader)
        this.address.mount(form)
        this.httpPort.mount(form)
    }
}
