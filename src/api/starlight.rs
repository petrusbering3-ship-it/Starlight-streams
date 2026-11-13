//! Starlight Streams: pc discovery, version / one click update and the speed test for auto quality.

use std::sync::LazyLock;

use actix_web::{
    HttpResponse, get, post,
    web::{Data, Json, Query},
};
use serde::Deserialize;

use crate::{
    api::bindings::{
        DiscoveredHost, GetDiscoverHostsResponse, GetStarlightInfoResponse,
        PostStarlightUpdateResponse,
    },
    app::{
        App, AppError,
        user::{Admin, AuthenticatedUser},
    },
};

/// Set by the release build (see .github/workflows/windows-installer.yml)
pub const STARLIGHT_VERSION: &str = match option_env!("STARLIGHT_VERSION") {
    Some(version) => version,
    None => "dev",
};

#[get("/hosts/discover")]
pub async fn discover_hosts(
    app: Data<App>,
    mut user: AuthenticatedUser,
) -> Result<Json<GetDiscoverHostsResponse>, AppError> {
    let hosts = user
        .discover_hosts(app.config().moonlight.default_http_port)
        .await?;

    Ok(Json(GetDiscoverHostsResponse {
        hosts: hosts
            .into_iter()
            .map(|host| DiscoveredHost {
                name: host.name,
                address: host.address,
                http_port: host.http_port,
                already_added: host.already_added,
            })
            .collect(),
    }))
}

/// The installed update script: update.ps1 from the Windows installer, update-pi.sh from the
/// Raspberry Pi installer
fn update_script() -> Option<std::path::PathBuf> {
    let name = if cfg!(windows) {
        "update.ps1"
    } else {
        "update-pi.sh"
    };
    let script = std::env::current_exe().ok()?.parent()?.join(name);
    script.exists().then_some(script)
}

/// Writes the running version next to the program (the auto update compares it with the
/// latest release) and makes sure the nightly auto update is set up
pub fn on_startup() {
    let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
    else {
        return;
    };
    if STARLIGHT_VERSION != "dev" {
        let _ = std::fs::write(dir.join("version.txt"), STARLIGHT_VERSION);
    }

    // Installs from before auto updates existed get the nightly update task here
    if cfg!(windows)
        && let Some(script) = update_script()
    {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .arg("-RegisterAutoUpdate")
            .spawn();
    }
}

#[get("/starlight/info")]
pub async fn starlight_info(_user: AuthenticatedUser) -> Json<GetStarlightInfoResponse> {
    Json(GetStarlightInfoResponse {
        version: STARLIGHT_VERSION.to_string(),
        can_update: update_script().is_some(),
    })
}

/// Runs the update script outside of this server (it stops this server, replaces it with the
/// latest release and starts it again)
#[post("/starlight/update")]
pub async fn starlight_update(
    _admin: Admin,
) -> Result<Json<PostStarlightUpdateResponse>, AppError> {
    let Some(script) = update_script() else {
        return Ok(Json(PostStarlightUpdateResponse { started: false }));
    };

    if !cfg!(windows) {
        // Its own systemd unit, so stopping the server's service doesn't stop the update
        let started = tokio::process::Command::new("systemd-run")
            .args(["--unit", "starlight-streams-update", "--collect"])
            .arg(&script)
            .status()
            .await?
            .success();
        return Ok(Json(PostStarlightUpdateResponse { started }));
    }

    const TASK: &str = "Starlight Streams Update";
    let run = format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\" -Silent",
        script.display()
    );

    let created = tokio::process::Command::new("schtasks")
        .args([
            "/create", "/tn", TASK, "/tr", &run, "/sc", "once", "/st", "00:00", "/ru", "SYSTEM",
            "/rl", "HIGHEST", "/f",
        ])
        .status()
        .await?;
    let started = created.success()
        && tokio::process::Command::new("schtasks")
            .args(["/run", "/tn", TASK])
            .status()
            .await?
            .success();

    Ok(Json(PostStarlightUpdateResponse { started }))
}

#[derive(Deserialize)]
pub struct SpeedTestQuery {
    bytes: usize,
}

/// Incompressible test data, so proxies can't make the connection look faster than it is
static SPEED_TEST_DATA: LazyLock<Vec<u8>> = LazyLock::new(|| {
    let mut state: u32 = 0x9E37_79B9;
    (0..1024 * 1024)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state as u8
        })
        .collect()
});

const MAX_SPEED_TEST_BYTES: usize = 32 * 1024 * 1024;

#[get("/starlight/speedtest")]
pub async fn speed_test(
    _user: AuthenticatedUser,
    Query(query): Query<SpeedTestQuery>,
) -> HttpResponse {
    let size = query.bytes.min(MAX_SPEED_TEST_BYTES);

    let mut body = Vec::with_capacity(size);
    while body.len() < size {
        let take = (size - body.len()).min(SPEED_TEST_DATA.len());
        body.extend_from_slice(&SPEED_TEST_DATA[..take]);
    }

    HttpResponse::Ok()
        .content_type("application/octet-stream")
        .insert_header(("Cache-Control", "no-store"))
        .body(body)
}
