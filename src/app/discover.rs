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

/// The ip address of the network card used for the local network
async fn local_ipv4() -> Option<Ipv4Addr> {
    // Connecting an udp socket sends nothing, it only picks the network card for that route
    let socket = UdpSocket::bind("0.0.0.0:0").await.ok()?;
    socket.connect("8.8.8.8:53").await.ok()?;

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

        let Some(local_ip) = local_ipv4().await else {
            return Ok(Vec::new());
        };
        let [a, b, c, _] = local_ip.octets();

        let unique_id = self.host_unique_id().await?;

        let checks = (1..=254u8).map(|d| {
            let unique_id = unique_id.clone();
            async move {
                let address = Ipv4Addr::new(a, b, c, d).to_string();

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
