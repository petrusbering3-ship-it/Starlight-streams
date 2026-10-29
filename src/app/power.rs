//! Starlight Streams: shutting down hosts via the power agent and shutting them down
//! automatically when nobody streamed for a while.

use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::Mutex,
    time::{Duration, Instant},
};

use moonlight_common::mac::MacAddress;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpStream, UdpSocket, lookup_host},
    spawn,
    time::{sleep, timeout},
};
use tracing::{info, warn};

use crate::{
    app::{AppError, AppRef, guest::remove_expired_guests, host::HostId},
    config::AutoShutdownAction,
};

#[derive(Default)]
pub(super) struct HostActivity {
    hosts: Mutex<HashMap<HostId, ActivityEntry>>,
}

struct ActivityEntry {
    active_streams: u32,
    last_stream_end: Instant,
    /// The pc was unlocked for the stream and is locked again when the last stream ends
    relock: bool,
}

impl HostActivity {
    pub(super) fn mark_unlocked(&self, host_id: HostId) {
        let mut hosts = self.hosts.lock().expect("host activity lock");
        if let Some(entry) = hosts.get_mut(&host_id)
            && entry.active_streams > 0
        {
            entry.relock = true;
        }
    }
}

/// Wait before locking, so a stream that restarts (e.g. auto quality) doesn't lock the pc
const RELOCK_DELAY: Duration = Duration::from_secs(10);

/// Marks a host as streaming while this guard is alive.
pub struct StreamActivityGuard {
    app: AppRef,
    host_id: HostId,
}

impl StreamActivityGuard {
    pub(super) fn new(app: AppRef, host_id: HostId) -> Result<Self, AppError> {
        let inner = app.access()?;
        let mut hosts = inner
            .host_activity
            .hosts
            .lock()
            .expect("host activity lock");

        let entry = hosts.entry(host_id).or_insert(ActivityEntry {
            active_streams: 0,
            last_stream_end: Instant::now(),
            relock: false,
        });
        entry.active_streams += 1;

        drop(hosts);
        drop(inner);

        Ok(Self { app, host_id })
    }
}

impl Drop for StreamActivityGuard {
    fn drop(&mut self) {
        let Ok(inner) = self.app.access() else {
            return;
        };
        let mut hosts = inner
            .host_activity
            .hosts
            .lock()
            .expect("host activity lock");

        let mut relock = false;
        if let Some(entry) = hosts.get_mut(&self.host_id) {
            entry.active_streams = entry.active_streams.saturating_sub(1);
            entry.last_stream_end = Instant::now();
            relock = entry.active_streams == 0 && entry.relock;
        }
        drop(hosts);
        drop(inner);

        if relock && let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(relock_host(self.app.clone(), self.host_id));
        }
    }
}

/// Locks the pc again after a stream it was unlocked for, unless a new stream started
async fn relock_host(app_ref: AppRef, host_id: HostId) {
    sleep(RELOCK_DELAY).await;

    let Ok(app) = app_ref.access() else {
        return;
    };
    {
        let mut hosts = app.host_activity.hosts.lock().expect("host activity lock");
        match hosts.get_mut(&host_id) {
            Some(entry) if entry.active_streams == 0 && entry.relock => entry.relock = false,
            _ => return,
        }
    }

    let config = &app.config.moonlight;
    let token = config.power_agent_token.as_deref().unwrap_or_default();
    let host = match app.storage.get_host(host_id).await {
        Ok(host) => host,
        Err(err) => {
            warn!("relock: failed to get host {host_id:?}: {err}");
            return;
        }
    };

    match send_power_command(
        &host.address,
        config.power_agent_port,
        token,
        PowerCommand::Lock,
    )
    .await
    {
        Ok(()) => info!("locked host {host_id:?} again after the stream"),
        Err(err) => warn!("failed to lock host {host_id:?} after the stream: {err}"),
    }
}

/// Ports the magic packet is sent to: the usual Wake-on-LAN ports and the Sunshine ports (like Moonlight does)
const WAKE_PORTS: [u16; 7] = [9, 7, 47998, 47999, 48000, 48002, 48010];

/// Sends Wake-on-LAN magic packets more reliably than a single 255.255.255.255 broadcast:
/// - out of the network card that is used to reach the host (Windows sends 255.255.255.255
///   only out of one card, which is often the wrong one with Wi-Fi + cable or Tailscale)
/// - to the limited broadcast, the subnet broadcast and the host address itself
/// - a few times, in case a packet is lost
pub async fn send_magic_packet(mac: MacAddress, host_address: &str) -> Result<(), AppError> {
    if mac == MacAddress::NULL {
        return Err(AppError::HostNotFound);
    }

    let mut packet = [0xFFu8; 6 * 17];
    for i in 1..17 {
        packet[(i * 6)..((i + 1) * 6)].copy_from_slice(&mac.to_bytes());
    }

    // Resolve the host (it might be a name) and find the local address used to reach it
    let host_ip = lookup_host((host_address, 9))
        .await
        .ok()
        .and_then(|mut addresses| addresses.find(|address| address.is_ipv4()))
        .map(|address| address.ip());

    let mut local_ip = None;
    if let Some(host_ip) = host_ip {
        let probe = UdpSocket::bind("0.0.0.0:0").await?;
        if probe.connect((host_ip, 9)).await.is_ok() {
            local_ip = probe.local_addr().ok().map(|address| address.ip());
        }
    }

    let mut targets: Vec<IpAddr> = vec![IpAddr::V4(Ipv4Addr::BROADCAST)];
    if let Some(IpAddr::V4(ip)) = host_ip {
        let [a, b, c, _] = ip.octets();
        // Most home networks are /24; x.x.255.255 covers /16 networks
        targets.push(IpAddr::V4(Ipv4Addr::new(a, b, c, 255)));
        targets.push(IpAddr::V4(Ipv4Addr::new(a, b, 255, 255)));
        targets.push(IpAddr::V4(ip));
    }

    // One socket bound to the right card, and one unbound socket as a fallback
    let mut sockets = Vec::new();
    if let Some(local_ip) = local_ip
        && let Ok(socket) = UdpSocket::bind(SocketAddr::new(local_ip, 0)).await
    {
        sockets.push(socket);
    }
    sockets.push(UdpSocket::bind("0.0.0.0:0").await?);

    let mut sent_any = false;
    for _ in 0..3 {
        for socket in &sockets {
            let _ = socket.set_broadcast(true);
            for target in &targets {
                for port in WAKE_PORTS {
                    if socket
                        .send_to(&packet, SocketAddr::new(*target, port))
                        .await
                        .is_ok()
                    {
                        sent_any = true;
                    }
                }
            }
        }
        sleep(Duration::from_millis(100)).await;
    }

    info!("sent Wake-on-LAN to {mac} via {local_ip:?} (host {host_ip:?}), success: {sent_any}");

    if sent_any {
        Ok(())
    } else {
        Err(std::io::Error::other("failed to send any Wake-on-LAN packet").into())
    }
}

#[derive(Clone, Copy)]
pub enum PowerCommand {
    /// Shut down after a few seconds
    Shutdown,
    /// Shut down with a warning on the pc, so somebody sitting there can cancel it
    AutoShutdown,
    /// Sleep: wakes up in a few seconds
    Sleep,
    /// Show the lock screen
    Lock,
}

impl PowerCommand {
    fn path(self) -> &'static str {
        match self {
            Self::Shutdown => "/shutdown",
            Self::AutoShutdown => "/auto-shutdown",
            Self::Sleep => "/sleep",
            Self::Lock => "/lock",
        }
    }
}

/// Sends a command to the Starlight power agent running on the host pc.
pub async fn send_power_command(
    host_address: &str,
    port: u16,
    token: &str,
    command: PowerCommand,
) -> Result<(), AppError> {
    agent_request(host_address, port, token, "POST", command.path())
        .await
        .map(|_| ())
}

/// Sends a request to the Starlight power agent running on the host pc and returns the body.
pub async fn agent_request(
    host_address: &str,
    port: u16,
    token: &str,
    method: &str,
    path: &str,
) -> Result<String, AppError> {
    let address = if host_address.contains(':') && !host_address.starts_with('[') {
        format!("[{host_address}]:{port}")
    } else {
        format!("{host_address}:{port}")
    };

    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );

    let response = timeout(Duration::from_secs(5), async {
        let mut stream = TcpStream::connect(&address).await?;
        stream.write_all(request.as_bytes()).await?;

        let mut response = Vec::new();
        stream.read_to_end(&mut response).await?;

        Ok::<_, std::io::Error>(response)
    })
    .await
    .map_err(|_| std::io::Error::from(std::io::ErrorKind::TimedOut))??;

    let response = String::from_utf8_lossy(&response);
    let status_ok = response
        .lines()
        .next()
        .is_some_and(|line| line.split_whitespace().nth(1) == Some("200"));

    if status_ok {
        let body = response
            .split_once("\r\n\r\n")
            .map(|(_, body)| body.to_string())
            .unwrap_or_default();
        Ok(body)
    } else {
        Err(AppError::Forbidden)
    }
}

/// Runs every minute: shuts down hosts nobody streamed to for `auto_shutdown_minutes`
/// and removes expired guest users.
pub(super) fn spawn_background_tasks(app_ref: AppRef) {
    spawn(async move {
        loop {
            sleep(Duration::from_secs(60)).await;

            let Ok(app) = app_ref.access() else {
                return;
            };

            if let Err(err) = remove_expired_guests(&app).await {
                warn!("failed to remove expired guests: {err}");
            }

            let config = &app.config.moonlight;
            let (Some(token), Some(minutes)) = (
                config.power_agent_token.as_ref(),
                config.auto_shutdown_minutes.filter(|minutes| *minutes > 0),
            ) else {
                continue;
            };
            let idle_limit = Duration::from_secs(minutes as u64 * 60);

            // Hosts are only tracked after a stream was started, so a pc that is used
            // without Starlight Streams is never turned off.
            let due_hosts = {
                let mut hosts = app.host_activity.hosts.lock().expect("host activity lock");

                let due_hosts = hosts
                    .iter()
                    .filter(|(_, entry)| {
                        entry.active_streams == 0 && entry.last_stream_end.elapsed() >= idle_limit
                    })
                    .map(|(host_id, _)| *host_id)
                    .collect::<Vec<_>>();

                for host_id in &due_hosts {
                    hosts.remove(host_id);
                }

                due_hosts
            };

            for host_id in due_hosts {
                let host = match app.storage.get_host(host_id).await {
                    Ok(host) => host,
                    Err(err) => {
                        warn!("auto shutdown: failed to get host {host_id:?}: {err}");
                        continue;
                    }
                };

                let command = match config.auto_shutdown_action {
                    AutoShutdownAction::Shutdown => PowerCommand::AutoShutdown,
                    AutoShutdownAction::Sleep => PowerCommand::Sleep,
                };
                match send_power_command(&host.address, config.power_agent_port, token, command)
                    .await
                {
                    Ok(()) => info!("auto shutdown: sent shutdown to host {host_id:?}"),
                    Err(err) => warn!("auto shutdown: failed to shut down host {host_id:?}: {err}"),
                }
            }
        }
    });
}
