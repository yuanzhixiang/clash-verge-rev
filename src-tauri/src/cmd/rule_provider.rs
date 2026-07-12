use super::{CmdResult, StringifyErr as _};
use crate::{config::Config, utils::dirs};
use anyhow::{Context as _, Result, anyhow, bail};
use serde::Serialize;
use serde_yaml_ng::{Mapping, Value};
use smartstring::alias::String;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuleProviderContentUnavailableReason {
    Mrs,
    CachePathUnavailable,
    CacheMissing,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RuleProviderContent {
    Ready {
        provider_name: String,
        format: String,
        rules: Vec<String>,
    },
    Unavailable {
        reason: RuleProviderContentUnavailableReason,
    },
}

fn string_value<'a>(mapping: &'a Mapping, key: &str) -> Option<&'a str> {
    mapping.get(key).and_then(Value::as_str)
}

fn parse_payload(value: Option<&Value>) -> Result<Vec<String>> {
    let payload = value
        .and_then(Value::as_sequence)
        .ok_or_else(|| anyhow!("rule provider payload must be a string array"))?;

    payload
        .iter()
        .map(|rule| {
            rule.as_str()
                .map(String::from)
                .ok_or_else(|| anyhow!("rule provider payload must contain only strings"))
        })
        .collect()
}

fn parse_yaml_content(content: &str) -> Result<Vec<String>> {
    let value: Value = serde_yaml_ng::from_str(content).context("failed to parse rule provider YAML")?;
    let mapping = value
        .as_mapping()
        .ok_or_else(|| anyhow!("rule provider YAML must be a mapping"))?;
    parse_payload(mapping.get("payload"))
}

fn parse_text_content(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(String::from)
        .collect()
}

async fn resolve_cache_path(home_dir: &Path, configured_path: &str) -> Result<Option<PathBuf>> {
    let configured = Path::new(configured_path);
    let candidate = if configured.is_absolute() {
        configured.to_path_buf()
    } else {
        home_dir.join(configured)
    };

    if !tokio::fs::try_exists(&candidate).await.unwrap_or(false) {
        return Ok(None);
    }

    let canonical_home = tokio::fs::canonicalize(home_dir)
        .await
        .context("failed to resolve application home directory")?;
    let canonical_candidate = tokio::fs::canonicalize(&candidate)
        .await
        .context("failed to resolve rule provider cache path")?;

    if !canonical_candidate.starts_with(&canonical_home) {
        bail!("rule provider cache path is outside the application home directory");
    }

    Ok(Some(canonical_candidate))
}

async fn read_provider_content(runtime: &Mapping, home_dir: &Path, provider_name: &str) -> Result<RuleProviderContent> {
    let providers = runtime
        .get("rule-providers")
        .and_then(Value::as_mapping)
        .ok_or_else(|| anyhow!("runtime config has no rule providers"))?;
    let provider = providers
        .get(provider_name)
        .and_then(Value::as_mapping)
        .ok_or_else(|| anyhow!("rule provider not found: {provider_name}"))?;

    let provider_type = string_value(provider, "type").unwrap_or("http");
    let format = string_value(provider, "format").unwrap_or("yaml");

    if format.eq_ignore_ascii_case("mrs") {
        return Ok(RuleProviderContent::Unavailable {
            reason: RuleProviderContentUnavailableReason::Mrs,
        });
    }

    if provider_type.eq_ignore_ascii_case("inline") {
        return Ok(RuleProviderContent::Ready {
            provider_name: provider_name.into(),
            format: "inline".into(),
            rules: parse_payload(provider.get("payload"))?,
        });
    }

    let Some(configured_path) = string_value(provider, "path") else {
        return Ok(RuleProviderContent::Unavailable {
            reason: RuleProviderContentUnavailableReason::CachePathUnavailable,
        });
    };
    let Some(cache_path) = resolve_cache_path(home_dir, configured_path).await? else {
        return Ok(RuleProviderContent::Unavailable {
            reason: RuleProviderContentUnavailableReason::CacheMissing,
        });
    };
    let content = tokio::fs::read_to_string(&cache_path)
        .await
        .with_context(|| format!("failed to read rule provider cache: {}", cache_path.display()))?;
    let rules = if format.eq_ignore_ascii_case("text") {
        parse_text_content(&content)
    } else {
        parse_yaml_content(&content)?
    };

    Ok(RuleProviderContent::Ready {
        provider_name: provider_name.into(),
        format: format.to_ascii_lowercase().into(),
        rules,
    })
}

#[tauri::command]
pub async fn get_rule_provider_content(provider_name: String) -> CmdResult<RuleProviderContent> {
    let runtime = Config::runtime().await.latest_arc();
    let config = runtime
        .config
        .as_ref()
        .ok_or_else(|| anyhow!("runtime config is unavailable"))
        .stringify_err()?;
    let home_dir = dirs::app_home_dir().stringify_err()?;

    read_provider_content(config, &home_dir, &provider_name)
        .await
        .stringify_err()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("clash-verge-rule-provider-{name}-{nonce}"))
    }

    fn runtime_with_provider(name: &str, provider: Value) -> Mapping {
        let mut providers = Mapping::new();
        providers.insert(Value::String(name.into()), provider);
        let mut runtime = Mapping::new();
        runtime.insert(Value::String("rule-providers".into()), Value::Mapping(providers));
        runtime
    }

    #[test]
    fn parses_yaml_and_text_content() {
        assert_eq!(
            parse_yaml_content("payload:\n  - DOMAIN,example.com\n  - IP-CIDR,10.0.0.0/8\n").unwrap(),
            vec!["DOMAIN,example.com", "IP-CIDR,10.0.0.0/8"]
        );
        assert_eq!(
            parse_text_content("# comment\nexample.com\n\n  test.com  \n"),
            vec!["example.com", "test.com"]
        );
    }

    #[test]
    fn rejects_invalid_yaml_payload() {
        assert!(parse_yaml_content("payload: [valid, 42]").is_err());
    }

    #[test]
    fn serializes_frontend_contract_in_camel_case() {
        let value = serde_json::to_value(RuleProviderContent::Ready {
            provider_name: "example".into(),
            format: "yaml".into(),
            rules: vec!["DOMAIN,example.com".into()],
        })
        .unwrap();
        assert_eq!(value["status"], "ready");
        assert_eq!(value["providerName"], "example");

        let value = serde_json::to_value(RuleProviderContent::Unavailable {
            reason: RuleProviderContentUnavailableReason::CachePathUnavailable,
        })
        .unwrap();
        assert_eq!(value["reason"], "cachePathUnavailable");
    }

    #[tokio::test]
    async fn reads_inline_payload() {
        let runtime: Mapping = serde_yaml_ng::from_str(
            "rule-providers:\n  inline-set:\n    type: inline\n    behavior: domain\n    payload: [example.com, test.com]\n",
        )
        .unwrap();
        let result = read_provider_content(&runtime, Path::new("/unused"), "inline-set")
            .await
            .unwrap();
        assert_eq!(
            result,
            RuleProviderContent::Ready {
                provider_name: "inline-set".into(),
                format: "inline".into(),
                rules: vec!["example.com".into(), "test.com".into()],
            }
        );
    }

    #[tokio::test]
    async fn reports_mrs_and_missing_cache_states() {
        let mrs: Value = serde_yaml_ng::from_str("type: http\nformat: mrs\npath: rules/a.mrs").unwrap();
        let result = read_provider_content(&runtime_with_provider("a", mrs), Path::new("/unused"), "a")
            .await
            .unwrap();
        assert_eq!(
            result,
            RuleProviderContent::Unavailable {
                reason: RuleProviderContentUnavailableReason::Mrs,
            }
        );

        let no_path: Value = serde_yaml_ng::from_str("type: http\nformat: yaml").unwrap();
        let result = read_provider_content(&runtime_with_provider("a", no_path), Path::new("/unused"), "a")
            .await
            .unwrap();
        assert_eq!(
            result,
            RuleProviderContent::Unavailable {
                reason: RuleProviderContentUnavailableReason::CachePathUnavailable,
            }
        );
    }

    #[tokio::test]
    async fn reads_cache_and_rejects_path_escape() {
        let home = temp_dir("home");
        tokio::fs::create_dir_all(home.join("rules")).await.unwrap();
        tokio::fs::write(home.join("rules/list.txt"), "example.com\n")
            .await
            .unwrap();
        let provider: Value = serde_yaml_ng::from_str("type: file\nformat: text\npath: rules/list.txt").unwrap();
        let result = read_provider_content(&runtime_with_provider("a", provider), &home, "a")
            .await
            .unwrap();
        assert!(matches!(result, RuleProviderContent::Ready { .. }));

        let outside = temp_dir("outside");
        tokio::fs::create_dir_all(&outside).await.unwrap();
        let outside_file = outside.join("list.txt");
        tokio::fs::write(&outside_file, "example.com\n").await.unwrap();
        let provider: Value =
            serde_yaml_ng::from_str(&format!("type: file\nformat: text\npath: {}", outside_file.display())).unwrap();
        assert!(
            read_provider_content(&runtime_with_provider("a", provider), &home, "a")
                .await
                .is_err()
        );

        let _ = tokio::fs::remove_dir_all(home).await;
        let _ = tokio::fs::remove_dir_all(outside).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let home = temp_dir("symlink-home");
        let outside = temp_dir("symlink-outside");
        tokio::fs::create_dir_all(&home).await.unwrap();
        tokio::fs::create_dir_all(&outside).await.unwrap();
        tokio::fs::write(outside.join("list.txt"), "example.com\n")
            .await
            .unwrap();
        symlink(outside.join("list.txt"), home.join("list.txt")).unwrap();
        let provider: Value = serde_yaml_ng::from_str("type: file\nformat: text\npath: list.txt").unwrap();
        assert!(
            read_provider_content(&runtime_with_provider("a", provider), &home, "a")
                .await
                .is_err()
        );

        let _ = tokio::fs::remove_dir_all(home).await;
        let _ = tokio::fs::remove_dir_all(outside).await;
    }
}
