//! Starlight Streams: shutting down hosts via the power agent and shutting them down
//! automatically when nobody streamed for a while.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    spawn,
    time::{sleep, timeout},
};
use tracing::{info, warn};

use crate::app::{AppError, AppRef, guest::remove_expired_guests, host::HostId};

#[derive(Default)]
pub(super) struct HostActivity {
    hosts: Mutex<HashMap<HostId, ActivityEntry>>,
}

struct ActivityEntry {
    active_streams: u32,
    last_stream_end: Instant,
}

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

        if let Some(entry) = hosts.get_mut(&self.host_id) {
            entry.active_streams = entry.active_streams.saturating_sub(1);
            entry.last_stream_end = Instant::now();
        }
    }
}

#[derive(Clone, Copy)]
pub enum PowerCommand {
    /// Shut down after a few seconds
    Shutdown,
    /// Shut down with a warning on the pc, so somebody sitting there can cancel it
    AutoShutdown,
}

impl PowerCommand {
    fn path(self) -> &'static str {
        match self {
            Self::Shutdown => "/shutdown",
            Self::AutoShutdown => "/auto-shutdown",
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
    let address = if host_address.contains(':') && !host_address.starts_with('[') {
        format!("[{host_address}]:{port}")
    } else {
        format!("{host_address}:{port}")
    };

    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        command.path()
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
        Ok(())
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

                match send_power_command(
                    &host.address,
                    config.power_agent_port,
                    token,
                    PowerCommand::AutoShutdown,
                )
                .await
                {
                    Ok(()) => info!("auto shutdown: sent shutdown to host {host_id:?}"),
                    Err(err) => warn!("auto shutdown: failed to shut down host {host_id:?}: {err}"),
                }
            }
        }
    });
}
