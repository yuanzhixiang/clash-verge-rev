use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::utils::dirs;

/// Fixed so the frontend and the CLI can find the server without discovery.
pub const PORT: u16 = 33380;
const FILE: &str = "fork.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Authenticates the CLI and keeps the subscription path unguessable.
    pub token: String,
    pub surge: SurgeSettings,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct SurgeSettings {
    pub enabled: bool,
    pub path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            token: nanoid::nanoid!(32),
            surge: SurgeSettings::default(),
        }
    }
}

impl Default for SurgeSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            path: default_surge_path(),
        }
    }
}

pub fn default_surge_path() -> String {
    ::dirs::home_dir()
        .map(|home| {
            home.join("Library/Mobile Documents/iCloud~com~nssurge~inc/Documents/Default.conf")
                .to_string_lossy()
                .into_owned()
        })
        .unwrap_or_default()
}

fn file_path() -> Result<PathBuf> {
    Ok(dirs::app_home_dir()?.join(FILE))
}

pub fn load() -> Result<Settings> {
    let path = file_path()?;
    let mut settings = match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content)?,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Settings::default(),
        Err(err) => return Err(err.into()),
    };
    if settings.token.is_empty() {
        settings.token = nanoid::nanoid!(32);
    }
    save(&settings)?;
    Ok(settings)
}

pub fn save(settings: &Settings) -> Result<()> {
    let path = file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_vec_pretty(settings)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}
