use anyhow::{Context as _, Result, anyhow, bail};
use serde::Serialize;
use serde_yaml_ng::{Mapping, Value as YamlValue};
use smartstring::alias::String;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::fs;

use super::PrfItem;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileFormat {
    Yaml,
    Conf,
}

impl ProfileFormat {
    pub fn from_path(path: &Path) -> Result<Self> {
        match path.extension().and_then(|value| value.to_str()) {
            Some("yaml" | "yml") => Ok(Self::Yaml),
            Some("conf") => Ok(Self::Conf),
            _ => bail!("unsupported profile format: {}", path.display()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedProfileFile {
    pub path: PathBuf,
    pub file_name: String,
    pub format: ProfileFormat,
    pub conf_override: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileConversionResult {
    pub source_file: String,
    pub target_file: String,
    pub overwritten: bool,
}

pub fn is_main_profile(item: &PrfItem) -> bool {
    matches!(item.itype.as_deref(), Some("local" | "remote"))
}

fn sibling_with_extension(file: &str, extension: &str) -> Option<String> {
    let path = Path::new(file);
    match path.extension().and_then(|value| value.to_str()) {
        Some("yaml" | "yml") => Some(path.with_extension(extension).to_string_lossy().into_owned().into()),
        _ => None,
    }
}

pub fn conf_sibling(file: &str) -> Option<String> {
    sibling_with_extension(file, "conf")
}

pub fn legacy_toml_sibling(file: &str) -> Option<String> {
    sibling_with_extension(file, "toml")
}

pub async fn resolve(item: &PrfItem, profiles_dir: &Path) -> Result<ResolvedProfileFile> {
    let declared = item
        .file
        .as_deref()
        .ok_or_else(|| anyhow!("profile file field is null"))?;
    if is_main_profile(item)
        && let Some(conf_file) = conf_sibling(declared)
    {
        let conf_path = profiles_dir.join(conf_file.as_str());
        if fs::try_exists(&conf_path).await.unwrap_or(false) {
            return Ok(ResolvedProfileFile {
                path: conf_path,
                file_name: conf_file,
                format: ProfileFormat::Conf,
                conf_override: true,
            });
        }
    }

    let path = profiles_dir.join(declared);
    Ok(ResolvedProfileFile {
        format: ProfileFormat::from_path(&path)?,
        path,
        file_name: declared.into(),
        conf_override: false,
    })
}

pub async fn read_mapping(path: &Path) -> Result<Mapping> {
    let content = fs::read_to_string(path)
        .await
        .with_context(|| format!("failed to read profile file \"{}\"", path.display()))?;
    parse_mapping(&content, ProfileFormat::from_path(path)?)
        .with_context(|| format!("failed to parse profile file \"{}\"", path.display()))
}

pub fn parse_mapping(content: &str, format: ProfileFormat) -> Result<Mapping> {
    match format {
        ProfileFormat::Yaml => {
            let mut value: YamlValue = serde_yaml_ng::from_str(content).context("YAML syntax error")?;
            value.apply_merge().context("failed to apply YAML merge")?;
            value
                .as_mapping()
                .cloned()
                .ok_or_else(|| anyhow!("YAML profile root must be a mapping"))
        }
        ProfileFormat::Conf => clash_verge_surge::parse_profile(content).context("CONF syntax error"),
    }
}

pub fn yaml_to_conf_string(content: &str) -> Result<String> {
    let expected = parse_mapping(content, ProfileFormat::Yaml)?;
    let output = clash_verge_surge::serialize_profile(&expected).context("failed to serialize CONF")?;
    let reparsed = parse_mapping(&output, ProfileFormat::Conf)?;
    if expected != reparsed {
        bail!("CONF round-trip validation failed")
    }
    Ok(output.into())
}

fn temporary_sibling(path: &Path) -> PathBuf {
    let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("profile.conf");
    path.with_file_name(format!(".{file_name}.{}.{}.tmp", std::process::id(), sequence))
}

pub async fn replace_file_atomically(path: &Path, content: &[u8]) -> Result<()> {
    let temp_path = temporary_sibling(path);
    fs::write(&temp_path, content)
        .await
        .with_context(|| format!("failed to write temporary profile \"{}\"", temp_path.display()))?;
    let destination_exists = fs::try_exists(path).await.unwrap_or(false);
    if let Err(first_error) = fs::rename(&temp_path, path).await {
        if !destination_exists {
            let _ = fs::remove_file(&temp_path).await;
            return Err(first_error).context("failed to atomically install profile");
        }
        fs::remove_file(path).await?;
        if let Err(error) = fs::rename(&temp_path, path).await {
            let _ = fs::remove_file(&temp_path).await;
            return Err(error).context("failed to install profile after removing the old file");
        }
    }
    Ok(())
}

pub async fn restore_conf_override(path: &Path, previous_content: Option<&[u8]>) -> Result<()> {
    match previous_content {
        Some(content) => replace_file_atomically(path, content).await,
        None => match fs::remove_file(path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error).with_context(|| format!("failed to remove CONF override \"{}\"", path.display())),
        },
    }
}

pub async fn convert_declared_yaml_to_conf(
    item: &PrfItem,
    profiles_dir: &Path,
    force: bool,
) -> Result<ProfileConversionResult> {
    if !is_main_profile(item) {
        bail!("CONF conversion only supports local or remote main profiles")
    }
    let source_file = item
        .file
        .as_deref()
        .ok_or_else(|| anyhow!("profile file field is null"))?;
    let target_file = conf_sibling(source_file).ok_or_else(|| anyhow!("declared profile file must be YAML"))?;
    let source_path = profiles_dir.join(source_file);
    let target_path = profiles_dir.join(target_file.as_str());
    let overwritten = fs::try_exists(&target_path).await.unwrap_or(false);
    if overwritten && !force {
        bail!("target CONF profile already exists; use --force to overwrite")
    }

    let source = fs::read_to_string(&source_path)
        .await
        .with_context(|| format!("failed to read source profile \"{}\"", source_path.display()))?;
    let output = yaml_to_conf_string(&source)?;
    replace_file_atomically(&target_path, output.as_bytes()).await?;

    Ok(ProfileConversionResult {
        source_file: source_file.into(),
        target_file,
        overwritten,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn converts_complete_profile_without_losing_nulls() {
        let yaml = r#"
proxies:
  - name: entry
    type: vless
    server: example.com
    port: 443
    flow: null
    ws-opts:
      headers:
        Host: example.com
proxy-groups:
  - name: PROXY
    type: select
    proxies: [entry]
rules: [MATCH,PROXY]
"#;
        let conf = yaml_to_conf_string(yaml).expect("conversion should succeed");
        let mapping = parse_mapping(&conf, ProfileFormat::Conf).expect("CONF should parse");
        assert!(mapping.contains_key("proxies"));
        assert!(conf.contains("flow=null"));
    }

    #[test]
    fn rejects_unsupported_conf_section_with_line() {
        let error = parse_mapping("[MITM]\nenable = true", ProfileFormat::Conf).unwrap_err();
        assert!(format!("{error:#}").contains("line 1"));
    }

    #[tokio::test]
    async fn resolves_converts_and_falls_back_to_yaml() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("clash-verge-profile-format-{suffix}"));
        fs::create_dir_all(&dir)
            .await
            .expect("temp directory should be created");
        let item = PrfItem {
            itype: Some("local".into()),
            file: Some("Ltest.yaml".into()),
            ..Default::default()
        };
        fs::write(dir.join("Ltest.yaml"), "proxies: []\nflow: null\n")
            .await
            .expect("fixture should be written");
        fs::write(dir.join("Ltest.toml"), "ignored = true\n")
            .await
            .expect("legacy TOML should be written");

        let initial = resolve(&item, &dir).await.expect("YAML should resolve");
        assert_eq!(initial.format, ProfileFormat::Yaml);

        let result = convert_declared_yaml_to_conf(&item, &dir, false)
            .await
            .expect("conversion should succeed");
        assert!(!result.overwritten);
        assert!(dir.join("Ltest.yaml").exists());
        assert!(dir.join("Ltest.toml").exists());

        let overridden = resolve(&item, &dir).await.expect("CONF should resolve");
        assert_eq!(overridden.format, ProfileFormat::Conf);
        assert!(overridden.conf_override);
        assert!(convert_declared_yaml_to_conf(&item, &dir, false).await.is_err());
        assert!(convert_declared_yaml_to_conf(&item, &dir, true).await.is_ok());

        fs::write(dir.join("Ltest.conf"), "[Unknown]\na = 1")
            .await
            .expect("invalid override should be written");
        let authoritative = resolve(&item, &dir).await.expect("override should resolve");
        assert_eq!(authoritative.format, ProfileFormat::Conf);
        assert!(read_mapping(&authoritative.path).await.is_err());

        fs::remove_file(dir.join("Ltest.conf"))
            .await
            .expect("override should be removed");
        assert_eq!(resolve(&item, &dir).await.unwrap().format, ProfileFormat::Yaml);
        fs::remove_dir_all(&dir)
            .await
            .expect("temp directory should be removed");
    }

    #[tokio::test]
    async fn restores_or_removes_conf_override() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("clash-verge-profile-rollback-{suffix}"));
        fs::create_dir_all(&dir)
            .await
            .expect("temp directory should be created");
        let target = dir.join("Ltest.conf");
        fs::write(&target, b"[General]\nnew = true\n").await.unwrap();
        restore_conf_override(&target, Some(b"[General]\nold = true\n"))
            .await
            .expect("old override should be restored");
        assert_eq!(fs::read(&target).await.unwrap(), b"[General]\nold = true\n");
        restore_conf_override(&target, None)
            .await
            .expect("new override should be removed");
        assert!(!target.exists());
        fs::remove_dir_all(&dir).await.unwrap();
        assert!(restore_conf_override(&target, Some(b"old = true\n")).await.is_err());
    }
}
