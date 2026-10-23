//! Starlight Streams power agent.
//!
//! Runs on the gaming pc and shuts it down when the Starlight Streams server asks for it.
//! Usage: starlight-power-agent --token MY_SECRET [--port 47900]

use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    process::Command,
    thread,
    time::Duration,
};

const DEFAULT_PORT: u16 = 47900;

fn main() {
    let mut token = None;
    let mut port = DEFAULT_PORT;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--token" => token = args.next(),
            "--port" => {
                port = args
                    .next()
                    .and_then(|port| port.parse().ok())
                    .expect("--port needs a number")
            }
            _ => {
                eprintln!("Usage: starlight-power-agent --token MY_SECRET [--port 47900]");
                std::process::exit(1);
            }
        }
    }

    let Some(token) = token.filter(|token| !token.is_empty()) else {
        eprintln!("Missing --token");
        std::process::exit(1);
    };

    let listener = TcpListener::bind(("0.0.0.0", port)).expect("failed to bind port");
    println!("Starlight power agent listening on port {port}");

    for stream in listener.incoming().flatten() {
        if let Err(err) = handle(stream, &token) {
            eprintln!("Request failed: {err}");
        }
    }
}

fn handle(mut stream: TcpStream, token: &str) -> std::io::Result<()> {
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

    if method == "GET" {
        return respond(&mut stream, "200 OK", "Starlight power agent is running");
    }
    if method != "POST" || path != "/shutdown" {
        return respond(&mut stream, "404 Not Found", "");
    }
    if !constant_time_eq(
        authorization.as_bytes(),
        format!("Bearer {token}").as_bytes(),
    ) {
        return respond(&mut stream, "401 Unauthorized", "");
    }

    respond(&mut stream, "200 OK", "shutting down")?;
    println!("Shutdown requested, turning off the pc...");
    thread::sleep(Duration::from_secs(1));
    shutdown();

    Ok(())
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

fn shutdown() {
    #[cfg(windows)]
    let result = Command::new("shutdown").args(["/s", "/t", "5"]).status();
    #[cfg(target_os = "macos")]
    let result = Command::new("shutdown").args(["-h", "+1"]).status();
    #[cfg(not(any(windows, target_os = "macos")))]
    let result = Command::new("systemctl").arg("poweroff").status();

    if let Err(err) = result {
        eprintln!("Failed to shut down: {err}");
    }
}
