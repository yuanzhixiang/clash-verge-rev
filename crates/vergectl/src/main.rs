use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{Read as _, Write as _},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const RELEASE_PORT: u16 = 33331;
const DEV_PORT: u16 = 11233;
const SKILL_MD: &str = include_str!("../../../skills/clash-verge-vergectl/SKILL.md");
const SKILL_OPENAI_YAML: &str = include_str!("../../../skills/clash-verge-vergectl/agents/openai.yaml");

type CliResult<T> = Result<T, CliError>;

#[derive(Debug)]
struct CliError {
    code: i32,
    message: String,
}

#[derive(Deserialize)]
struct ApiResponse {
    ok: bool,
    data: Option<Value>,
    error: Option<String>,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{}", err.message);
        std::process::exit(err.code);
    }
}

fn run() -> CliResult<()> {
    let mut args = env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() || take_flag(&mut args, "--help") || take_flag(&mut args, "-h") {
        print_usage();
        return Ok(());
    }
    if take_flag(&mut args, "--version") || take_flag(&mut args, "-V") {
        println!("vergectl {VERSION}");
        return Ok(());
    }

    match args.first().map(String::as_str) {
        Some("status") => {
            let json_out = take_flag(&mut args, "--json");
            print(call(json!({ "cmd": "status" }))?, json_out)
        }
        Some("paths") => print(call(json!({ "cmd": "paths" }))?, true),
        Some("config") => {
            let mut sub_args = args[1..].to_vec();
            config(&mut sub_args)
        }
        Some("logs") => {
            let mut sub_args = args[1..].to_vec();
            logs(&mut sub_args)
        }
        Some("core") => core(&mut args[1..].to_vec()),
        Some("backup") => backup(&mut args[1..].to_vec()),
        Some("skill") => skill(&args[1..]),
        Some(other) => Err(err(3, format!("unknown command: {other}"))),
        None => Err(err(3, "missing command")),
    }
}

fn config(args: &mut Vec<String>) -> CliResult<()> {
    match args.first().map(String::as_str) {
        Some("get") => {
            let target = args.get(1).ok_or_else(|| err(3, "missing config target"))?.clone();
            let format = take_option(args, "--format").unwrap_or_else(|| "json".to_string());
            let json_out = take_flag(args, "--json");
            print(
                call(json!({
                    "cmd": "config_get",
                    "target": target,
                    "format": format.clone(),
                }))?,
                json_out || format == "json",
            )
        }
        Some("patch") => {
            let target = args.get(1).ok_or_else(|| err(3, "missing config target"))?.clone();
            let patch = if let Some(raw) = take_option(args, "--json") {
                serde_json::from_str(&raw).map_err(|e| err(3, format!("invalid JSON patch: {e}")))?
            } else if let Some(path) = take_option(args, "--file") {
                read_patch_file(&path)?
            } else {
                return Err(err(3, "use --json or --file for config patch"));
            };
            print(
                call(json!({
                    "cmd": "config_patch",
                    "target": target,
                    "patch": patch,
                }))?,
                false,
            )
        }
        _ => Err(err(3, "usage: vergectl config get|patch ...")),
    }
}

fn logs(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    let command = args.first().cloned();
    match command.as_deref() {
        Some("path") => print(call(json!({ "cmd": "logs_path" }))?, true),
        Some(target @ ("app" | "core")) => {
            let lines = take_option(args, "--lines")
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(200);
            let data = call(json!({
                "cmd": "logs",
                "target": target,
                "lines": lines,
            }))?;
            if json_out {
                print(data, true)
            } else if let Some(lines) = data.get("lines").and_then(Value::as_array) {
                for line in lines.iter().filter_map(Value::as_str) {
                    println!("{line}");
                }
                Ok(())
            } else {
                print(data, false)
            }
        }
        _ => Err(err(3, "usage: vergectl logs app|core|path")),
    }
}

fn core(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    let action = args.first().ok_or_else(|| err(3, "missing core action"))?;
    match action.as_str() {
        "mode" | "start" | "stop" | "restart" => print(
            call(json!({
                "cmd": "core",
                "action": action,
            }))?,
            json_out,
        ),
        _ => Err(err(3, "usage: vergectl core mode|start|stop|restart")),
    }
}

fn backup(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("create") => print(call(json!({ "cmd": "backup_create" }))?, json_out),
        _ => Err(err(3, "usage: vergectl backup create")),
    }
}

fn skill(args: &[String]) -> CliResult<()> {
    match args.first().map(String::as_str) {
        Some("install") => {
            let path = install_skill()?;
            println!("installed clash-verge-vergectl skill at {}", path.display());
            Ok(())
        }
        _ => Err(err(3, "usage: vergectl skill install")),
    }
}

fn call(payload: Value) -> CliResult<Value> {
    let mut last_error = None;
    for port in ports() {
        match post(port, &payload) {
            Ok(response) if response.ok => return Ok(response.data.unwrap_or(Value::Null)),
            Ok(response) => {
                return Err(err(
                    4,
                    response
                        .error
                        .unwrap_or_else(|| "Clash Verge returned an error".to_string()),
                ));
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(err(
        2,
        format!(
            "unable to reach Clash Verge; start the app first{}",
            last_error.map_or_else(String::new, |e| format!(" ({e})"))
        ),
    ))
}

fn post(port: u16, payload: &Value) -> Result<ApiResponse, String> {
    let body = payload.to_string();
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;

    let request = format!(
        "POST /commands/cli HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("failed to write request: {e}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|e| format!("failed to read response: {e}"))?;
    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "invalid HTTP response".to_string())?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(head.lines().next().unwrap_or("HTTP error").to_string());
    }
    serde_json::from_str(body).map_err(|e| format!("invalid response JSON: {e}"))
}

fn ports() -> Vec<u16> {
    env::var("VERGECTL_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .map_or_else(|| vec![RELEASE_PORT, DEV_PORT], |port| vec![port])
}

fn read_patch_file(path: &str) -> CliResult<Value> {
    let content = fs::read_to_string(path).map_err(|e| err(3, format!("failed to read {path}: {e}")))?;
    serde_json::from_str(&content)
        .or_else(|json_err| {
            let yaml_value = serde_yaml_ng::from_str::<serde_yaml_ng::Value>(&content)
                .map_err(|yaml_err| format!("invalid JSON ({json_err}); invalid YAML ({yaml_err})"))?;
            serde_json::to_value(yaml_value).map_err(|yaml_err| yaml_err.to_string())
        })
        .map_err(|e| err(3, format!("invalid patch file: {e}")))
}

fn print(data: Value, json_out: bool) -> CliResult<()> {
    if json_out {
        println!(
            "{}",
            serde_json::to_string_pretty(&data).map_err(|e| err(4, format!("failed to render JSON: {e}")))?
        );
        return Ok(());
    }

    match data {
        Value::Null => println!("ok"),
        Value::String(value) => print!("{value}"),
        Value::Object(map) => {
            if map.len() == 1
                && let Some(Value::String(content)) = map.get("content")
            {
                print!("{content}");
            } else {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&Value::Object(map))
                        .map_err(|e| err(4, format!("failed to render output: {e}")))?
                );
            }
        }
        other => println!(
            "{}",
            serde_json::to_string_pretty(&other).map_err(|e| err(4, format!("failed to render output: {e}")))?
        ),
    }
    Ok(())
}

fn install_skill() -> CliResult<PathBuf> {
    let skill_dir = codex_home().join("skills").join("clash-verge-vergectl");
    write_if_changed(&skill_dir.join("SKILL.md"), SKILL_MD)?;
    write_if_changed(&skill_dir.join("agents").join("openai.yaml"), SKILL_OPENAI_YAML)?;
    Ok(skill_dir)
}

fn write_if_changed(path: &Path, content: &str) -> CliResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| err(4, format!("failed to create {}: {e}", parent.display())))?;
    }
    if fs::read_to_string(path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    fs::write(path, content).map_err(|e| err(4, format!("failed to write {}: {e}", path.display())))
}

fn codex_home() -> PathBuf {
    env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|home| home.join(".codex")))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn take_flag(args: &mut Vec<String>, flag: &str) -> bool {
    if let Some(index) = args.iter().position(|arg| arg == flag) {
        args.remove(index);
        true
    } else {
        false
    }
}

fn take_option(args: &mut Vec<String>, name: &str) -> Option<String> {
    let index = args.iter().position(|arg| arg == name)?;
    args.remove(index);
    if index < args.len() {
        Some(args.remove(index))
    } else {
        None
    }
}

fn err(code: i32, message: impl Into<String>) -> CliError {
    CliError {
        code,
        message: message.into(),
    }
}

fn print_usage() {
    println!(
        r#"vergectl {VERSION}

Usage:
  vergectl status [--json]
  vergectl paths --json
  vergectl config get verge|clash|runtime [--format json|yaml] [--json]
  vergectl config patch verge|clash --json '{{"key":value}}'
  vergectl config patch verge|clash --file patch.json|patch.yaml
  vergectl logs app|core [--lines 200] [--json]
  vergectl logs path --json
  vergectl core mode|start|stop|restart [--json]
  vergectl backup create [--json]
  vergectl skill install

Environment:
  VERGECTL_PORT  Override the local Clash Verge CLI port.
"#
    );
}
