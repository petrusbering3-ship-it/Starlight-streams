//! Starlight Streams: finds the pcs running Sunshine on the local network,
//! so nobody has to type an ip address.

use std::{
    net::{IpAddr, Ipv4Addr},
    time::Duration,
};

use futures::future::join_all;
use moonlight_common::http::{
    ClientInfo,
    client::async_client::RequestClient as _,
    server_info::{ServerInfoEndpoint, ServerInfoRequest},
};
use tokio::{net::UdpSocket, time::timeout};
use uuid::Uuid;

use crate::app::{AppError, RequestClient, storage::StorageQueryHosts, user::AuthenticatedUser};

pub struct DiscoveredHost {
    pub name: String,
    pub address: String,
    pub http_port: u16,
    pub already_added: bool,
}

/// The direct cable network between a Raspberry Pi and the pc (see installer/pi/install-pi.sh)
const CABLE_NETWORK_TARGET: &str = "192.168.50.2:9";

/// The ip address of the network card used to reach `target`
async fn local_ipv4(target: &str) -> Option<Ipv4Addr> {
    // Connecting an udp socket sends nothing, it only picks the network card for that route
    let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
    socket.connect(target).await.ok()?;

    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if ip.is_private() => Some(ip),
        _ => None,
    }
}

impl AuthenticatedUser {
    /// Asks every address of the local /24 network for Sunshine's server info
    pub async fn discover_hosts(
        &mut self,
        http_port: u16,
    ) -> Result<Vec<DiscoveredHost>, AppError> {
        // Searching is only useful (and allowed) for users that may add pcs
        if !self.role().await?.permissions().await?.allow_add_hosts {
            return Err(AppError::Forbidden);
        }

        // The home network, and a pc connected directly with a cable
        let mut networks = Vec::new();
        for target in ["8.8.8.8:53", CABLE_NETWORK_TARGET] {
            if let Some(ip) = local_ipv4(target).await {
                let [a, b, c, _] = ip.octets();
                if !networks.contains(&(a, b, c)) {
                    networks.push((a, b, c));
                }
            }
        }

        let unique_id = self.host_unique_id().await?;

        let checks = networks
            .into_iter()
            .flat_map(|(a, b, c)| (1..=254u8).map(move |d| Ipv4Addr::new(a, b, c, d)));
        let checks = checks.map(|ip| {
            let unique_id = unique_id.clone();
            async move {
                let address = ip.to_string();

                let client = RequestClient::with_defaults().ok()?;
                let info = timeout(
                    Duration::from_millis(2500),
                    client.send_http::<ServerInfoEndpoint>(
                        ClientInfo {
                            uuid: Uuid::new_v4(),
                            unique_id,
                        },
                        &format!("{address}:{http_port}"),
                        &ServerInfoRequest {},
                    ),
                )
                .await
                .ok()?
                .ok()?;

                Some((address, info.host_name))
            }
        });
        let found = join_all(checks).await.into_iter().flatten();

        // Mark pcs that this user already added
        let app = self.app.access()?;
        let mut added_addresses = Vec::new();
        for (host_id, host) in app
            .storage
            .list_user_hosts(StorageQueryHosts { user_id: self.id() })
            .await?
        {
            let host = match host {
                Some(host) => host,
                None => app.storage.get_host(host_id).await?,
            };
            added_addresses.push(host.address);
        }

        Ok(found
            .map(|(address, name)| DiscoveredHost {
                already_added: added_addresses.contains(&address),
                name,
                address,
                http_port,
            })
            .collect())
    }
}
