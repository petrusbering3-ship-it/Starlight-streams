import { DiscoveredHost, PostHostRequest } from "../../api_bindings"
import { Api, apiDiscoverHosts } from "../../api"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { button, el, icon } from "../../icons"
import { openSlModal } from "../sl_modal"

// Starlight Streams: Add PC (design/screens/S-Home-Modals, 01): searches the network and
// lists the PCs it finds, or takes an address typed by hand.

export function showAddPcDialog(api: Api): Promise<PostHostRequest | null> {
    const i = getTranslations(getCurrentLanguage()).addHost
    const modal = openSlModal({ title: getTranslations(getCurrentLanguage()).home.addPc })

    // Found on the network
    const searching = el("div", "sl-add-searching")
    searching.append(el("span", "sl-spinner"), el("span", "sl-ink2", i.searching))
    const found = el("div", "sl-add-found")

    // Typed by hand
    const or = el("div", "sl-add-or")
    or.appendChild(el("span", "sl-label", i.manual))
    const manual = el("div", "sl-add-manual")
    const addressField = el("div", "sl-field")
    const addressLabel = el("label", "sl-label", i.address)
    addressLabel.htmlFor = "sl-add-address"
    const address = el("input", "sl-input sl-input-sm")
    address.id = "sl-add-address"
    address.placeholder = i.addressPlaceholder
    address.autocomplete = "off"
    addressField.append(addressLabel, address)
    const portField = el("div", "sl-field")
    const portLabel = el("label", "sl-label", i.port)
    portLabel.htmlFor = "sl-add-port"
    const port = el("input", "sl-input sl-input-sm")
    port.id = "sl-add-port"
    port.inputMode = "numeric"
    port.placeholder = "47989"
    portField.append(portLabel, port)
    manual.append(addressField, portField)

    modal.body.append(searching, found, or, manual)

    const cancel = button("sl-btn sl-btn-quiet", getTranslations(getCurrentLanguage()).modal.cancel)
    const add = el("button", "sl-btn sl-btn-ink sl-add-submit")
    add.type = "button"
    add.append(i.add, el("span", undefined, "→"))
    add.disabled = true
    modal.foot.append(cancel, add)

    const portValue = () => port.value.trim() == "" ? NaN : parseInt(port.value)
    const valid = () => address.value.trim() != "" && (port.value.trim() == "" || (portValue() > 0 && portValue() < 65536))
    const update = () => add.disabled = !valid()
    address.addEventListener("input", update)
    port.addEventListener("input", update)

    return new Promise(resolve => {
        let result: PostHostRequest | null = null
        const finish = (request: PostHostRequest) => {
            result = request
            modal.close()
        }
        cancel.addEventListener("click", () => modal.close())
        add.addEventListener("click", () => {
            if (valid()) {
                finish({ address: address.value.trim(), http_port: portValue() })
            }
        })
        for (const input of [address, port]) {
            input.addEventListener("keydown", event => {
                if (event.key == "Enter" && valid()) {
                    finish({ address: address.value.trim(), http_port: portValue() })
                }
            })
        }
        modal.closed.then(() => resolve(result))

        apiDiscoverHosts(api).then(response => response.hosts).catch(() => [] as Array<DiscoveredHost>).then(hosts => {
            searching.replaceChildren(el("span", "sl-ink2", hosts.length > 0 ? i.found : i.nothingFound))
            hosts.forEach((host, index) => {
                const row = el("button", "sl-index-row sl-add-host")
                row.type = "button"
                row.disabled = host.already_added
                const name = el("span", "sl-add-host-name")
                const title = el("span", "name", host.name)
                name.appendChild(title)
                if (host.already_added) {
                    name.appendChild(el("span", "sl-muted sl-add-already", ` ${i.alreadyAddedSuffix}`))
                }
                name.appendChild(el("span", "sl-mono sl-muted sl-add-ip", host.address))
                row.append(el("span", "sl-mono sl-muted", String(index + 1).padStart(2, "0")), name)
                if (!host.already_added) {
                    row.appendChild(icon("chevronRight"))
                }
                row.addEventListener("click", () => finish({ address: host.address, http_port: host.http_port }))
                found.appendChild(row)
            })
        })
    })
}
