use crate::{
    config::{Config, IVerge},
    constants::files,
    core::CoreManager,
    utils::{dirs, yaml_emitter},
};
use anyhow::{Context as _, Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use serde_yaml_ng::{Mapping, Value as YamlValue};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum CliRequest {
    Status,
    Paths,
    ConfigGet { target: String, format: Option<String> },
    ConfigPatch { target: String, patch: JsonValue },
    Logs { target: String, lines: Option<usize> },
    LogsPath,
    Core { action: String },
    BackupCreate,
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
        "start" => crate::cmd::start_core().await.map_err(|e| anyhow!(e.to_string()))?,
        "stop" => crate::cmd::stop_core().await.map_err(|e| anyhow!(e.to_string()))?,
        "restart" => crate::cmd::restart_core().await.map_err(|e| anyhow!(e.to_string()))?,
        _ => return Err(anyhow!("unknown core action: {action}")),
    }
    Ok(json!({ "running_mode": CoreManager::global().get_running_mode().to_string() }))
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

fn json_to_mapping(value: JsonValue) -> Result<Mapping> {
    let text = serde_json::to_string(&value)?;
    match serde_yaml_ng::from_str::<YamlValue>(&text)? {
        YamlValue::Mapping(map) => Ok(map),
        _ => Err(anyhow!("patch must be an object")),
    }
}
