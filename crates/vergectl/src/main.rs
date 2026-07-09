use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{Read as _, Write as _},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const RELEASE_PORT: u16 = 33331;
const DEV_PORT: u16 = 11233;
const DEFAULT_DELAY_URL: &str = "http://cp.cloudflare.com/generate_204";
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

    let command = args.remove(0);
    match command.as_str() {
        "status" => {
            let json_out = take_flag(&mut args, "--json");
            print(call(json!({ "cmd": "status" }))?, json_out)
        }
        "paths" => print(call(json!({ "cmd": "paths" }))?, true),
        "config" => config(&mut args),
        "logs" => logs(&mut args),
        "core" => core(&mut args),
        "backup" => backup(&mut args),
        "skill" => skill(&args),
        "app" => app(&mut args),
        "system" => system(&mut args),
        "service" => service(&mut args),
        "clash" => clash(&mut args),
        "runtime" => runtime(&mut args),
        "profiles" => profiles(&mut args),
        "proxies" => proxies(&mut args),
        "connections" => connections(&mut args),
        "rules" => rules(&mut args),
        "unlock" => unlock(&mut args),
        "validate" => validate(&mut args),
        "watch" => watch(&mut args),
        other => Err(err(3, format!("unknown command: {other}"))),
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
            let patch = read_value_arg(args, "--json", "--file")?
                .ok_or_else(|| err(3, "use --json or --file for config patch"))?;
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
            let lines = option_usize(args, "--lines").unwrap_or(200);
            let data = call(json!({
                "cmd": "logs",
                "target": target,
                "lines": lines,
            }))?;
            print_logs(data, json_out)
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

fn app(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("info") => print(call(json!({ "cmd": "app", "action": "info" }))?, true),
        Some("paths") => print(call(json!({ "cmd": "app", "action": "paths" }))?, true),
        Some("restart" | "exit" | "lightweight-enter" | "lightweight-exit") => {
            let action = args[0].clone();
            print(call(json!({ "cmd": "app", "action": action }))?, json_out)
        }
        Some("diagnostics") if args.get(1).map(String::as_str) == Some("export") => {
            print(call(json!({ "cmd": "app", "action": "diagnostics_export" }))?, json_out)
        }
        Some("open") => {
            let target = args.get(1).ok_or_else(|| err(3, "missing app open target"))?;
            print(
                call(json!({ "cmd": "app", "action": "open", "arg": target }))?,
                json_out,
            )
        }
        _ => Err(err(
            3,
            "usage: vergectl app info|paths|restart|exit|diagnostics export|open app|core|logs",
        )),
    }
}

fn system(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("hostname") => print(call(json!({ "cmd": "system", "action": "hostname" }))?, json_out),
        Some("interfaces") => print(call(json!({ "cmd": "system", "action": "interfaces" }))?, true),
        Some("interfaces-info") => print(call(json!({ "cmd": "system", "action": "interfaces_info" }))?, true),
        Some("proxy") if args.get(1).map(String::as_str) == Some("get") => {
            print(call(json!({ "cmd": "system", "action": "proxy_get" }))?, true)
        }
        Some("auto-proxy") if args.get(1).map(String::as_str) == Some("get") => {
            print(call(json!({ "cmd": "system", "action": "auto_proxy_get" }))?, true)
        }
        Some("port-in-use") => {
            let port = args
                .get(1)
                .ok_or_else(|| err(3, "missing port"))?
                .parse::<u16>()
                .map_err(|e| err(3, format!("invalid port: {e}")))?;
            print(
                call(json!({ "cmd": "system", "action": "port_in_use", "port": port }))?,
                json_out,
            )
        }
        Some("auto-launch") if args.get(1).map(String::as_str) == Some("get") => {
            print(call(json!({ "cmd": "system", "action": "auto_launch_get" }))?, true)
        }
        _ => Err(err(
            3,
            "usage: vergectl system hostname|interfaces|interfaces-info|proxy get|auto-proxy get|port-in-use <port>|auto-launch get",
        )),
    }
}

fn service(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    let action = args.first().ok_or_else(|| err(3, "missing service action"))?;
    match action.as_str() {
        "status" | "install" | "uninstall" | "repair" | "reinstall" => print(
            call(json!({ "cmd": "service", "action": action }))?,
            json_out || action == "status",
        ),
        _ => Err(err(
            3,
            "usage: vergectl service status|install|uninstall|repair|reinstall",
        )),
    }
}

fn clash(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("info") => print(call(json!({ "cmd": "clash", "action": "info" }))?, true),
        Some("mode") => {
            let sub = args
                .get(1)
                .map(String::as_str)
                .ok_or_else(|| err(3, "missing mode action"))?;
            match sub {
                "get" => print(call(json!({ "cmd": "clash", "action": "mode_get" }))?, true),
                "set" => print(
                    call(json!({
                        "cmd": "clash",
                        "action": "mode_set",
                        "value": args.get(2).ok_or_else(|| err(3, "missing mode"))?,
                    }))?,
                    json_out,
                ),
                _ => Err(err(3, "usage: vergectl clash mode get|set <mode>")),
            }
        }
        Some("core") => {
            let sub = args
                .get(1)
                .map(String::as_str)
                .ok_or_else(|| err(3, "missing core action"))?;
            match sub {
                "get" => print(call(json!({ "cmd": "clash", "action": "core_get" }))?, true),
                "set" => print(
                    call(json!({
                        "cmd": "clash",
                        "action": "core_set",
                        "value": args.get(2).ok_or_else(|| err(3, "missing core"))?,
                    }))?,
                    json_out,
                ),
                _ => Err(err(3, "usage: vergectl clash core get|set <core>")),
            }
        }
        Some("delay") => print(
            call(json!({
                "cmd": "clash",
                "action": "delay",
                "value": args.get(1).ok_or_else(|| err(3, "missing url"))?,
            }))?,
            json_out,
        ),
        Some("dns") => clash_dns(args, json_out),
        _ => Err(err(
            3,
            "usage: vergectl clash info|mode get|mode set <mode>|core get|core set <core>|delay <url>|dns ...",
        )),
    }
}

fn clash_dns(args: &mut Vec<String>, json_out: bool) -> CliResult<()> {
    match args.get(1).map(String::as_str) {
        Some("get") => print(call(json!({ "cmd": "clash", "action": "dns_get" }))?, json_out),
        Some("save") => {
            let patch =
                read_value_arg(args, "--json", "--file")?.ok_or_else(|| err(3, "use --json or --file for dns save"))?;
            print(
                call(json!({ "cmd": "clash", "action": "dns_save", "patch": patch }))?,
                json_out,
            )
        }
        Some("apply") => {
            let apply = !take_flag(args, "--disable");
            print(
                call(json!({ "cmd": "clash", "action": "dns_apply", "apply": apply }))?,
                json_out,
            )
        }
        Some("validate") => print(call(json!({ "cmd": "clash", "action": "dns_validate" }))?, true),
        Some("exists") => print(call(json!({ "cmd": "clash", "action": "dns_exists" }))?, true),
        _ => Err(err(3, "usage: vergectl clash dns get|save|apply|validate|exists")),
    }
}

fn runtime(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("get" | "exists" | "logs") => {
            let action = args[0].clone();
            print(call(json!({ "cmd": "runtime", "action": action }))?, true)
        }
        Some("yaml") => print(call(json!({ "cmd": "runtime", "action": "yaml" }))?, json_out),
        Some("proxy-chain") => match args.get(1).map(String::as_str) {
            Some("get") => print(
                call(json!({
                    "cmd": "runtime",
                    "action": "proxy_chain_get",
                    "value": args.get(2).ok_or_else(|| err(3, "missing node"))?,
                }))?,
                json_out,
            ),
            Some("set") => {
                let patch = read_value_arg(args, "--json", "--file")?
                    .ok_or_else(|| err(3, "use --json or --file for proxy-chain set"))?;
                print(
                    call(json!({
                        "cmd": "runtime",
                        "action": "proxy_chain_set",
                        "patch": patch,
                    }))?,
                    json_out,
                )
            }
            _ => Err(err(
                3,
                "usage: vergectl runtime proxy-chain get <node>|set --file <path>",
            )),
        },
        _ => Err(err(3, "usage: vergectl runtime get|yaml|exists|logs|proxy-chain ...")),
    }
}

fn profiles(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("list") => print(call(json!({ "cmd": "profiles", "action": "list" }))?, true),
        Some("import") => {
            let option = read_value_arg(args, "--option-json", "--option-file")?;
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": "import",
                    "url": args.get(1).ok_or_else(|| err(3, "missing profile url"))?,
                    "option": option,
                }))?,
                json_out,
            )
        }
        Some("create") => {
            let item = read_value_arg(args, "--json", "--file")?
                .ok_or_else(|| err(3, "use --json or --file for profiles create"))?;
            let file_data = take_option(args, "--data-file")
                .map(|path| read_text_file(&path))
                .transpose()?;
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": "create",
                    "item": item,
                    "file_data": file_data,
                }))?,
                json_out,
            )
        }
        Some("update") => {
            let option = read_value_arg(args, "--option-json", "--option-file")?;
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": "update",
                    "index": args.get(1).ok_or_else(|| err(3, "missing profile id"))?,
                    "option": option,
                }))?,
                json_out,
            )
        }
        Some("delete" | "read-file" | "next-update") => {
            let action = args[0].replace('-', "_");
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": action,
                    "index": args.get(1).ok_or_else(|| err(3, "missing profile id"))?,
                }))?,
                json_out || args[0] == "next-update",
            )
        }
        Some("save-file") => {
            let data = take_option(args, "--file")
                .map(|path| read_text_file(&path))
                .transpose()?
                .ok_or_else(|| err(3, "use --file for profiles save-file"))?;
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": "save_file",
                    "index": args.get(1).ok_or_else(|| err(3, "missing profile id"))?,
                    "data": data,
                }))?,
                json_out,
            )
        }
        Some("reorder") => print(
            call(json!({
                "cmd": "profiles",
                "action": "reorder",
                "index": args.get(1).ok_or_else(|| err(3, "missing active id"))?,
                "over_id": args.get(2).ok_or_else(|| err(3, "missing over id"))?,
            }))?,
            json_out,
        ),
        Some("patch") => {
            let patch = read_value_arg(args, "--json", "--file")?
                .ok_or_else(|| err(3, "use --json or --file for profiles patch"))?;
            let index = args.get(1).filter(|value| !value.starts_with("--")).cloned();
            print(
                call(json!({
                    "cmd": "profiles",
                    "action": "patch",
                    "index": index,
                    "profile": patch,
                }))?,
                json_out,
            )
        }
        Some("enhance") => print(call(json!({ "cmd": "profiles", "action": "enhance" }))?, json_out),
        _ => Err(err(
            3,
            "usage: vergectl profiles list|import|create|update|delete|reorder|patch|read-file|save-file|enhance|next-update",
        )),
    }
}

fn proxies(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    let url = take_option(args, "--url").unwrap_or_else(|| DEFAULT_DELAY_URL.to_string());
    let timeout = option_u32(args, "--timeout").unwrap_or(10_000);
    match args.first().map(String::as_str) {
        Some("list" | "groups" | "providers") => {
            let action = args[0].clone();
            print(call(json!({ "cmd": "proxies", "action": action }))?, true)
        }
        Some("group" | "node" | "provider") => {
            let action = args[0].clone();
            let name = args.get(1).ok_or_else(|| err(3, "missing name"))?;
            let payload = match action.as_str() {
                "group" => json!({ "cmd": "proxies", "action": action, "group": name }),
                "node" => json!({ "cmd": "proxies", "action": action, "node": name }),
                _ => json!({ "cmd": "proxies", "action": action, "provider": name }),
            };
            print(call(payload)?, true)
        }
        Some("select") => print(
            call(json!({
                "cmd": "proxies",
                "action": "select",
                "group": args.get(1).ok_or_else(|| err(3, "missing group"))?,
                "node": args.get(2).ok_or_else(|| err(3, "missing node"))?,
            }))?,
            json_out,
        ),
        Some("delay") => print(
            call(json!({
                "cmd": "proxies",
                "action": "delay",
                "node": args.get(1).ok_or_else(|| err(3, "missing node"))?,
                "url": url,
                "timeout": timeout,
            }))?,
            json_out,
        ),
        Some("delay-group") => print(
            call(json!({
                "cmd": "proxies",
                "action": "delay_group",
                "group": args.get(1).ok_or_else(|| err(3, "missing group"))?,
                "url": url,
                "timeout": timeout,
            }))?,
            true,
        ),
        Some("healthcheck-provider" | "update-provider") => {
            let action = args[0].replace('-', "_");
            print(
                call(json!({
                    "cmd": "proxies",
                    "action": action,
                    "provider": args.get(1).ok_or_else(|| err(3, "missing provider"))?,
                }))?,
                json_out,
            )
        }
        _ => Err(err(
            3,
            "usage: vergectl proxies list|groups|providers|group|node|provider|select|delay|delay-group|healthcheck-provider|update-provider",
        )),
    }
}

fn connections(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("list") => print(call(json!({ "cmd": "connections", "action": "list" }))?, true),
        Some("close") => print(
            call(json!({
                "cmd": "connections",
                "action": "close",
                "id": args.get(1).ok_or_else(|| err(3, "missing connection id"))?,
            }))?,
            json_out,
        ),
        Some("close-all") => print(call(json!({ "cmd": "connections", "action": "close_all" }))?, json_out),
        _ => Err(err(3, "usage: vergectl connections list|close <id>|close-all")),
    }
}

fn rules(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("list") => print(call(json!({ "cmd": "rules", "action": "list" }))?, true),
        Some("providers") => print(call(json!({ "cmd": "rules", "action": "providers" }))?, true),
        Some("update-provider") => {
            let provider = if take_flag(args, "--all") {
                "__all__".to_string()
            } else {
                args.get(1).ok_or_else(|| err(3, "missing provider or --all"))?.clone()
            };
            print(
                call(json!({
                    "cmd": "rules",
                    "action": "update_provider",
                    "provider": provider,
                }))?,
                json_out,
            )
        }
        _ => Err(err(
            3,
            "usage: vergectl rules list|providers|update-provider <name|--all>",
        )),
    }
}

fn unlock(args: &mut Vec<String>) -> CliResult<()> {
    match args.first().map(String::as_str) {
        Some("list" | "check") => {
            let action = args[0].clone();
            print(call(json!({ "cmd": "unlock", "action": action }))?, true)
        }
        _ => Err(err(3, "usage: vergectl unlock list|check")),
    }
}

fn backup(args: &mut Vec<String>) -> CliResult<()> {
    let json_out = take_flag(args, "--json");
    match args.first().map(String::as_str) {
        Some("create") => print(call(json!({ "cmd": "backup_create" }))?, json_out),
        Some("local") => backup_local(args, json_out),
        Some("webdav") => backup_webdav(args, json_out),
        _ => Err(err(3, "usage: vergectl backup create|local ...|webdav ...")),
    }
}

fn backup_local(args: &mut [String], json_out: bool) -> CliResult<()> {
    match args.get(1).map(String::as_str) {
        Some("create" | "list") => print(
            call(json!({
                "cmd": "backup",
                "area": "local",
                "action": args[1],
            }))?,
            json_out || args[1] == "list",
        ),
        Some("delete" | "restore") => print(
            call(json!({
                "cmd": "backup",
                "area": "local",
                "action": args[1],
                "filename": args.get(2).ok_or_else(|| err(3, "missing filename"))?,
            }))?,
            json_out,
        ),
        Some("import") => print(
            call(json!({
                "cmd": "backup",
                "area": "local",
                "action": "import",
                "source": args.get(2).ok_or_else(|| err(3, "missing source"))?,
            }))?,
            json_out,
        ),
        Some("export") => print(
            call(json!({
                "cmd": "backup",
                "area": "local",
                "action": "export",
                "filename": args.get(2).ok_or_else(|| err(3, "missing filename"))?,
                "destination": args.get(3).ok_or_else(|| err(3, "missing destination"))?,
            }))?,
            json_out,
        ),
        _ => Err(err(
            3,
            "usage: vergectl backup local create|list|delete <file>|restore <file>|import <path>|export <file> <dest>",
        )),
    }
}

fn backup_webdav(args: &mut Vec<String>, json_out: bool) -> CliResult<()> {
    match args.get(1).map(String::as_str) {
        Some("config") => print(
            call(json!({
                "cmd": "backup",
                "area": "webdav",
                "action": "config",
                "url": take_option(args, "--url").ok_or_else(|| err(3, "missing --url"))?,
                "username": take_option(args, "--username").ok_or_else(|| err(3, "missing --username"))?,
                "password": take_option(args, "--password").ok_or_else(|| err(3, "missing --password"))?,
            }))?,
            json_out,
        ),
        Some("create" | "list") => print(
            call(json!({
                "cmd": "backup",
                "area": "webdav",
                "action": args[1],
            }))?,
            json_out || args[1] == "list",
        ),
        Some("delete" | "restore") => print(
            call(json!({
                "cmd": "backup",
                "area": "webdav",
                "action": args[1],
                "filename": args.get(2).ok_or_else(|| err(3, "missing filename"))?,
            }))?,
            json_out,
        ),
        _ => Err(err(
            3,
            "usage: vergectl backup webdav config|create|list|delete <file>|restore <file>",
        )),
    }
}

fn validate(args: &mut Vec<String>) -> CliResult<()> {
    match args.first().map(String::as_str) {
        Some("script") => {
            let file = take_option(args, "--file")
                .or_else(|| args.get(1).cloned())
                .ok_or_else(|| err(3, "missing script file"))?;
            print(
                call(json!({ "cmd": "validate", "action": "script", "file": file }))?,
                true,
            )
        }
        _ => Err(err(3, "usage: vergectl validate script --file <path>")),
    }
}

fn watch(args: &mut Vec<String>) -> CliResult<()> {
    let target = args.first().ok_or_else(|| err(3, "missing watch target"))?.clone();
    let interval = option_u64(args, "--interval").unwrap_or(1).max(1);
    let lines = option_usize(args, "--lines").unwrap_or(50);

    loop {
        let data = match target.as_str() {
            "traffic" | "memory" | "connections" => call(json!({ "cmd": "connections", "action": "list" }))?,
            "logs" => call(json!({ "cmd": "logs", "target": "core", "lines": lines }))?,
            _ => return Err(err(3, "usage: vergectl watch traffic|memory|logs|connections")),
        };
        let data = watch_value(&target, data);
        println!(
            "{}",
            serde_json::to_string(&data).map_err(|e| err(4, format!("failed to render JSON: {e}")))?
        );
        thread::sleep(Duration::from_secs(interval));
    }
}

fn watch_value(target: &str, data: Value) -> Value {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    match target {
        "traffic" => json!({
            "time": timestamp,
            "downloadTotal": data.get("downloadTotal"),
            "uploadTotal": data.get("uploadTotal"),
        }),
        "memory" => json!({
            "time": timestamp,
            "memory": data.get("memory"),
        }),
        _ => json!({ "time": timestamp, "data": data }),
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

fn read_value_arg(args: &mut Vec<String>, json_flag: &str, file_flag: &str) -> CliResult<Option<Value>> {
    if let Some(raw) = take_option(args, json_flag) {
        return serde_json::from_str(&raw)
            .map(Some)
            .map_err(|e| err(3, format!("invalid JSON value: {e}")));
    }
    take_option(args, file_flag)
        .map(|path| read_patch_file(&path))
        .transpose()
}

fn read_patch_file(path: &str) -> CliResult<Value> {
    let content = read_text_file(path)?;
    serde_json::from_str(&content)
        .or_else(|json_err| {
            let yaml_value = serde_yaml_ng::from_str::<serde_yaml_ng::Value>(&content)
                .map_err(|yaml_err| format!("invalid JSON ({json_err}); invalid YAML ({yaml_err})"))?;
            serde_json::to_value(yaml_value).map_err(|yaml_err| yaml_err.to_string())
        })
        .map_err(|e| err(3, format!("invalid patch file: {e}")))
}

fn read_text_file(path: &str) -> CliResult<String> {
    fs::read_to_string(path).map_err(|e| err(3, format!("failed to read {path}: {e}")))
}

fn print_logs(data: Value, json_out: bool) -> CliResult<()> {
    if json_out {
        return print(data, true);
    }
    if let Some(lines) = data.get("lines").and_then(Value::as_array) {
        for line in lines.iter().filter_map(Value::as_str) {
            println!("{line}");
        }
        Ok(())
    } else {
        print(data, false)
    }
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

fn option_usize(args: &mut Vec<String>, name: &str) -> Option<usize> {
    take_option(args, name).and_then(|value| value.parse::<usize>().ok())
}

fn option_u32(args: &mut Vec<String>, name: &str) -> Option<u32> {
    take_option(args, name).and_then(|value| value.parse::<u32>().ok())
}

fn option_u64(args: &mut Vec<String>, name: &str) -> Option<u64> {
    take_option(args, name).and_then(|value| value.parse::<u64>().ok())
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
  vergectl app info|paths|restart|exit|diagnostics export|open app|core|logs
  vergectl system hostname|interfaces|interfaces-info|proxy get|auto-proxy get|port-in-use <port>|auto-launch get
  vergectl service status|install|uninstall|repair|reinstall
  vergectl config get verge|clash|runtime [--format json|yaml] [--json]
  vergectl config patch verge|clash --json '{{"key":value}}' | --file patch.json|patch.yaml
  vergectl clash info|mode get|mode set <mode>|core get|core set <core>|delay <url>|dns get|save|apply|validate|exists
  vergectl runtime get|yaml|exists|logs|proxy-chain get <node>|proxy-chain set --file <yaml|json>
  vergectl profiles list|import|create|update|delete|reorder|patch|read-file|save-file|enhance|next-update
  vergectl proxies list|groups|providers|group <name>|node <name>|provider <name>|select <group> <node>|delay <node>|delay-group <group>
  vergectl connections list|close <id>|close-all
  vergectl rules list|providers|update-provider <name|--all>
  vergectl unlock list|check
  vergectl backup create|local create|local list|local delete <file>|local restore <file>|webdav list
  vergectl validate script --file <path>
  vergectl watch traffic|memory|logs|connections [--interval 1]
  vergectl skill install

Environment:
  VERGECTL_PORT  Override the local Clash Verge CLI port.
"#
    );
}
