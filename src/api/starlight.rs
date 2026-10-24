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

/// The installed update script, only present when installed with the Windows installer
fn update_script() -> Option<std::path::PathBuf> {
    let script = std::env::current_exe().ok()?.parent()?.join("update.ps1");
    (cfg!(windows) && script.exists()).then_some(script)
}

#[get("/starlight/info")]
pub async fn starlight_info(_user: AuthenticatedUser) -> Json<GetStarlightInfoResponse> {
    Json(GetStarlightInfoResponse {
        version: STARLIGHT_VERSION.to_string(),
        can_update: update_script().is_some(),
    })
}

/// Runs update.ps1 as its own scheduled task: it stops this server, replaces it with the
/// latest release and starts it again
#[post("/starlight/update")]
pub async fn starlight_update(
    _admin: Admin,
) -> Result<Json<PostStarlightUpdateResponse>, AppError> {
    let Some(script) = update_script() else {
        return Ok(Json(PostStarlightUpdateResponse { started: false }));
    };

    const TASK: &str = "Starlight Streams Update";
    let run = format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\"",
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
