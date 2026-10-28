use serde_json::{Value, json};

use super::{
    bridge::Bridge,
    settings::PORT,
    surge::edit::{self, Change},
};
use clash_verge_logging::{Type, logging};

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
        ("GET", "surge/rules") => list_surge_rules(bridge).await,
        ("POST", "surge/rules") => Box::pin(set_surge_rule(bridge, &body)).await,
        ("POST", "surge/rules/delete") => Box::pin(delete_surge_rule(bridge, &body)).await,
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

async fn read_surge_profile(bridge: &'static Bridge) -> Result<String, String> {
    let path = bridge.settings().surge.path;
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|err| format!("cannot read {path}: {err}"))
}

async fn list_surge_rules(bridge: &'static Bridge) -> ApiResult {
    let content = read_surge_profile(bridge).await?;
    Ok(json!({
        "rules": to_json(&edit::list_rules(&content))?,
        "policies": edit::list_policies(&content),
        "kinds": edit::EDITABLE_KINDS,
    }))
}

/// `type` defaults to `DOMAIN-SUFFIX`, the usual "send this site through X".
fn rule_target(body: &Value) -> Result<(String, String), String> {
    let kind = body.get("type").and_then(Value::as_str).unwrap_or("DOMAIN-SUFFIX");
    edit::normalize(kind, field(body, "value")?)
}

async fn set_surge_rule(bridge: &'static Bridge, body: &Value) -> ApiResult {
    let (kind, value) = rule_target(body)?;
    let policy = field(body, "policy")?.trim().to_owned();
    let (change, changed) = bridge
        .edit_profile(|content| {
            if !edit::list_policies(content).contains(&policy) {
                return Err(format!("unknown policy `{policy}`"));
            }
            let (next, change) = edit::upsert_rule(content, &kind, &value, &policy)?;
            Ok(((change != Change::Unchanged).then_some(next), change))
        })
        .await
        .map_err(|err| format!("{err:#}"))?;
    let closed = if changed {
        close_matching(&kind, &value).await
    } else {
        0
    };
    let (action, previous) = match change {
        Change::Added => ("added", None),
        Change::Updated { previous } => ("updated", Some(previous)),
        Change::Unchanged => ("unchanged", None),
    };
    logging!(
        info,
        Type::Config,
        "[surge] rule {kind},{value},{policy} {action}, closed {closed} connection(s)"
    );
    Ok(json!({
        "rule": format!("{kind},{value},{policy}"),
        "action": action,
        "previous": previous,
        "closed": closed,
    }))
}

async fn delete_surge_rule(bridge: &'static Bridge, body: &Value) -> ApiResult {
    let (kind, value) = rule_target(body)?;
    let (policy, _) = bridge
        .edit_profile(|content| {
            let (next, policy) = edit::remove_rule(content, &kind, &value)?;
            Ok((Some(next), policy))
        })
        .await
        .map_err(|err| format!("{err:#}"))?;
    let closed = close_matching(&kind, &value).await;
    logging!(
        info,
        Type::Config,
        "[surge] rule {kind},{value},{policy} removed, closed {closed} connection(s)"
    );
    Ok(json!({ "rule": format!("{kind},{value},{policy}"), "closed": closed }))
}

/// Established connections keep their old route after a reload, so drop the ones the rule now covers.
async fn close_matching(kind: &str, value: &str) -> usize {
    let mihomo = Handle::mihomo();
    let connections = match mihomo.get_connections().await {
        Ok(connections) => connections.connections.unwrap_or_default(),
        Err(err) => {
            logging!(warn, Type::Config, "[surge] cannot list connections: {err}");
            return 0;
        }
    };
    let mut closed = 0;
    for connection in connections {
        let meta = &connection.metadata;
        let hit = [&meta.host, &meta.sniff_host]
            .iter()
            .any(|host| !host.is_empty() && host_matches(kind, value, host))
            || (!meta.destination_ip.is_empty() && ip_matches(kind, value, &meta.destination_ip));
        if hit && mihomo.close_connection(&connection.id).await.is_ok() {
            closed += 1;
        }
    }
    closed
}

fn host_matches(kind: &str, value: &str, host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    match kind {
        "DOMAIN" => host == value,
        "DOMAIN-SUFFIX" => host == value || host.ends_with(&format!(".{value}")),
        "DOMAIN-KEYWORD" => host.contains(value),
        _ => false,
    }
}

fn ip_matches(kind: &str, cidr: &str, ip: &str) -> bool {
    if !kind.starts_with("IP-CIDR") {
        return false;
    }
    let Some((network, prefix)) = cidr.split_once('/') else {
        return false;
    };
    let (Ok(network), Ok(ip), Ok(prefix)) = (
        network.parse::<std::net::IpAddr>(),
        ip.parse::<std::net::IpAddr>(),
        prefix.parse::<u32>(),
    ) else {
        return false;
    };
    let (network, ip, bits) = match (network, ip.to_canonical()) {
        (std::net::IpAddr::V4(n), std::net::IpAddr::V4(i)) => (u128::from(n.to_bits()), u128::from(i.to_bits()), 32),
        (std::net::IpAddr::V6(n), std::net::IpAddr::V6(i)) => (n.to_bits(), i.to_bits(), 128),
        _ => return false,
    };
    if prefix > bits {
        return false;
    }
    let shift = bits - prefix;
    shift == bits || network >> shift == ip >> shift
}
