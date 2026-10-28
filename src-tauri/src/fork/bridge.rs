use std::{
    collections::HashMap,
    path::PathBuf,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context as _, Result, bail};
use clash_verge_logging::{Type, logging};
use parking_lot::RwLock;
use serde::Serialize;

use super::{
    settings::{self, PORT, Settings},
    surge::{
        node::convert_node_list,
        profile::{Remote, RemoteKind, Stats, convert_profile},
        rule::{convert_domain_set, convert_rule_set},
    },
};
use crate::{
    config::{Config, MixedPort},
    feat,
    utils::dirs,
};

const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const WATCH_INTERVAL: Duration = Duration::from_secs(3);

/// Modification time and size of the watched file.
type FileStamp = (Option<u64>, u64);

#[derive(Clone, Debug, Default, Serialize)]
pub struct Status {
    pub file_found: bool,
    pub file_modified_at: Option<u64>,
    pub converted_at: Option<u64>,
    pub stats: Stats,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

pub struct Bridge {
    settings: RwLock<Settings>,
    status: RwLock<Status>,
    remotes: RwLock<HashMap<String, Remote>>,
    cache: RwLock<HashMap<String, String>>,
}

static BRIDGE: OnceLock<Bridge> = OnceLock::new();

pub fn init(settings: Settings) -> &'static Bridge {
    BRIDGE.get_or_init(|| Bridge {
        settings: RwLock::new(settings),
        status: RwLock::new(Status::default()),
        remotes: RwLock::new(HashMap::new()),
        cache: RwLock::new(HashMap::new()),
    })
}

pub fn get() -> Option<&'static Bridge> {
    BRIDGE.get()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
}

fn modified_millis(meta: &std::fs::Metadata) -> Option<u64> {
    let elapsed = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(elapsed.as_millis()).ok()
}

fn cache_path(id: &str) -> Result<PathBuf> {
    Ok(dirs::app_home_dir()?.join("fork-cache").join(id))
}

impl Bridge {
    pub fn settings(&self) -> Settings {
        self.settings.read().clone()
    }

    pub fn status(&self) -> Status {
        self.status.read().clone()
    }

    pub fn token_matches(&self, candidate: &str) -> bool {
        self.settings.read().token == candidate
    }

    pub fn remote_base(&self) -> String {
        format!("http://127.0.0.1:{PORT}/surge/{}", self.settings.read().token)
    }

    pub fn subscription_url(&self) -> String {
        format!("{}/config.yaml", self.remote_base())
    }

    pub fn update_settings(&self, enabled: Option<bool>, path: Option<String>) -> Result<Settings> {
        let mut next = self.settings();
        if let Some(enabled) = enabled {
            next.surge.enabled = enabled;
        }
        if let Some(path) = path {
            next.surge.path = path;
        }
        settings::save(&next)?;
        *self.settings.write() = next.clone();
        Ok(next)
    }

    /// Reads and converts the Surge profile, returning the mihomo YAML.
    pub async fn convert(&self) -> Result<String> {
        let settings = self.settings();
        if !settings.surge.enabled {
            bail!("Surge bridge is disabled");
        }
        let path = PathBuf::from(&settings.surge.path);
        let result = async {
            let meta = tokio::fs::metadata(&path)
                .await
                .with_context(|| format!("cannot read {}", path.display()))?;
            let content = tokio::fs::read_to_string(&path).await?;
            Ok::<_, anyhow::Error>((modified_millis(&meta), content))
        }
        .await;

        let (modified, content) = match result {
            Ok(read) => read,
            Err(err) => {
                *self.status.write() = Status {
                    error: Some(format!("{err:#}")),
                    ..Status::default()
                };
                return Err(err);
            }
        };

        let conversion = convert_profile(&content, &self.remote_base());
        let yaml = serde_yaml_ng::to_string(&conversion.config)?;
        self.remotes.write().extend(conversion.remotes);
        *self.status.write() = Status {
            file_found: true,
            file_modified_at: modified,
            converted_at: Some(now_millis()),
            stats: conversion.stats,
            warnings: conversion.warnings,
            error: None,
        };
        Ok(yaml)
    }

    /// Serves a remote list converted to mihomo format, falling back to the last good copy.
    pub async fn remote(&self, id: &str) -> Result<String> {
        let remote = self
            .remotes
            .read()
            .get(id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("unknown remote {id}"))?;

        match fetch(&remote.url).await {
            Ok(body) => {
                let converted = convert_remote(remote.kind, &body)?;
                self.cache.write().insert(id.to_owned(), converted.clone());
                if let Ok(path) = cache_path(id) {
                    if let Some(parent) = path.parent() {
                        let _ = tokio::fs::create_dir_all(parent).await;
                    }
                    let _ = tokio::fs::write(&path, &converted).await;
                }
                Ok(converted)
            }
            Err(err) => {
                logging!(warn, Type::Config, "[surge] fetch {} failed: {err:#}", remote.url);
                let cached = self.cache.read().get(id).cloned();
                if let Some(cached) = cached {
                    return Ok(cached);
                }
                let path = cache_path(id)?;
                tokio::fs::read_to_string(&path)
                    .await
                    .with_context(|| format!("fetch failed and no cached copy: {err:#}"))
            }
        }
    }

    /// Re-pulls every Clash Verge profile that points at this bridge.
    pub async fn refresh_profiles(&self) -> Result<usize> {
        let base = self.remote_base();
        let uids: Vec<_> = Config::profiles()
            .await
            .latest_arc()
            .items
            .iter()
            .flatten()
            .filter(|item| item.url.as_ref().is_some_and(|url| url.starts_with(base.as_str())))
            .filter_map(|item| item.uid.clone())
            .collect();
        for uid in &uids {
            Box::pin(feat::update_profile(uid, None, true)).await?;
        }
        Ok(uids.len())
    }

    /// Polls the Surge file; iCloud replaces it atomically so file events are unreliable.
    pub async fn watch(&self) {
        // `None` until the configured path is first examined; a missing file is `Some((path, None))`.
        let mut last_seen: Option<(PathBuf, Option<FileStamp>)> = None;
        loop {
            let settings = self.settings();
            if settings.surge.enabled {
                let path = PathBuf::from(&settings.surge.path);
                let stamp = tokio::fs::metadata(&path)
                    .await
                    .ok()
                    .map(|meta| (modified_millis(&meta), meta.len()));
                let first = last_seen.as_ref().is_none_or(|(seen, _)| *seen != path);
                let changed = first || last_seen.as_ref().is_some_and(|(_, seen)| *seen != stamp);
                if changed {
                    last_seen = Some((path, stamp));
                    self.on_file_changed(first).await;
                }
            } else {
                last_seen = None;
            }
            tokio::time::sleep(WATCH_INTERVAL).await;
        }
    }

    async fn on_file_changed(&self, first: bool) {
        if let Err(err) = self.convert().await {
            logging!(warn, Type::Config, "[surge] conversion failed: {err:#}");
            return;
        }
        if first {
            return;
        }
        match self.refresh_profiles().await {
            Ok(count) => logging!(info, Type::Config, "[surge] profile changed, refreshed {count} subscription(s)"),
            Err(err) => logging!(warn, Type::Config, "[surge] refresh failed: {err:#}"),
        }
    }
}

fn convert_remote(kind: RemoteKind, body: &str) -> Result<String> {
    Ok(match kind {
        RemoteKind::ProxyList => {
            let list = convert_node_list(body);
            if !list.skipped.is_empty() {
                logging!(warn, Type::Config, "[surge] skipped proxies: {}", list.skipped.join("; "));
            }
            let mut doc = serde_yaml_ng::Mapping::new();
            doc.insert(
                "proxies".into(),
                serde_yaml_ng::Value::Sequence(list.proxies.into_iter().map(serde_yaml_ng::Value::Mapping).collect()),
            );
            serde_yaml_ng::to_string(&doc)?
        }
        RemoteKind::RuleSet => {
            let set = convert_rule_set(body);
            if set.dropped > 0 {
                logging!(info, Type::Config, "[surge] dropped {} unsupported rule-set lines", set.dropped);
            }
            set.content
        }
        RemoteKind::DomainSet => convert_domain_set(body).content,
    })
}

/// Direct first; then through the core's own mixed port for lists the network blocks.
async fn fetch(url: &str) -> Result<String> {
    let direct = reqwest::Client::builder().no_proxy().timeout(FETCH_TIMEOUT).build()?;
    match get_text(&direct, url).await {
        Ok(body) => Ok(body),
        Err(direct_err) => {
            let port = MixedPort::effective().await;
            let proxied = reqwest::Client::builder()
                .proxy(reqwest::Proxy::all(format!("http://127.0.0.1:{port}"))?)
                .timeout(FETCH_TIMEOUT)
                .build()?;
            get_text(&proxied, url)
                .await
                .with_context(|| format!("direct fetch failed ({direct_err:#}), proxied fetch failed too"))
        }
    }
}

async fn get_text(client: &reqwest::Client, url: &str) -> Result<String> {
    let response = client.get(url).send().await?.error_for_status()?;
    Ok(response.text().await?)
}
