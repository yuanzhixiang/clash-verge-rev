use anyhow::{Result, anyhow};
use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
};
use tauri::Manager as _;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt as _;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstallStatus {
    pub installed: bool,
    pub version_matches: bool,
    pub path: String,
    pub install_dir: String,
    pub source_path: Option<String>,
}

pub fn get_cli_install_status(app_handle: &tauri::AppHandle) -> Result<CliInstallStatus> {
    cli_install_status(app_handle)
}

pub fn install_cli(app_handle: &tauri::AppHandle) -> Result<CliInstallStatus> {
    let source = find_cli_source(app_handle)?;
    let dest = installed_cli_path()?;
    let install_dir = dest
        .parent()
        .ok_or_else(|| anyhow!("failed to resolve CLI install directory"))?;

    fs::create_dir_all(install_dir)?;
    fs::copy(&source, &dest)?;

    #[cfg(unix)]
    fs::set_permissions(&dest, fs::Permissions::from_mode(0o755))?;

    #[cfg(windows)]
    ensure_user_path(install_dir)?;

    cli_install_status(app_handle)
}

pub fn uninstall_cli(app_handle: &tauri::AppHandle) -> Result<CliInstallStatus> {
    let dest = installed_cli_path()?;
    if dest.exists() {
        fs::remove_file(&dest)?;
    }
    cli_install_status(app_handle)
}

fn cli_install_status(app_handle: &tauri::AppHandle) -> Result<CliInstallStatus> {
    let dest = installed_cli_path()?;
    let source = find_cli_source(app_handle).ok();
    let installed = dest.is_file();
    let version_matches = installed
        && source
            .as_ref()
            .is_some_and(|source_path| files_equal(source_path, &dest));
    let install_dir = dest
        .parent()
        .ok_or_else(|| anyhow!("failed to resolve CLI install directory"))?;

    Ok(CliInstallStatus {
        installed,
        version_matches,
        path: path_string(&dest),
        install_dir: path_string(install_dir),
        source_path: source.as_ref().map(|path| path_string(path)),
    })
}

fn installed_cli_path() -> Result<PathBuf> {
    Ok(user_bin_dir()?.join(cli_exe_name()))
}

#[cfg(windows)]
fn user_bin_dir() -> Result<PathBuf> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|home| home.join("AppData").join("Local")))
        .map(|dir| dir.join("Clash Verge").join("bin"))
        .ok_or_else(|| anyhow!("failed to resolve LOCALAPPDATA"))
}

#[cfg(not(windows))]
fn user_bin_dir() -> Result<PathBuf> {
    if let Some(dir) = env::var_os("XDG_BIN_HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    home_dir()
        .map(|home| home.join(".local").join("bin"))
        .ok_or_else(|| anyhow!("failed to resolve HOME"))
}

fn find_cli_source(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let target_file = sidecar_file_name();
    let plain_file = cli_exe_name();
    for dir in source_dirs(app_handle) {
        for file in [&target_file, &plain_file] {
            let path = dir.join(file);
            if path.is_file() {
                return Ok(path);
            }
        }
    }
    Err(anyhow!(
        "vergectl sidecar not found; run `pnpm run prebuild {}` first",
        target_triple()
    ))
}

fn source_dirs(app_handle: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        dirs.push(resource_dir.clone());
        dirs.push(resource_dir.join("sidecar"));
    }

    if let Ok(exe_path) = tauri::utils::platform::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        dirs.push(exe_dir.to_path_buf());
        dirs.push(exe_dir.join("sidecar"));
    }

    if let Ok(cwd) = env::current_dir() {
        dirs.push(cwd.join("src-tauri").join("sidecar"));
        dirs.push(cwd.join("target").join(target_triple()).join("debug"));
        dirs.push(cwd.join("target").join(target_triple()).join("release"));
    }

    dirs
}

fn files_equal(left: &Path, right: &Path) -> bool {
    fs::read(left)
        .ok()
        .zip(fs::read(right).ok())
        .is_some_and(|(left, right)| left == right)
}

fn sidecar_file_name() -> String {
    format!("vergectl-{}{}", target_triple(), exe_suffix())
}

fn cli_exe_name() -> String {
    format!("vergectl{}", exe_suffix())
}

fn exe_suffix() -> &'static str {
    if cfg!(windows) { ".exe" } else { "" }
}

fn target_triple() -> &'static str {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("linux", "arm") => "armv7-unknown-linux-gnueabihf",
        ("linux", "riscv64") => "riscv64gc-unknown-linux-gnu",
        ("linux", "loongarch64") => "loongarch64-unknown-linux-gnu",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("windows", "x86") => "i686-pc-windows-msvc",
        ("windows", "aarch64") => "aarch64-pc-windows-msvc",
        _ => "unknown-target",
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(windows)]
fn ensure_user_path(dir: &Path) -> Result<()> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (env_key, _) = hkcu.create_subkey("Environment")?;
    let current_path: String = env_key.get_value("Path").unwrap_or_default();
    let dir_text = path_string(dir);
    let exists = current_path
        .split(';')
        .any(|entry| entry.trim_matches('"').eq_ignore_ascii_case(&dir_text));

    if !exists {
        let new_path = if current_path.trim().is_empty() {
            dir_text
        } else {
            format!("{current_path};{dir_text}")
        };
        env_key.set_value("Path", &new_path)?;
    }

    Ok(())
}
