use crate::{
    config::{Config, IProfiles, IVerge, PrfItem, PrfOption},
    constants::files,
    core::{CoreManager, handle},
    utils::{dirs, yaml_emitter},
};
use anyhow::{Context as _, Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use serde_yaml_ng::{Mapping, Value as YamlValue};
use std::path::PathBuf;
use tauri::Manager as _;

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum CliRequest {
    Status,
    Paths,
    ConfigGet {
        target: String,
        format: Option<String>,
    },
    ConfigPatch {
        target: String,
        patch: JsonValue,
    },
    Logs {
        target: String,
        lines: Option<usize>,
    },
    LogsPath,
    Core {
        action: String,
    },
    BackupCreate,
    App {
        action: String,
        arg: Option<String>,
    },
    System {
        action: String,
        port: Option<u16>,
    },
    Service {
        action: String,
    },
    Clash {
        action: String,
        value: Option<String>,
        patch: Option<JsonValue>,
        apply: Option<bool>,
    },
    Runtime {
        action: String,
        value: Option<String>,
        patch: Option<JsonValue>,
    },
    Profiles {
        action: String,
        index: Option<String>,
        over_id: Option<String>,
        url: Option<String>,
        option: Option<JsonValue>,
        item: Option<JsonValue>,
        profile: Option<JsonValue>,
        file_data: Option<String>,
        data: Option<String>,
    },
    Proxies {
        action: String,
        group: Option<String>,
        node: Option<String>,
        provider: Option<String>,
        url: Option<String>,
        timeout: Option<u32>,
    },
    Connections {
        action: String,
        id: Option<String>,
    },
    Rules {
        action: String,
        provider: Option<String>,
    },
    Unlock {
        action: String,
    },
    Backup {
        area: String,
        action: String,
        filename: Option<String>,
        source: Option<String>,
        destination: Option<String>,
        url: Option<String>,
        username: Option<String>,
        password: Option<String>,
    },
    Validate {
        action: String,
        file: Option<String>,
    },
}

#[derive(Serialize)]
struct CliResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn handle(request: CliRequest) -> Result<impl warp::Reply, warp::Rejection> {
    let response = match execute(request).await {
        Ok(data) => CliResponse {
            ok: true,
            data: Some(data),
            error: None,
        },
        Err(err) => CliResponse {
            ok: false,
            data: None,
            error: Some(err.to_string()),
        },
    };
    Ok(warp::reply::json(&response))
}

async fn execute(request: CliRequest) -> Result<JsonValue> {
    match request {
        CliRequest::Status => status().await,
        CliRequest::Paths => paths().await,
        CliRequest::ConfigGet { target, format } => config_get(&target, format.as_deref()).await,
        CliRequest::ConfigPatch { target, patch } => config_patch(&target, patch).await,
        CliRequest::Logs { target, lines } => logs(&target, lines.unwrap_or(200)).await,
        CliRequest::LogsPath => logs_path().await,
        CliRequest::Core { action } => core(&action).await,
        CliRequest::BackupCreate => backup_create().await,
        CliRequest::App { action, arg } => app(&action, arg).await,
        CliRequest::System { action, port } => system(&action, port).await,
        CliRequest::Service { action } => service(&action).await,
        CliRequest::Clash {
            action,
            value,
            patch,
            apply,
        } => clash(&action, value, patch, apply).await,
        CliRequest::Runtime { action, value, patch } => runtime(&action, value, patch).await,
        CliRequest::Profiles {
            action,
            index,
            over_id,
            url,
            option,
            item,
            profile,
            file_data,
            data,
        } => profiles(&action, index, over_id, url, option, item, profile, file_data, data).await,
        CliRequest::Proxies {
            action,
            group,
            node,
            provider,
            url,
            timeout,
        } => proxies(&action, group, node, provider, url, timeout).await,
        CliRequest::Connections { action, id } => connections(&action, id).await,
        CliRequest::Rules { action, provider } => rules(&action, provider).await,
        CliRequest::Unlock { action } => unlock(&action).await,
        CliRequest::Backup {
            area,
            action,
            filename,
            source,
            destination,
            url,
            username,
            password,
        } => backup(&area, &action, filename, source, destination, url, username, password).await,
        CliRequest::Validate { action, file } => validate(&action, file).await,
    }
}

async fn status() -> Result<JsonValue> {
    let clash = Config::clash().await.data_arc();
    let verge = Config::verge().await.data_arc();
    Ok(json!({
        "app": "Clash Verge",
        "version": env!("CARGO_PKG_VERSION"),
        "running_mode": CoreManager::global().get_running_mode().to_string(),
        "clash": clash.get_client_info(),
        "verge": {
            "language": verge.language.clone(),
            "theme_mode": verge.theme_mode.clone(),
            "enable_system_proxy": verge.enable_system_proxy,
            "enable_tun_mode": verge.enable_tun_mode,
            "clash_core": verge.clash_core.clone(),
        },
        "app_dir": path_string(dirs::app_home_dir()?),
    }))
}

async fn paths() -> Result<JsonValue> {
    let app_dir = dirs::app_home_dir()?;
    Ok(json!({
        "app_dir": path_string(app_dir.clone()),
        "logs_dir": path_string(dirs::app_logs_dir()?),
        "app_log": path_string(dirs::app_latest_log()?),
        "core_log": path_string(dirs::clash_latest_log()?),
        "clash_config": path_string(dirs::clash_path()?),
        "verge_config": path_string(dirs::verge_path()?),
        "profiles_config": path_string(dirs::profiles_path()?),
        "profiles_dir": path_string(dirs::app_profiles_dir()?),
        "runtime_config": path_string(app_dir.join(files::RUNTIME_CONFIG)),
    }))
}

async fn config_get(target: &str, format: Option<&str>) -> Result<JsonValue> {
    let format = format.unwrap_or("json");
    match (target, format) {
        ("verge", "json") => to_json(&*Config::verge().await.data_arc()),
        ("verge", "yaml") => Ok(json!({ "content": serde_yaml_ng::to_string(&*Config::verge().await.data_arc())? })),
        ("clash", "json") => to_json(&Config::clash().await.data_arc().0),
        ("clash", "yaml") => Ok(json!({
            "content": yaml_emitter::to_mihomo_config_string(&Config::clash().await.data_arc().0)?
        })),
        ("runtime", "json") => to_json(&Config::runtime().await.latest_arc().config),
        ("runtime", "yaml") => {
            let runtime = Config::runtime().await.latest_arc();
            let config = runtime
                .config
                .as_ref()
                .ok_or_else(|| anyhow!("runtime config is not ready"))?;
            Ok(json!({ "content": yaml_emitter::to_mihomo_config_string(config)? }))
        }
        (_, "json" | "yaml") => Err(anyhow!("unknown config target: {target}")),
        (_, other) => Err(anyhow!("unknown config format: {other}")),
    }
}

async fn config_patch(target: &str, patch: JsonValue) -> Result<JsonValue> {
    match target {
        "verge" => {
            let patch: IVerge = serde_json::from_value(patch).context("invalid Verge patch")?;
            crate::feat::patch_verge(&patch, false).await?;
        }
        "clash" => {
            let patch = json_to_mapping(patch)?;
            crate::feat::patch_clash(&patch).await?;
        }
        _ => return Err(anyhow!("unknown config target: {target}")),
    }
    Ok(json!({ "patched": target }))
}

async fn logs(target: &str, lines: usize) -> Result<JsonValue> {
    let lines = lines.max(1);
    let logs = match target {
        "app" => tail_file(dirs::app_latest_log()?, lines).await?,
        "core" => {
            let mut logs = CoreManager::global()
                .get_clash_logs()
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|line| line.to_string())
                .collect::<Vec<_>>();
            if logs.is_empty() {
                logs = tail_file(dirs::clash_latest_log()?, lines).await?;
            } else {
                logs = tail_vec(logs, lines);
            }
            logs
        }
        _ => return Err(anyhow!("unknown log target: {target}")),
    };
    Ok(json!({ "target": target, "lines": logs }))
}

async fn logs_path() -> Result<JsonValue> {
    Ok(json!({
        "app": path_string(dirs::app_latest_log()?),
        "core": path_string(dirs::clash_latest_log()?),
        "dir": path_string(dirs::app_logs_dir()?),
    }))
}

async fn core(action: &str) -> Result<JsonValue> {
    match action {
        "mode" => {}
        "start" => cmd(crate::cmd::start_core().await)?,
        "stop" => cmd(crate::cmd::stop_core().await)?,
        "restart" => cmd(crate::cmd::restart_core().await)?,
        _ => return Err(anyhow!("unknown core action: {action}")),
    }
    Ok(json!({ "running_mode": CoreManager::global().get_running_mode().to_string() }))
}

async fn app(action: &str, arg: Option<String>) -> Result<JsonValue> {
    match action {
        "info" => status().await,
        "paths" => paths().await,
        "restart" => {
            cmd(crate::cmd::restart_app().await)?;
            Ok(json!({ "restarted": true }))
        }
        "exit" => {
            crate::cmd::exit_app().await;
            Ok(json!({ "exiting": true }))
        }
        "diagnostics_export" | "diagnostics-export" => diagnostics_export(),
        "lightweight_enter" | "lightweight-enter" => {
            cmd(crate::cmd::entry_lightweight_mode().await)?;
            Ok(json!({ "lightweight": true }))
        }
        "lightweight_exit" | "lightweight-exit" => {
            cmd(crate::cmd::exit_lightweight_mode().await)?;
            Ok(json!({ "lightweight": false }))
        }
        "open" => {
            match arg.as_deref() {
                Some("app") => cmd(crate::cmd::open_app_dir().await)?,
                Some("core") => cmd(crate::cmd::open_core_dir().await)?,
                Some("logs") => cmd(crate::cmd::open_logs_dir().await)?,
                Some(other) => return Err(anyhow!("unknown app open target: {other}")),
                None => return Err(anyhow!("missing app open target")),
            }
            Ok(json!({ "opened": arg }))
        }
        _ => Err(anyhow!("unknown app action: {action}")),
    }
}

async fn system(action: &str, port: Option<u16>) -> Result<JsonValue> {
    match action {
        "hostname" => Ok(json!({ "hostname": crate::cmd::get_system_hostname() })),
        "interfaces" => to_json(&crate::cmd::get_network_interfaces()),
        "interfaces_info" | "interfaces-info" => to_json(&cmd(crate::cmd::get_network_interfaces_info())?),
        "proxy_get" | "proxy-get" => to_json(&cmd(crate::cmd::get_sys_proxy().await)?),
        "auto_proxy_get" | "auto-proxy-get" => to_json(&cmd(crate::cmd::get_auto_proxy().await)?),
        "port_in_use" | "port-in-use" => {
            let port = port.ok_or_else(|| anyhow!("missing port"))?;
            Ok(json!({ "port": port, "in_use": crate::cmd::is_port_in_use(port) }))
        }
        "auto_launch_get" | "auto-launch-get" => to_json(&cmd(crate::cmd::get_auto_launch_status())?),
        _ => Err(anyhow!("unknown system action: {action}")),
    }
}

async fn service(action: &str) -> Result<JsonValue> {
    match action {
        "status" => match crate::cmd::is_service_available().await {
            Ok(available) => Ok(json!({ "available": available })),
            Err(error) => Ok(json!({ "available": false, "error": error })),
        },
        "install" => {
            cmd(crate::cmd::install_service().await)?;
            Ok(json!({ "installed": true }))
        }
        "uninstall" => {
            cmd(crate::cmd::uninstall_service().await)?;
            Ok(json!({ "uninstalled": true }))
        }
        "repair" => {
            cmd(crate::cmd::repair_service().await)?;
            Ok(json!({ "repaired": true }))
        }
        "reinstall" => {
            cmd(crate::cmd::reinstall_service().await)?;
            Ok(json!({ "reinstalled": true }))
        }
        _ => Err(anyhow!("unknown service action: {action}")),
    }
}

async fn clash(
    action: &str,
    value: Option<String>,
    patch: Option<JsonValue>,
    apply: Option<bool>,
) -> Result<JsonValue> {
    match action {
        "info" => to_json(&cmd(crate::cmd::get_clash_info().await)?),
        "mode_get" | "mode-get" => Ok(json!({ "mode": cmd(crate::cmd::get_clash_mode().await)? })),
        "mode_set" | "mode-set" => {
            let value = required(value, "mode")?;
            cmd(crate::cmd::patch_clash_mode(value.clone().into()).await)?;
            Ok(json!({ "mode": value }))
        }
        "core_get" | "core-get" => Ok(json!({ "core": Config::verge().await.latest_arc().clash_core.clone() })),
        "core_set" | "core-set" => {
            let value = required(value, "core")?;
            let message = cmd(crate::cmd::change_clash_core(value.clone().into()).await)?;
            Ok(json!({ "core": value, "message": message }))
        }
        "delay" => {
            let value = required(value, "url")?;
            Ok(json!({ "url": value, "delay": cmd(crate::cmd::test_delay(value.into()).await)? }))
        }
        "dns_get" | "dns-get" => Ok(json!({ "content": cmd(crate::cmd::get_dns_config_content().await)? })),
        "dns_save" | "dns-save" => {
            let patch = patch.ok_or_else(|| anyhow!("missing dns config"))?;
            cmd(crate::cmd::save_dns_config(json_to_mapping(patch)?).await)?;
            Ok(json!({ "saved": true }))
        }
        "dns_apply" | "dns-apply" => {
            let apply = apply.unwrap_or(true);
            cmd(crate::cmd::apply_dns_config(apply).await)?;
            Ok(json!({ "applied": apply }))
        }
        "dns_validate" | "dns-validate" => to_json(&cmd(crate::cmd::validate_dns_config().await)?),
        "dns_exists" | "dns-exists" => to_json(&cmd(crate::cmd::check_dns_config_exists())?),
        "copy_env" | "copy-env" => {
            cmd(crate::cmd::copy_clash_env().await)?;
            Ok(json!({ "copied": true }))
        }
        _ => Err(anyhow!("unknown clash action: {action}")),
    }
}

async fn runtime(action: &str, value: Option<String>, patch: Option<JsonValue>) -> Result<JsonValue> {
    match action {
        "get" => to_json(&cmd(crate::cmd::get_runtime_config().await)?),
        "yaml" => Ok(json!({ "content": cmd(crate::cmd::get_runtime_yaml().await)? })),
        "exists" => to_json(&cmd(crate::cmd::get_runtime_exists().await)?),
        "logs" => to_json(&cmd(crate::cmd::get_runtime_logs().await)?),
        "proxy_chain_get" | "proxy-chain-get" => {
            let value = required(value, "node")?;
            Ok(json!({ "content": cmd(crate::cmd::get_runtime_proxy_chain_config(value.into()).await)? }))
        }
        "proxy_chain_set" | "proxy-chain-set" => {
            let value = patch.map(json_to_yaml_value).transpose()?;
            cmd(crate::cmd::update_proxy_chain_config_in_runtime(value).await)?;
            Ok(json!({ "updated": true }))
        }
        _ => Err(anyhow!("unknown runtime action: {action}")),
    }
}

#[allow(clippy::too_many_arguments)]
async fn profiles(
    action: &str,
    index: Option<String>,
    over_id: Option<String>,
    url: Option<String>,
    option: Option<JsonValue>,
    item: Option<JsonValue>,
    profile: Option<JsonValue>,
    file_data: Option<String>,
    data: Option<String>,
) -> Result<JsonValue> {
    match action {
        "list" => to_json(&*Config::profiles().await.data_arc()),
        "import" => {
            let url = required(url, "url")?;
            cmd(crate::cmd::import_profile(url, parse_option(option)?).await)?;
            Ok(json!({ "imported": true }))
        }
        "create" => {
            let item = parse_item(required(item, "item")?)?;
            cmd(crate::cmd::create_profile(item, file_data.map(Into::into)).await)?;
            Ok(json!({ "created": true }))
        }
        "update" => {
            let index = required(index, "index")?;
            cmd(crate::cmd::update_profile(index.into(), parse_option(option)?).await)?;
            Ok(json!({ "updated": true }))
        }
        "delete" => {
            let index = required(index, "index")?;
            cmd(crate::cmd::delete_profile(index.into()).await)?;
            Ok(json!({ "deleted": true }))
        }
        "reorder" => {
            let index = required(index, "index")?;
            let over_id = required(over_id, "over_id")?;
            cmd(crate::cmd::reorder_profile(index.into(), over_id.into()).await)?;
            Ok(json!({ "reordered": true }))
        }
        "patch" => {
            let patch = profile.or(item).ok_or_else(|| anyhow!("missing profile patch"))?;
            if let Some(index) = index {
                cmd(crate::cmd::patch_profile(index.into(), parse_item(patch)?).await)?;
                Ok(json!({ "patched": true }))
            } else {
                let profiles: IProfiles = serde_json::from_value(patch).context("invalid profiles patch")?;
                to_json(&cmd(crate::cmd::patch_profiles_config(profiles).await)?)
            }
        }
        "read_file" | "read-file" => {
            let index = required(index, "index")?;
            Ok(json!({ "content": cmd(crate::cmd::read_profile_file(index.into()).await)? }))
        }
        "save_file" | "save-file" => {
            let index = required(index, "index")?;
            let data = required(data, "data")?;
            to_json(&cmd(
                crate::cmd::save_profile_file(index.into(), Some(data.into())).await
            )?)
        }
        "enhance" => to_json(&cmd(crate::cmd::enhance_profiles().await)?),
        "next_update" | "next-update" => {
            let index = required(index, "index")?;
            Ok(json!({ "next_update": cmd(crate::cmd::get_next_update_time(index.into()).await)? }))
        }
        _ => Err(anyhow!("unknown profiles action: {action}")),
    }
}

async fn proxies(
    action: &str,
    group: Option<String>,
    node: Option<String>,
    provider: Option<String>,
    url: Option<String>,
    timeout: Option<u32>,
) -> Result<JsonValue> {
    let mihomo = handle::Handle::mihomo().await;
    let url = url.unwrap_or_else(default_delay_url);
    let timeout = timeout.unwrap_or(10_000);
    match action {
        "list" => to_json(&mihomo.get_proxies().await?),
        "groups" => to_json(&mihomo.get_groups().await?),
        "group" => to_json(&mihomo.get_group_by_name(&required(group, "group")?).await?),
        "node" => to_json(&mihomo.get_proxy_by_name(&required(node, "node")?).await?),
        "providers" => to_json(&mihomo.get_proxy_providers().await?),
        "provider" => to_json(
            &mihomo
                .get_proxy_provider_by_name(&required(provider, "provider")?)
                .await?,
        ),
        "select" => {
            let group = required(group, "group")?;
            let node = required(node, "node")?;
            mihomo.select_node_for_group(&group, &node).await?;
            Ok(json!({ "group": group, "node": node }))
        }
        "delay" => to_json(
            &mihomo
                .delay_proxy_by_name(&required(node, "node")?, &url, timeout)
                .await?,
        ),
        "delay_group" | "delay-group" => to_json(&mihomo.delay_group(&required(group, "group")?, &url, timeout).await?),
        "healthcheck_provider" | "healthcheck-provider" => {
            let provider = required(provider, "provider")?;
            mihomo.healthcheck_proxy_provider(&provider).await?;
            Ok(json!({ "provider": provider, "healthchecked": true }))
        }
        "update_provider" | "update-provider" => {
            let provider = required(provider, "provider")?;
            mihomo.update_proxy_provider(&provider).await?;
            Ok(json!({ "provider": provider, "updated": true }))
        }
        _ => Err(anyhow!("unknown proxies action: {action}")),
    }
}

async fn connections(action: &str, id: Option<String>) -> Result<JsonValue> {
    let mihomo = handle::Handle::mihomo().await;
    match action {
        "list" => to_json(&mihomo.get_connections().await?),
        "close" => {
            let id = required(id, "id")?;
            mihomo.close_connection(&id).await?;
            Ok(json!({ "id": id, "closed": true }))
        }
        "close_all" | "close-all" => {
            mihomo.close_all_connections().await?;
            Ok(json!({ "closed_all": true }))
        }
        _ => Err(anyhow!("unknown connections action: {action}")),
    }
}

async fn rules(action: &str, provider: Option<String>) -> Result<JsonValue> {
    let mihomo = handle::Handle::mihomo().await;
    match action {
        "list" => to_json(&mihomo.get_rules().await?),
        "providers" => to_json(&mihomo.get_rule_providers().await?),
        "update_provider" | "update-provider" => {
            let provider = required(provider, "provider")?;
            if provider == "__all__" {
                let providers = mihomo.get_rule_providers().await?;
                for name in providers.providers.keys() {
                    mihomo.update_rule_provider(name).await?;
                }
                Ok(json!({ "updated": providers.providers.keys().collect::<Vec<_>>() }))
            } else {
                mihomo.update_rule_provider(&provider).await?;
                Ok(json!({ "provider": provider, "updated": true }))
            }
        }
        _ => Err(anyhow!("unknown rules action: {action}")),
    }
}

async fn unlock(action: &str) -> Result<JsonValue> {
    match action {
        "list" => to_json(&crate::cmd::get_unlock_items().await.map_err(|e| anyhow!(e))?),
        "check" => to_json(&crate::cmd::check_media_unlock().await.map_err(|e| anyhow!(e))?),
        _ => Err(anyhow!("unknown unlock action: {action}")),
    }
}

#[allow(clippy::too_many_arguments)]
async fn backup(
    area: &str,
    action: &str,
    filename: Option<String>,
    source: Option<String>,
    destination: Option<String>,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,
) -> Result<JsonValue> {
    match (area, action) {
        ("local", "create") => backup_create().await,
        ("local", "list") => to_json(&cmd(crate::cmd::list_local_backup().await)?),
        ("local", "delete") => {
            cmd(crate::cmd::delete_local_backup(required(filename, "filename")?.into()).await)?;
            Ok(json!({ "deleted": true }))
        }
        ("local", "restore") => {
            cmd(crate::cmd::restore_local_backup(required(filename, "filename")?.into()).await)?;
            Ok(json!({ "restored": true }))
        }
        ("local", "import") => Ok(json!({
            "filename": cmd(crate::cmd::import_local_backup(required(source, "source")?.into()).await)?
        })),
        ("local", "export") => {
            cmd(crate::cmd::export_local_backup(
                required(filename, "filename")?.into(),
                required(destination, "destination")?.into(),
            )
            .await)?;
            Ok(json!({ "exported": true }))
        }
        ("webdav", "config") => {
            cmd(crate::cmd::save_webdav_config(
                required(url, "url")?.into(),
                required(username, "username")?.into(),
                required(password, "password")?.into(),
            )
            .await)?;
            Ok(json!({ "saved": true }))
        }
        ("webdav", "create") => {
            cmd(crate::cmd::create_webdav_backup().await)?;
            Ok(json!({ "created": true }))
        }
        ("webdav", "list") => to_json(&cmd(crate::cmd::list_webdav_backup().await)?),
        ("webdav", "delete") => {
            cmd(crate::cmd::delete_webdav_backup(required(filename, "filename")?.into()).await)?;
            Ok(json!({ "deleted": true }))
        }
        ("webdav", "restore") => {
            cmd(crate::cmd::restore_webdav_backup(required(filename, "filename")?.into()).await)?;
            Ok(json!({ "restored": true }))
        }
        _ => Err(anyhow!("unknown backup command: {area} {action}")),
    }
}

async fn validate(action: &str, file: Option<String>) -> Result<JsonValue> {
    match action {
        "script" => {
            let file = required(file, "file")?;
            to_json(&cmd(crate::cmd::validate_script_file(file.into()).await)?)
        }
        _ => Err(anyhow!("unknown validate action: {action}")),
    }
}

async fn backup_create() -> Result<JsonValue> {
    let filename = crate::feat::create_local_backup_with_namer(|name| name.to_string().into()).await?;
    Ok(json!({ "filename": filename }))
}

async fn tail_file(path: PathBuf, lines: usize) -> Result<Vec<String>> {
    if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Ok(Vec::new());
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .with_context(|| format!("failed to read {}", path.display()))?;
    Ok(tail_vec(content.lines().map(ToOwned::to_owned).collect(), lines))
}

fn diagnostics_export() -> Result<JsonValue> {
    let app_handle = crate::APP_HANDLE
        .get()
        .ok_or_else(|| anyhow!("app handle is not ready"))?;
    let platform = app_handle.state::<parking_lot::RwLock<tauri_plugin_clash_verge_sysinfo::Platform>>();
    let content = platform.inner().read().to_string();
    Ok(json!({ "content": content }))
}

fn tail_vec(mut lines: Vec<String>, limit: usize) -> Vec<String> {
    let len = lines.len();
    if len > limit {
        lines.split_off(len - limit)
    } else {
        lines
    }
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn to_json<T: Serialize + ?Sized>(value: &T) -> Result<JsonValue> {
    serde_json::to_value(value).map_err(Into::into)
}

fn cmd<T>(result: crate::cmd::CmdResult<T>) -> Result<T> {
    result.map_err(|e| anyhow!(e.to_string()))
}

fn required<T>(value: Option<T>, name: &str) -> Result<T> {
    value.ok_or_else(|| anyhow!("missing {name}"))
}

fn parse_item(value: JsonValue) -> Result<PrfItem> {
    serde_json::from_value(value).context("invalid profile item")
}

fn parse_option(value: Option<JsonValue>) -> Result<Option<PrfOption>> {
    value
        .map(serde_json::from_value)
        .transpose()
        .context("invalid profile option")
}

fn json_to_mapping(value: JsonValue) -> Result<Mapping> {
    match json_to_yaml_value(value)? {
        YamlValue::Mapping(map) => Ok(map),
        _ => Err(anyhow!("patch must be an object")),
    }
}

fn json_to_yaml_value(value: JsonValue) -> Result<YamlValue> {
    let text = serde_json::to_string(&value)?;
    serde_yaml_ng::from_str::<YamlValue>(&text).map_err(Into::into)
}

fn default_delay_url() -> String {
    "http://cp.cloudflare.com/generate_204".to_string()
}
