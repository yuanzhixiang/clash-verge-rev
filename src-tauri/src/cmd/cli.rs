use super::{CmdResult, StringifyErr as _};
use crate::feat;
use tauri::AppHandle;

#[tauri::command]
pub fn get_cli_install_status(app_handle: AppHandle) -> CmdResult<feat::CliInstallStatus> {
    feat::get_cli_install_status(&app_handle).stringify_err()
}

#[tauri::command]
pub fn install_cli(app_handle: AppHandle) -> CmdResult<feat::CliInstallStatus> {
    feat::install_cli(&app_handle).stringify_err()
}

#[tauri::command]
pub fn uninstall_cli(app_handle: AppHandle) -> CmdResult<feat::CliInstallStatus> {
    feat::uninstall_cli(&app_handle).stringify_err()
}
