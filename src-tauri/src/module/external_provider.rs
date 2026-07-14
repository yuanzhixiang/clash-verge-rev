//! Surge policy-path 外部节点列表 → mihomo file provider 适配层。
//!
//! Profile 中通过 fork 私有字段声明：
//!
//! ```yaml
//! proxy-providers:
//!   self:
//!     type: http
//!     url: https://example.com/surge-node-list.conf
//!     verge-format: surge
//!     interval: 3600   # 秒，0 表示不自动更新，缺省 3600
//!     ua: my-agent     # 可选，覆盖默认 User-Agent
//! ```
//!
//! enhance 阶段（`cleanup_proxy_groups` 之前）拦截这类 provider：拉取 URL、
//! 自动识别内容（mihomo YAML 直接抽取 / Surge 行列表转换）、写入
//! `providers/verge-ext-*.yaml`，再把条目重写为 `type: file` 交给内核；
//! 内核与验证器永远看不到 `verge-format` 等私有字段。拉取或转换失败时
//! 删除该 provider 条目并弹通知，组内引用由后续 `cleanup_proxy_groups`
//! 自动清理。

use std::{
    collections::{HashMap, HashSet},
    hash::{Hash as _, Hasher as _},
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use anyhow::{Context as _, Result, anyhow, bail};
use clash_verge_logging::{Type, logging};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde_yaml_ng::{Mapping, Value};
use tokio::fs;

use crate::{
    config::Config,
    core::handle,
    process::AsyncHandler,
    utils::{
        dirs,
        network::{NetworkManager, ProxyType},
    },
};

const FORMAT_KEY: &str = "verge-format";
const FORMAT_SURGE: &str = "surge";
const UA_KEY: &str = "ua";
const FILE_PREFIX: &str = "verge-ext-";
const PROVIDERS_DIR: &str = "providers";
const DEFAULT_INTERVAL_SECS: u64 = 3600;
const FETCH_TIMEOUT_SECS: u64 = 20;
const SCHEDULER_TICK_SECS: u64 = 60;

/// 一个外部节点列表 provider 的声明。
#[derive(Clone, Debug)]
pub struct ExternalProviderSpec {
    pub name: String,
    pub url: String,
    pub user_agent: Option<String>,
    /// 0 表示不自动更新。
    pub interval_secs: u64,
    /// `providers/` 下的缓存文件名。
    pub file_name: String,
}

static REGISTRY: Lazy<RwLock<HashMap<String, ExternalProviderSpec>>> = Lazy::new(|| RwLock::new(HashMap::new()));
static SCHEDULER_STARTED: AtomicBool = AtomicBool::new(false);

fn key(name: &str) -> Value {
    Value::String(name.into())
}

/// enhance 管线入口：拦截 `verge-format: surge` 的 provider 并重写为
/// file provider。任何失败只影响对应条目，不让 enhance 整体失败。
pub async fn use_external_providers(mut config: Mapping) -> Mapping {
    let specs = {
        let Some(providers) = config.get("proxy-providers").and_then(Value::as_mapping) else {
            update_registry(Vec::new()).await;
            return config;
        };
        collect_specs(providers)
    };

    if specs.is_empty() {
        update_registry(Vec::new()).await;
        return config;
    }

    let mut ready: Vec<ExternalProviderSpec> = Vec::new();
    let mut failed: Vec<String> = Vec::new();

    for spec in specs {
        match spec {
            Ok(spec) => {
                if ensure_cache_file(&spec).await {
                    ready.push(spec);
                } else {
                    failed.push(spec.name);
                }
            }
            Err((name, error)) => {
                logging!(
                    error,
                    Type::Config,
                    "external provider {name} has invalid declaration: {error:#}"
                );
                handle::Handle::notice_message("config_validate::error", format!("{name}: {error}"));
                failed.push(name);
            }
        }
    }

    if let Some(providers) = config.get_mut("proxy-providers").and_then(Value::as_mapping_mut) {
        for name in &failed {
            providers.remove(key(name));
        }
        for spec in &ready {
            if let Some(entry) = providers.get_mut(key(&spec.name)).and_then(Value::as_mapping_mut) {
                rewrite_entry(entry, spec);
            }
        }
    }

    update_registry(ready).await;
    ensure_scheduler();
    config
}

/// 判断某个 provider 是否由本适配层托管。
pub fn is_external_provider(name: &str) -> bool {
    REGISTRY.read().contains_key(name)
}

/// 当前托管的 provider 名字列表。
pub fn list_external_providers() -> Vec<String> {
    REGISTRY.read().keys().cloned().collect()
}

/// 手动/定时刷新：重新拉取转换写文件，并让内核重读该 provider。
/// 返回 `Ok(false)` 表示该名字不是外部 provider。
pub async fn refresh_provider(name: &str) -> Result<bool> {
    let spec = REGISTRY.read().get(name).cloned();
    let Some(spec) = spec else {
        return Ok(false);
    };
    fetch_and_write(&spec).await?;
    handle::Handle::mihomo()
        .await
        .update_proxy_provider(&spec.name)
        .await
        .map_err(|err| anyhow!("failed to reload provider {}: {err}", spec.name))?;
    handle::Handle::refresh_clash();
    Ok(true)
}

type SpecParseResult = std::result::Result<ExternalProviderSpec, (String, anyhow::Error)>;

fn collect_specs(providers: &Mapping) -> Vec<SpecParseResult> {
    providers
        .iter()
        .filter_map(|(name_value, entry_value)| {
            let name = name_value.as_str()?;
            let entry = entry_value.as_mapping()?;
            if entry.get(FORMAT_KEY).and_then(Value::as_str) != Some(FORMAT_SURGE) {
                return None;
            }
            Some(parse_spec(name, entry).map_err(|error| (name.to_string(), error)))
        })
        .collect()
}

fn parse_spec(name: &str, entry: &Mapping) -> Result<ExternalProviderSpec> {
    let url = entry
        .get("url")
        .and_then(Value::as_str)
        .context("missing `url`")?
        .trim()
        .to_string();
    if url.is_empty() {
        bail!("missing `url`");
    }
    let interval_secs = match entry.get("interval") {
        None => DEFAULT_INTERVAL_SECS,
        Some(value) => value.as_u64().ok_or_else(|| anyhow!("invalid `interval`: {value:?}"))?,
    };
    let user_agent = entry.get(UA_KEY).and_then(Value::as_str).map(str::to_string);
    Ok(ExternalProviderSpec {
        name: name.to_string(),
        url: url.clone(),
        user_agent,
        interval_secs,
        file_name: cache_file_name(name, &url),
    })
}

fn cache_file_name(name: &str, url: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let mut hasher = std::hash::DefaultHasher::new();
    url.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{FILE_PREFIX}{sanitized}-{:08x}.yaml", (hash as u32))
}

fn providers_dir() -> Result<PathBuf> {
    Ok(dirs::app_home_dir()?.join(PROVIDERS_DIR))
}

fn cache_file_path(file_name: &str) -> Result<PathBuf> {
    Ok(providers_dir()?.join(file_name))
}

/// 确保缓存文件存在；不存在时同步拉取。返回是否可用。
async fn ensure_cache_file(spec: &ExternalProviderSpec) -> bool {
    match cache_file_path(&spec.file_name) {
        Ok(path) if path.is_file() => true,
        Ok(_) => match fetch_and_write(spec).await {
            Ok(()) => true,
            Err(error) => {
                logging!(
                    error,
                    Type::Config,
                    "external provider {} initial fetch failed: {error:#}",
                    spec.name
                );
                handle::Handle::notice_message("config_validate::error", format!("{}: {error}", spec.name));
                false
            }
        },
        Err(error) => {
            logging!(error, Type::Config, "external provider dir unavailable: {error:#}");
            false
        }
    }
}

/// 拉取 → 识别/转换 → 原子写入缓存文件。
async fn fetch_and_write(spec: &ExternalProviderSpec) -> Result<()> {
    let content = fetch_content(spec).await?;
    let output = clash_verge_surge::convert_node_list(&content);
    for skipped in &output.skipped {
        logging!(
            warn,
            Type::Config,
            "external provider {} skipped line {} ({}): {}",
            spec.name,
            skipped.line_no,
            skipped.name.as_deref().unwrap_or("-"),
            skipped.reason
        );
    }
    if output.proxies.is_empty() {
        bail!("no usable proxies parsed from {}", spec.url);
    }

    let proxy_count = output.proxies.len();
    let mut doc = Mapping::new();
    doc.insert(
        key("proxies"),
        Value::Sequence(output.proxies.into_iter().map(Value::Mapping).collect()),
    );
    let body = serde_yaml_ng::to_string(&doc)?;
    let header = format!(
        "# Generated by Clash Verge (external provider)\n# source: {}\n",
        spec.url
    );

    let path = cache_file_path(&spec.file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let tmp_path = path.with_extension("yaml.tmp");
    fs::write(&tmp_path, format!("{header}{body}")).await?;
    fs::rename(&tmp_path, &path).await?;
    logging!(
        info,
        Type::Config,
        "external provider {} updated: {} proxies, {} skipped",
        spec.name,
        proxy_count,
        output.skipped.len()
    );
    Ok(())
}

async fn fetch_content(spec: &ExternalProviderSpec) -> Result<String> {
    let mut last_error = anyhow!("unreachable");
    for proxy_type in [ProxyType::None, ProxyType::Localhost] {
        match NetworkManager::new()
            .get_with_interrupt(
                &spec.url,
                proxy_type,
                Some(FETCH_TIMEOUT_SECS),
                spec.user_agent.as_deref().map(Into::into),
                false,
            )
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                return Ok(resp.text_with_charset()?.to_string());
            }
            Ok(resp) => last_error = anyhow!("unexpected status {}", resp.status()),
            Err(error) => last_error = error,
        }
    }
    Err(last_error.context(format!("failed to fetch {}", spec.url)))
}

/// 把声明条目重写为内核可见的 file provider。
fn rewrite_entry(entry: &mut Mapping, spec: &ExternalProviderSpec) {
    entry.remove(key("url"));
    entry.remove(key("interval"));
    entry.remove(key(FORMAT_KEY));
    entry.remove(key(UA_KEY));
    entry.remove(key("proxy"));
    entry.insert(key("type"), Value::String("file".into()));
    entry.insert(
        key("path"),
        Value::String(format!("{PROVIDERS_DIR}/{}", spec.file_name)),
    );
    if !entry.contains_key(key("health-check")) {
        let mut health_check = Mapping::new();
        health_check.insert(key("enable"), Value::Bool(true));
        health_check.insert(
            key("url"),
            Value::String("https://cp.cloudflare.com/generate_204".into()),
        );
        health_check.insert(key("interval"), Value::Number(300.into()));
        health_check.insert(key("lazy"), Value::Bool(true));
        entry.insert(key("health-check"), Value::Mapping(health_check));
    }
}

async fn update_registry(specs: Vec<ExternalProviderSpec>) {
    let changed = {
        let mut registry = REGISTRY.write();
        let next: HashMap<String, ExternalProviderSpec> =
            specs.into_iter().map(|spec| (spec.name.clone(), spec)).collect();
        let changed = registry.keys().collect::<HashSet<_>>() != next.keys().collect::<HashSet<_>>();
        *registry = next;
        changed
    };
    if changed {
        cleanup_orphan_files().await;
    }
}

/// 删除既不在注册表、也不被当前运行时配置引用的缓存文件。
async fn cleanup_orphan_files() {
    let Ok(dir) = providers_dir() else { return };
    let keep: HashSet<String> = REGISTRY.read().values().map(|spec| spec.file_name.clone()).collect();
    let runtime_refs = runtime_referenced_files().await;
    let Ok(mut entries) = fs::read_dir(&dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if file_name.starts_with(FILE_PREFIX)
            && file_name.ends_with(".yaml")
            && !keep.contains(&file_name)
            && !runtime_refs.contains(&file_name)
        {
            if let Err(error) = fs::remove_file(entry.path()).await {
                logging!(
                    warn,
                    Type::Config,
                    "failed to remove orphan provider file {file_name}: {error:#}"
                );
            }
        }
    }
}

/// 当前已生效运行时配置里 file provider 引用的缓存文件名集合。
async fn runtime_referenced_files() -> HashSet<String> {
    let mut referenced = HashSet::new();
    let runtime = Config::runtime().await.latest_arc().config.clone();
    let Some(config) = runtime else {
        return referenced;
    };
    let Some(providers) = config.get("proxy-providers").and_then(Value::as_mapping) else {
        return referenced;
    };
    for (_, entry) in providers {
        if let Some(path) = entry
            .as_mapping()
            .and_then(|map| map.get("path"))
            .and_then(Value::as_str)
            && let Some(file_name) = path.rsplit('/').next()
        {
            referenced.insert(file_name.to_string());
        }
    }
    referenced
}

/// 缓存文件是否已超过更新间隔（以文件 mtime 为准，跨重启有效）。
fn is_stale(spec: &ExternalProviderSpec) -> bool {
    if spec.interval_secs == 0 {
        return false;
    }
    let Ok(path) = cache_file_path(&spec.file_name) else {
        return false;
    };
    match path.metadata().and_then(|meta| meta.modified()) {
        Ok(modified) => modified
            .elapsed()
            .map(|elapsed| elapsed.as_secs() >= spec.interval_secs)
            .unwrap_or(false),
        // 文件缺失也视为需要更新（可能被外部删除）
        Err(_) => true,
    }
}

fn ensure_scheduler() {
    if REGISTRY.read().is_empty() || SCHEDULER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    AsyncHandler::spawn(move || async move {
        loop {
            tokio::time::sleep(Duration::from_secs(SCHEDULER_TICK_SECS)).await;
            let due: Vec<ExternalProviderSpec> = REGISTRY
                .read()
                .values()
                .filter(|spec| is_stale(spec))
                .cloned()
                .collect();
            for spec in due {
                match refresh_provider(&spec.name).await {
                    Ok(_) => {}
                    Err(error) => {
                        logging!(
                            warn,
                            Type::Config,
                            "external provider {} scheduled refresh failed: {error:#}",
                            spec.name
                        );
                    }
                }
            }
        }
    });
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn mapping(yaml: &str) -> Mapping {
        serde_yaml_ng::from_str(yaml).expect("valid test yaml")
    }

    #[test]
    fn collects_only_surge_format_providers() {
        let providers = mapping(
            r"
plain:
  type: http
  url: https://example.com/a.yaml
surge-one:
  type: http
  url: https://example.com/nodes.conf
  verge-format: surge
  interval: 600
  ua: custom-agent
broken:
  verge-format: surge
",
        );
        let specs = collect_specs(&providers);
        assert_eq!(specs.len(), 2);
        let ok = specs.iter().find_map(|spec| spec.as_ref().ok()).unwrap();
        assert_eq!(ok.name, "surge-one");
        assert_eq!(ok.interval_secs, 600);
        assert_eq!(ok.user_agent.as_deref(), Some("custom-agent"));
        assert!(ok.file_name.starts_with("verge-ext-surge-one-"));
        let err = specs.iter().find_map(|spec| spec.as_ref().err()).unwrap();
        assert_eq!(err.0, "broken");
    }

    #[test]
    fn rewrites_entry_to_file_provider() {
        let mut entry = mapping(
            r"
type: http
url: https://example.com/nodes.conf
verge-format: surge
interval: 600
ua: custom-agent
filter: HK
",
        );
        let spec = parse_spec("self", &entry).unwrap();
        rewrite_entry(&mut entry, &spec);
        assert_eq!(entry.get(key("type")).and_then(Value::as_str), Some("file"));
        assert!(
            entry
                .get(key("path"))
                .and_then(Value::as_str)
                .unwrap()
                .starts_with("providers/verge-ext-self-")
        );
        assert!(entry.get(key("url")).is_none());
        assert!(entry.get(key(FORMAT_KEY)).is_none());
        assert!(entry.get(key(UA_KEY)).is_none());
        assert!(entry.get(key("interval")).is_none());
        // 透传字段保留，注入默认 health-check
        assert_eq!(entry.get(key("filter")).and_then(Value::as_str), Some("HK"));
        assert!(entry.get(key("health-check")).is_some());
    }

    #[test]
    fn cache_file_name_is_sanitized_and_stable() {
        let a = cache_file_name("自建 HK", "https://example.com/a");
        let b = cache_file_name("自建 HK", "https://example.com/a");
        let c = cache_file_name("自建 HK", "https://example.com/b");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert!(a.starts_with(FILE_PREFIX));
        assert!(a.ends_with(".yaml"));
        assert!(a.is_ascii());
    }
}
