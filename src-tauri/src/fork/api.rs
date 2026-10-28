use serde_json::{Value, json};

use super::{bridge::Bridge, settings::PORT};
use crate::{
    cmd,
    config::{Config, IVerge, MixedPort, PrfOption},
    core::{handle::Handle, runstate::RUN_STATE},
    feat,
};

const DELAY_TEST_URL: &str = "https://www.gstatic.com/generate_204";
const DELAY_TIMEOUT_MS: u32 = 5000;

pub type ApiResult = Result<Value, String>;

fn field<'a>(body: &'a Value, key: &str) -> Result<&'a str, String> {
    body.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing string field `{key}`"))
}

fn to_json<T: serde::Serialize>(value: &T) -> ApiResult {
    serde_json::to_value(value).map_err(|err| err.to_string())
}

/// Dispatches one `/api/<path>` call from the CLI or the settings page.
pub async fn handle(bridge: &'static Bridge, method: &str, path: &str, body: Value) -> ApiResult {
    match (method, path) {
        ("GET", "ping") => Ok(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") })),
        ("GET", "status") => Box::pin(status(bridge)).await,
        ("GET", "service") => {
            let view = RUN_STATE.settled().await.to_view();
            Ok(json!({ "available": view.service_usable, "state": to_json(&view)? }))
        }
        ("GET", "config/verge") => to_json(&*Config::verge().await.latest_arc()),
        ("POST", "config/verge") => {
            let patch: IVerge = serde_json::from_value(body).map_err(|err| err.to_string())?;
            Box::pin(feat::patch_verge(&patch, false))
                .await
                .map_err(|err| format!("{err:#}"))?;
            Ok(json!({ "ok": true }))
        }
        ("GET", "config/clash") => to_json(&Config::clash().await.latest_arc().0),
        ("GET", "profiles") => profiles().await,
        ("POST", "profiles/select") => select_profile(field(&body, "uid")?).await,
        ("POST", "profiles/update") => {
            Box::pin(feat::update_profile(&field(&body, "uid")?.into(), None, true))
                .await
                .map_err(|err| format!("{err:#}"))?;
            Ok(json!({ "ok": true }))
        }
        ("POST", "profiles/import") => {
            Box::pin(cmd::import_profile(field(&body, "url")?.to_owned(), None))
                .await
                .map_err(|err| err.detail)?;
            Ok(json!({ "ok": true }))
        }
        ("GET", "mode") => {
            let config = Handle::mihomo()
                .get_base_config()
                .await
                .map_err(|err| err.to_string())?;
            Ok(json!({ "mode": to_json(&config.mode)? }))
        }
        ("POST", "mode") => {
            feat::change_clash_mode(field(&body, "mode")?.into()).await?;
            Ok(json!({ "ok": true }))
        }
        ("GET", "groups") => to_json(&Handle::mihomo().get_groups().await.map_err(|err| err.to_string())?),
        ("POST", "groups/select") => select_node(field(&body, "group")?, field(&body, "proxy")?).await,
        ("POST", "groups/delay") => to_json(
            &Handle::mihomo()
                .delay_group(field(&body, "group")?, DELAY_TEST_URL, DELAY_TIMEOUT_MS)
                .await
                .map_err(|err| err.to_string())?,
        ),
        ("GET", "surge") => Ok(surge_state(bridge)),
        ("POST", "surge") => {
            let enabled = body.get("enabled").and_then(Value::as_bool);
            let path = body.get("path").and_then(Value::as_str).map(str::to_owned);
            bridge
                .update_settings(enabled, path)
                .map_err(|err| format!("{err:#}"))?;
            if bridge.settings().surge.enabled {
                let _ = bridge.convert().await;
            }
            Ok(surge_state(bridge))
        }
        ("POST", "surge/refresh") => {
            bridge.convert().await.map_err(|err| format!("{err:#}"))?;
            let refreshed = Box::pin(bridge.refresh_profiles())
                .await
                .map_err(|err| format!("{err:#}"))?;
            Ok(json!({ "refreshed": refreshed, "surge": surge_state(bridge) }))
        }
        ("POST", "surge/import") => Box::pin(import_surge(bridge)).await,
        ("POST", "surge/reveal") => {
            let path = std::path::PathBuf::from(bridge.settings().surge.path);
            let folder = path
                .parent()
                .ok_or_else(|| format!("{} has no parent folder", path.display()))?;
            open::that(folder).map_err(|err| format!("cannot open {}: {err}", folder.display()))?;
            Ok(json!({ "opened": folder }))
        }
        ("POST", "app/exit") => {
            tokio::spawn(feat::quit());
            Ok(json!({ "ok": true }))
        }
        _ => Err(format!("unknown endpoint {method} /api/{path}")),
    }
}

async fn status(bridge: &'static Bridge) -> ApiResult {
    let verge = Config::verge().await.latest_arc();
    let profiles = Config::profiles().await.latest_arc();
    let view = RUN_STATE.settled().await.to_view();
    let mode = Handle::mihomo().get_base_config().await.ok().map(|config| config.mode);
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "running_mode": to_json(&view.mode)?,
        "service_available": view.service_usable,
        "system_proxy": verge.enable_system_proxy.unwrap_or(false),
        "tun": verge.enable_tun_mode.unwrap_or(false),
        "mixed_port": MixedPort::effective().await,
        "clash_mode": to_json(&mode)?,
        "current_profile": profiles.current,
        "control_port": PORT,
        "surge": to_json(&bridge.status())?,
    }))
}

async fn profiles() -> ApiResult {
    let profiles = Config::profiles().await.latest_arc();
    let items: Vec<Value> = profiles
        .items
        .iter()
        .flatten()
        .map(|item| {
            json!({
                "uid": item.uid,
                "name": item.name,
                "type": item.itype,
                "url": item.url,
                "current": item.uid.is_some() && item.uid == profiles.current,
            })
        })
        .collect();
    Ok(Value::Array(items))
}

async fn find_profile_uid(needle: &str) -> Option<String> {
    let profiles = Config::profiles().await.latest_arc();
    profiles
        .items
        .iter()
        .flatten()
        .find(|item| {
            item.uid.as_deref() == Some(needle)
                || item.name.as_deref() == Some(needle)
                || item.url.as_deref() == Some(needle)
        })
        .and_then(|item| item.uid.as_ref().map(ToString::to_string))
}

async fn select_profile(needle: &str) -> ApiResult {
    let uid = find_profile_uid(needle)
        .await
        .ok_or_else(|| format!("no profile matches {needle}"))?;
    let outcome = Box::pin(cmd::patch_profiles_config_by_profile_index(uid.as_str().into()))
        .await
        .map_err(|err| err.detail)?;
    Ok(json!({ "uid": uid, "outcome": to_json(&outcome)? }))
}

async fn select_node(group: &str, proxy: &str) -> ApiResult {
    feat::switch_proxy_node(group, proxy).await;
    let now = Handle::mihomo()
        .get_group_by_name(group)
        .await
        .map_err(|err| err.to_string())?
        .now;
    if now.as_deref() != Some(proxy) {
        return Err(format!("{group} is still on {}", now.unwrap_or_default()));
    }
    Ok(json!({ "group": group, "now": now }))
}

fn surge_state(bridge: &'static Bridge) -> Value {
    let settings = bridge.settings();
    json!({
        "enabled": settings.surge.enabled,
        "path": settings.surge.path,
        "subscription_url": bridge.subscription_url(),
        "status": bridge.status(),
    })
}

/// Imports the bridge as a Clash Verge subscription once, then activates it.
async fn import_surge(bridge: &'static Bridge) -> ApiResult {
    bridge.convert().await.map_err(|err| format!("{err:#}"))?;
    let url = bridge.subscription_url();
    if find_profile_uid(&url).await.is_none() {
        let option = PrfOption {
            with_proxy: Some(false),
            self_proxy: Some(false),
            ..PrfOption::default()
        };
        Box::pin(cmd::import_profile(url.clone(), Some(option)))
            .await
            .map_err(|err| err.detail)?;
    }
    Box::pin(select_profile(&url)).await
}
