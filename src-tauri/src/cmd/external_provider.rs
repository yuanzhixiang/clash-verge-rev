use super::{CmdResult, StringifyErr as _};
use crate::{core::handle, module::external_provider};
use anyhow::anyhow;

/// 更新 proxy provider：外部（Surge 列表）provider 先重新拉取转换写文件，
/// 再让内核重读；普通 provider 直接透传 mihomo 的更新接口。
#[tauri::command]
pub async fn update_proxy_provider_ex(name: String) -> CmdResult<()> {
    if external_provider::refresh_provider(&name).await.stringify_err()? {
        return Ok(());
    }
    handle::Handle::mihomo()
        .await
        .update_proxy_provider(&name)
        .await
        .map_err(|err| anyhow!("failed to update provider {name}: {err}"))
        .stringify_err()
}

/// 当前由外部节点列表适配层托管的 provider 名字列表。
#[tauri::command]
pub async fn get_external_proxy_providers() -> CmdResult<Vec<String>> {
    Ok(external_provider::list_external_providers())
}
