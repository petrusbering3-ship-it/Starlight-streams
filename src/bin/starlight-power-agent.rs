//! Starlight Streams power agent.
//!
//! Runs on the gaming pc: shuts it down or puts it to sleep when the Starlight Streams server
//! asks for it, and tells the server which displays the pc has.
//!
//! Usage:
//!   starlight-power-agent --token MY_SECRET [--port 47900] [--displays-file PATH]
//!   starlight-power-agent --write-displays PATH
//!
//! The agent runs as a service (session 0), where the user's displays can't be seen.
//! So a second copy runs with --write-displays in the logged in user's session and
//! writes the display list to a file that the agent serves.

// No console window, also not for the copy started when a user logs in
#![windows_subsystem = "windows"]

use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::Command,
    thread,
    time::Duration,
};

use serde::Serialize;

const DEFAULT_PORT: u16 = 47900;
const DISPLAYS_UPDATE_INTERVAL: Duration = Duration::from_secs(15);

fn default_displays_file() -> PathBuf {
    let program_data = std::env::var_os("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into());
    PathBuf::from(program_data)
        .join("Starlight")
        .join("displays.json")
}

fn usage() -> ! {
    eprintln!(
        "Usage: starlight-power-agent --token MY_SECRET [--port 47900] [--displays-file PATH]\n       starlight-power-agent --write-displays PATH"
    );
    std::process::exit(1);
}

fn main() {
    let mut token = None;
    let mut port = DEFAULT_PORT;
    let mut displays_file = default_displays_file();
    let mut write_displays = None;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--token" => token = args.next(),
            "--port" => {
                port = args
                    .next()
                    .and_then(|port| port.parse().ok())
                    .unwrap_or_else(|| usage())
            }
            "--displays-file" => displays_file = args.next().unwrap_or_else(|| usage()).into(),
            "--write-displays" => {
                write_displays = Some(PathBuf::from(args.next().unwrap_or_else(|| usage())))
            }
            _ => usage(),
        }
    }

    if let Some(path) = write_displays {
        write_displays_forever(&path);
    }

    let Some(token) = token.filter(|token| !token.is_empty()) else {
        usage();
    };

    let listener = TcpListener::bind(("0.0.0.0", port)).expect("failed to bind port");
    println!("Starlight power agent listening on port {port}");

    for stream in listener.incoming().flatten() {
        if let Err(err) = handle(stream, &token, &displays_file) {
            eprintln!("Request failed: {err}");
        }
    }
}

fn handle(mut stream: TcpStream, token: &str, displays_file: &PathBuf) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;

    let mut reader = BufReader::new(stream.try_clone()?);

    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    let mut authorization = String::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 || line.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':')
            && name.trim().eq_ignore_ascii_case("authorization")
        {
            authorization = value.trim().to_string();
        }
    }

    let mut parts = request_line.split_whitespace();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));

    if method == "GET" && path == "/" {
        return respond(&mut stream, "200 OK", "Starlight power agent is running");
    }

    let authorized = constant_time_eq(
        authorization.as_bytes(),
        format!("Bearer {token}").as_bytes(),
    );

    match (method, path) {
        ("GET", "/displays") | ("POST", "/shutdown" | "/auto-shutdown" | "/sleep")
            if !authorized =>
        {
            respond(&mut stream, "401 Unauthorized", "")
        }
        ("GET", "/displays") => {
            // Written by the copy running in the user's session; empty if nobody is logged in
            let displays = std::fs::read_to_string(displays_file).unwrap_or_else(|_| "[]".into());
            respond(&mut stream, "200 OK", &displays)
        }
        ("POST", "/sleep") => {
            respond(&mut stream, "200 OK", "going to sleep")?;
            println!("Sleep requested");
            thread::sleep(Duration::from_secs(1));
            sleep_pc();
            Ok(())
        }
        ("POST", "/shutdown" | "/auto-shutdown") => {
            respond(&mut stream, "200 OK", "shutting down")?;
            println!("Shutdown requested, turning off the pc...");
            thread::sleep(Duration::from_secs(1));
            // auto-shutdown shows a warning first, so somebody sitting at the pc can cancel it
            shutdown(path == "/auto-shutdown");
            Ok(())
        }
        _ => respond(&mut stream, "404 Not Found", ""),
    }
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn shutdown(warning: bool) {
    #[cfg(windows)]
    let result = if warning {
        Command::new("shutdown")
            .args([
                "/s",
                "/t",
                "120",
                "/c",
                "Starlight Streams: nobody is streaming, the pc turns off in 2 minutes. Run 'shutdown /a' to cancel.",
            ])
            .status()
    } else {
        Command::new("shutdown").args(["/s", "/t", "5"]).status()
    };
    #[cfg(target_os = "macos")]
    let result = Command::new("shutdown")
        .args(["-h", if warning { "+2" } else { "+1" }])
        .status();
    #[cfg(not(any(windows, target_os = "macos")))]
    let result = if warning {
        Command::new("shutdown").args(["-P", "+2"]).status()
    } else {
        Command::new("systemctl").arg("poweroff").status()
    };

    if let Err(err) = result {
        eprintln!("Failed to shut down: {err}");
    }
}

// -- Sleep

#[cfg(windows)]
fn sleep_pc() {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE, LUID},
        Security::{
            AdjustTokenPrivileges, LUID_AND_ATTRIBUTES, LookupPrivilegeValueW,
            SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
        },
        System::{
            Power::SetSuspendState,
            Threading::{GetCurrentProcess, OpenProcessToken},
        },
    };

    // Going to sleep needs the shutdown privilege enabled in our token
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        ) != 0
        {
            let name: Vec<u16> = "SeShutdownPrivilege\0".encode_utf16().collect();
            let mut luid = LUID::default();
            if LookupPrivilegeValueW(std::ptr::null(), name.as_ptr(), &mut luid) != 0 {
                let privileges = TOKEN_PRIVILEGES {
                    PrivilegeCount: 1,
                    Privileges: [LUID_AND_ATTRIBUTES {
                        Luid: luid,
                        Attributes: SE_PRIVILEGE_ENABLED,
                    }],
                };
                AdjustTokenPrivileges(
                    token,
                    0,
                    &privileges,
                    0,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
            }
            CloseHandle(token);
        }

        // Sleep (not hibernate), so the pc wakes up in a few seconds
        if !SetSuspendState(false, false, false) {
            eprintln!("Failed to go to sleep");
        }
    }
}

#[cfg(not(windows))]
fn sleep_pc() {
    if let Err(err) = Command::new("systemctl").arg("suspend").status() {
        eprintln!("Failed to go to sleep: {err}");
    }
}

// -- Displays

#[derive(Serialize)]
struct Display {
    /// 1 based, in the order Sunshine switches with Ctrl+Alt+Shift+F1, F2, ...
    index: u32,
    name: String,
    width: u32,
    height: u32,
    refresh_rate: u32,
    primary: bool,
}

fn write_displays_forever(path: &PathBuf) -> ! {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut last = String::new();
    loop {
        let json = serde_json::to_string(&list_displays()).unwrap_or_else(|_| "[]".into());
        if json != last && std::fs::write(path, &json).is_ok() {
            last = json;
        }
        thread::sleep(DISPLAYS_UPDATE_INTERVAL);
    }
}

#[cfg(windows)]
fn wide_to_string(wide: &[u16]) -> String {
    let len = wide.iter().position(|c| *c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..len])
}

/// Monitor names ("DELL U2723QE") by gdi device name ("\\.\DISPLAY1")
#[cfg(windows)]
fn monitor_names() -> std::collections::HashMap<String, String> {
    use windows_sys::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
        DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
        DISPLAYCONFIG_TARGET_DEVICE_NAME, DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes,
        QDC_ONLY_ACTIVE_PATHS, QueryDisplayConfig,
    };

    let mut names = std::collections::HashMap::new();

    unsafe {
        let (mut path_count, mut mode_count) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count) != 0
        {
            return names;
        }

        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            std::ptr::null_mut(),
        ) != 0
        {
            return names;
        }

        for path in &paths[..path_count as usize] {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
            source.header.size = size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
            source.header.adapterId = path.sourceInfo.adapterId;
            source.header.id = path.sourceInfo.id;

            let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
            target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
            target.header.size = size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
            target.header.adapterId = path.targetInfo.adapterId;
            target.header.id = path.targetInfo.id;

            if DisplayConfigGetDeviceInfo(&mut source.header) == 0
                && DisplayConfigGetDeviceInfo(&mut target.header) == 0
            {
                let name = wide_to_string(&target.monitorFriendlyDeviceName);
                if !name.is_empty() {
                    names.insert(wide_to_string(&source.viewGdiDeviceName), name);
                }
            }
        }
    }

    names
}

#[cfg(windows)]
fn list_displays() -> Vec<Display> {
    use windows_sys::Win32::Graphics::Gdi::{
        DEVMODEW, DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, DISPLAY_DEVICE_PRIMARY_DEVICE,
        DISPLAY_DEVICEW, ENUM_CURRENT_SETTINGS, EnumDisplayDevicesW, EnumDisplaySettingsW,
    };

    let names = monitor_names();
    let mut displays = Vec::new();

    // Same order as Sunshine: adapters and their outputs that are part of the desktop
    let mut device_index = 0;
    loop {
        let mut device = DISPLAY_DEVICEW {
            cb: size_of::<DISPLAY_DEVICEW>() as u32,
            ..Default::default()
        };
        if unsafe { EnumDisplayDevicesW(std::ptr::null(), device_index, &mut device, 0) } == 0 {
            break;
        }
        device_index += 1;

        if device.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP == 0 {
            continue;
        }

        let mut mode: DEVMODEW = unsafe { std::mem::zeroed() };
        mode.dmSize = size_of::<DEVMODEW>() as u16;
        if unsafe {
            EnumDisplaySettingsW(device.DeviceName.as_ptr(), ENUM_CURRENT_SETTINGS, &mut mode)
        } == 0
        {
            continue;
        }

        let gdi_name = wide_to_string(&device.DeviceName);
        let name = names
            .get(&gdi_name)
            .cloned()
            .unwrap_or_else(|| wide_to_string(&device.DeviceString));

        displays.push(Display {
            index: displays.len() as u32 + 1,
            name,
            width: mode.dmPelsWidth,
            height: mode.dmPelsHeight,
            refresh_rate: mode.dmDisplayFrequency,
            primary: device.StateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE != 0,
        });
    }

    displays
}

#[cfg(not(windows))]
fn list_displays() -> Vec<Display> {
    Vec::new()
}
