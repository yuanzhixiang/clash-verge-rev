use std::{
    io::{Read as _, Write as _},
    net::TcpStream,
    path::PathBuf,
    process::ExitCode,
    time::Duration,
};

use serde_json::{Value, json};

const APP_ID: &str = "io.github.clash-verge-rev.clash-verge-rev";
const DEFAULT_PORT: u16 = 33380;

const USAGE: &str = "\
vergectl - control a running Clash Verge

USAGE:
  vergectl status                         app, core, proxy and Surge bridge status
  vergectl service                        system service availability
  vergectl sysproxy on|off                toggle the system proxy
  vergectl tun on|off                     toggle TUN mode
  vergectl mode [rule|global|direct]      show or set the outbound mode
  vergectl profiles [list]                list subscriptions
  vergectl profiles use <uid|name|url>    activate a subscription
  vergectl profiles update <uid>          re-download a subscription
  vergectl profiles import <url>          import a subscription
  vergectl groups [list]                  proxy groups and their selection
  vergectl groups select <group> <proxy>  select a proxy in a group
  vergectl groups delay <group>           latency test a group
  vergectl surge [status]                 Surge bridge state and conversion report
  vergectl surge enable|disable           turn the Surge bridge on or off
  vergectl surge path <file>              use another Surge profile
  vergectl surge refresh                  reconvert and reload the Surge subscription
  vergectl surge import                   add the Surge profile as the active subscription
  vergectl config get verge|clash         dump app or core config
  vergectl config patch verge '<json>'    patch app config
  vergectl app exit                       quit Clash Verge
  vergectl api GET|POST <path> ['<json>'] raw call to /api/<path>

ENV:
  VERGECTL_PORT, VERGECTL_TOKEN override discovery from fork.json";

enum Failure {
    Usage(String),
    Unreachable(String),
    Api(String),
}

fn app_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    if cfg!(target_os = "macos") {
        return home.map(|home| home.join("Library/Application Support").join(APP_ID));
    }
    if cfg!(windows) {
        return std::env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join(APP_ID));
    }
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| home.map(|home| home.join(".local/share")))
        .map(|dir| dir.join(APP_ID))
}

fn token() -> Result<String, Failure> {
    if let Ok(token) = std::env::var("VERGECTL_TOKEN") {
        return Ok(token);
    }
    let path = app_dir()
        .map(|dir| dir.join("fork.json"))
        .ok_or_else(|| Failure::Unreachable("cannot locate the Clash Verge data directory".into()))?;
    let content = std::fs::read_to_string(&path)
        .map_err(|err| Failure::Unreachable(format!("cannot read {}: {err}; start Clash Verge first", path.display())))?;
    let settings: Value = serde_json::from_str(&content).map_err(|err| Failure::Unreachable(err.to_string()))?;
    settings
        .get("token")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| Failure::Unreachable(format!("no token in {}", path.display())))
}

fn port() -> u16 {
    std::env::var("VERGECTL_PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn decode_chunked(mut body: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(line_end) = body.windows(2).position(|window| window == b"\r\n") {
        let size = std::str::from_utf8(&body[..line_end])
            .ok()
            .and_then(|size| usize::from_str_radix(size.trim(), 16).ok())
            .unwrap_or(0);
        if size == 0 {
            break;
        }
        let start = line_end + 2;
        let end = (start + size).min(body.len());
        out.extend_from_slice(&body[start..end]);
        body = body.get(end + 2..).unwrap_or_default();
    }
    out
}

fn call(method: &str, path: &str, body: Option<&Value>) -> Result<Value, Failure> {
    let token = token()?;
    let port = port();
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|err| Failure::Unreachable(format!("cannot reach Clash Verge on 127.0.0.1:{port}: {err}")))?;
    // Profile updates and delay tests can legitimately take a while.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));

    let payload = body.map(Value::to_string).unwrap_or_default();
    let request = format!(
        "{method} /api/{path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nx-verge-token: {token}\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|err| Failure::Unreachable(err.to_string()))?;
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|err| Failure::Unreachable(err.to_string()))?;

    let split = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| Failure::Api("malformed response".into()))?;
    let head = String::from_utf8_lossy(&raw[..split]).to_ascii_lowercase();
    let mut body = raw[split + 4..].to_vec();
    if head.contains("transfer-encoding: chunked") {
        body = decode_chunked(&body);
    }
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);
    let value: Value =
        serde_json::from_slice(&body).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&body).into_owned()));
    if (200..300).contains(&status) {
        Ok(value)
    } else {
        let message = value
            .get("error")
            .and_then(Value::as_str)
            .map_or_else(|| value.to_string(), str::to_owned);
        Err(Failure::Api(format!("HTTP {status}: {message}")))
    }
}

fn parse_json(raw: &str) -> Result<Value, Failure> {
    serde_json::from_str(raw).map_err(|err| Failure::Usage(format!("invalid JSON: {err}")))
}

fn on_off(value: Option<&str>) -> Result<bool, Failure> {
    match value {
        Some("on" | "true" | "1") => Ok(true),
        Some("off" | "false" | "0") => Ok(false),
        _ => Err(Failure::Usage("expected on|off".into())),
    }
}

/// Keeps `groups list` readable; mihomo returns every member's full history.
fn summarize_groups(value: Value) -> Value {
    let Some(groups) = value.get("proxies").and_then(Value::as_array) else {
        return value;
    };
    Value::Array(
        groups
            .iter()
            .map(|group| {
                json!({
                    "name": group.get("name"),
                    "type": group.get("type"),
                    "now": group.get("now"),
                    "members": group.get("all").and_then(Value::as_array).map_or(0, Vec::len),
                })
            })
            .collect(),
    )
}

fn run(args: &[&str]) -> Result<Value, Failure> {
    match args {
        [] | ["help" | "-h" | "--help"] => Err(Failure::Usage(String::new())),
        ["status"] => call("GET", "status", None),
        ["service"] | ["service", "status"] => call("GET", "service", None),
        ["sysproxy", state] => call(
            "POST",
            "config/verge",
            Some(&json!({ "enable_system_proxy": on_off(Some(state))? })),
        ),
        ["tun", state] => call(
            "POST",
            "config/verge",
            Some(&json!({ "enable_tun_mode": on_off(Some(state))? })),
        ),
        ["mode"] => call("GET", "mode", None),
        ["mode", mode] => call("POST", "mode", Some(&json!({ "mode": mode }))),
        ["profiles"] | ["profiles", "list"] => call("GET", "profiles", None),
        ["profiles", "use", uid] => call("POST", "profiles/select", Some(&json!({ "uid": uid }))),
        ["profiles", "update", uid] => call("POST", "profiles/update", Some(&json!({ "uid": uid }))),
        ["profiles", "import", url] => call("POST", "profiles/import", Some(&json!({ "url": url }))),
        ["groups"] | ["groups", "list"] => call("GET", "groups", None).map(summarize_groups),
        ["groups", "select", group, proxy] => call(
            "POST",
            "groups/select",
            Some(&json!({ "group": group, "proxy": proxy })),
        ),
        ["groups", "delay", group] => call("POST", "groups/delay", Some(&json!({ "group": group }))),
        ["surge"] | ["surge", "status"] => call("GET", "surge", None),
        ["surge", "enable"] => call("POST", "surge", Some(&json!({ "enabled": true }))),
        ["surge", "disable"] => call("POST", "surge", Some(&json!({ "enabled": false }))),
        ["surge", "path", path] => call("POST", "surge", Some(&json!({ "path": path }))),
        ["surge", "refresh"] => call("POST", "surge/refresh", None),
        ["surge", "import"] => call("POST", "surge/import", None),
        ["config", "get", target @ ("verge" | "clash")] => call("GET", &format!("config/{target}"), None),
        ["config", "patch", "verge", patch] => call("POST", "config/verge", Some(&parse_json(patch)?)),
        ["app", "exit"] => call("POST", "app/exit", None),
        ["api", method, path] => call(&method.to_ascii_uppercase(), path.trim_start_matches('/'), None),
        ["api", method, path, body] => call(
            &method.to_ascii_uppercase(),
            path.trim_start_matches('/'),
            Some(&parse_json(body)?),
        ),
        _ => Err(Failure::Usage(format!("unknown command: {}", args.join(" ")))),
    }
}

fn main() -> ExitCode {
    let owned: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = owned.iter().map(String::as_str).collect();
    match run(&args) {
        Ok(value) => {
            println!("{}", serde_json::to_string_pretty(&value).unwrap_or_default());
            ExitCode::SUCCESS
        }
        Err(Failure::Usage(message)) => {
            if !message.is_empty() {
                eprintln!("{message}\n");
            }
            eprintln!("{USAGE}");
            ExitCode::from(3)
        }
        Err(Failure::Unreachable(message)) => {
            eprintln!("{message}");
            ExitCode::from(2)
        }
        Err(Failure::Api(message)) => {
            eprintln!("{message}");
            ExitCode::from(4)
        }
    }
}
