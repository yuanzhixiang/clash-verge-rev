//! rules 链声明的「保留但禁用」规则重放。
//!
//! 内核在 reload 配置时会把整张规则表重建，`disabled` 标记随之清空，所以禁用状态
//! 不能只活在内核运行时里。真实状态存在 rules 增强链的 `disabled` 段（存规则原文，
//! 见 [`crate::enhance::seq::SeqMap`]），每次配置 apply 之后由这里把原文解析成当前
//! 规则表下标，再调用内核 `PATCH /rules/disable` 重放一遍。
//!
//! 用原文而不是下标寻址，是因为下标会随任意一条规则的增删整体位移；原文在订阅更新
//! 后仍然能对上，对不上就说明这条规则已经不存在，静默跳过即可。
//!
//! tauri-plugin-mihomo 既没有封装该接口，也没有导出自己的 IPC 传输层，因此这里自带
//! 一个最小客户端直连内核 IPC。

use anyhow::{Result, bail};
use clash_verge_logging::{Type, logging};
use http_body_util::{BodyExt as _, Full};
use hyper::{Method, Request, body::Bytes, header};
use hyper_util::rt::TokioIo;
use serde_yaml_ng::{Mapping, Value};
use std::collections::HashSet;

use crate::{config::Config, utils::dirs};

const ENDPOINT: &str = "/rules/disable";

/// 按 runtime 配置里 `rules` 的顺序把规则原文解析成内核规则表下标。
///
/// 内核规则表与 runtime 配置的 `rules` 序列一一对应，所以序列下标即规则下标。
/// 同一条原文可能在配置里出现多次（例如主配置和增强链各写了一遍），此时全部禁用，
/// 与「这条规则被禁用」的文本语义保持一致。
fn resolve_indexes(config: &Mapping, disabled: &[String]) -> Vec<usize> {
    let Some(Value::Sequence(rules)) = config.get("rules") else {
        return Vec::new();
    };
    let wanted: HashSet<&str> = disabled.iter().map(String::as_str).collect();

    rules
        .iter()
        .enumerate()
        .filter(|(_, rule)| rule.as_str().is_some_and(|text| wanted.contains(text)))
        .map(|(index, _)| index)
        .collect()
}

/// 解析不到下标的原文，用于日志排查：订阅更新后规则消失属于正常情况。
fn unresolved_rules(config: &Mapping, disabled: &[String]) -> Vec<String> {
    let present: HashSet<&str> = match config.get("rules") {
        Some(Value::Sequence(rules)) => rules.iter().filter_map(Value::as_str).collect(),
        _ => HashSet::new(),
    };

    disabled
        .iter()
        .filter(|rule| !present.contains(rule.as_str()))
        .cloned()
        .collect()
}

fn build_body(indexes: &[usize]) -> Result<String> {
    let payload: serde_json::Map<String, serde_json::Value> = indexes
        .iter()
        .map(|index| (index.to_string(), serde_json::Value::Bool(true)))
        .collect();
    Ok(serde_json::to_string(&serde_json::Value::Object(payload))?)
}

async fn send_patch(socket: &str, secret: Option<&str>, body: String) -> Result<()> {
    #[cfg(unix)]
    let io = TokioIo::new(tokio::net::UnixStream::connect(socket).await?);
    #[cfg(windows)]
    let io = TokioIo::new(tokio::net::windows::named_pipe::ClientOptions::new().open(socket)?);

    let (mut sender, connection) = hyper::client::conn::http1::handshake(io).await?;
    tokio::spawn(async move {
        if let Err(err) = connection.await {
            logging!(debug, Type::Core, "rule disable ipc connection closed: {err}");
        }
    });

    // IPC 上没有 authority，用 origin-form URI + 显式 Host，等价于 curl --unix-socket。
    let mut builder = Request::builder()
        .method(Method::PATCH)
        .uri(ENDPOINT)
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(secret) = secret.filter(|secret| !secret.is_empty()) {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {secret}"));
    }

    let response = sender.send_request(builder.body(Full::new(Bytes::from(body)))?).await?;
    let status = response.status();
    if !status.is_success() {
        let message = response
            .into_body()
            .collect()
            .await
            .map(|body| String::from_utf8_lossy(&body.to_bytes()).into_owned())
            .unwrap_or_default();
        bail!("core rejected rule disable request: {status} {message}");
    }

    Ok(())
}

/// 把当前 runtime 声明的禁用规则重放到内核。
///
/// 空集合走快路径不发请求：内核 reload 之后本来就没有任何规则处于 disabled，
/// 所以「取消禁用」不需要额外的反向调用，重新生成配置即可。
async fn replay() -> Result<()> {
    let (disabled, config) = {
        let runtime = Config::runtime().await.latest_arc();
        (runtime.disabled_rules.clone(), runtime.config.clone())
    };
    if disabled.is_empty() {
        return Ok(());
    }
    let Some(config) = config else {
        return Ok(());
    };

    let missing = unresolved_rules(&config, &disabled);
    if !missing.is_empty() {
        logging!(
            warn,
            Type::Core,
            "{} disabled rule(s) no longer exist in the rule list, skipped: {:?}",
            missing.len(),
            missing
        );
    }

    let indexes = resolve_indexes(&config, &disabled);
    if indexes.is_empty() {
        return Ok(());
    }

    let socket_path = dirs::ipc_path()?;
    let socket = dirs::path_to_str(&socket_path)?;
    let secret = Config::clash().await.latest_arc().get_client_info().secret;

    send_patch(socket, secret.as_deref(), build_body(&indexes)?).await?;
    logging!(info, Type::Core, "replayed {} disabled rule(s)", indexes.len());

    Ok(())
}

/// 配置 apply 之后的重放入口：失败只告警，不能让禁用状态拖垮配置生效。
pub async fn replay_after_apply() {
    if let Err(err) = replay().await {
        logging!(warn, Type::Core, "failed to replay disabled rules: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(rules: &[&str]) -> Mapping {
        let mut config = Mapping::new();
        config.insert(
            "rules".into(),
            Value::Sequence(rules.iter().map(|rule| Value::String((*rule).into())).collect()),
        );
        config
    }

    #[test]
    fn resolves_every_occurrence_of_a_disabled_rule() {
        let config = config(&["DOMAIN,a.com,DIRECT", "MATCH,DIRECT", "DOMAIN,a.com,DIRECT"]);
        let disabled = vec!["DOMAIN,a.com,DIRECT".to_owned()];

        assert_eq!(resolve_indexes(&config, &disabled), vec![0, 2]);
    }

    #[test]
    fn ignores_rules_that_left_the_list() {
        let config = config(&["MATCH,DIRECT"]);
        let disabled = vec!["DOMAIN,gone.com,DIRECT".to_owned()];

        assert!(resolve_indexes(&config, &disabled).is_empty());
        assert_eq!(unresolved_rules(&config, &disabled), disabled);
    }

    #[test]
    fn keeps_index_alignment_when_rules_shift() {
        let config = config(&["DOMAIN,new.com,DIRECT", "DOMAIN,a.com,DIRECT", "MATCH,DIRECT"]);
        let disabled = vec!["DOMAIN,a.com,DIRECT".to_owned()];

        assert_eq!(resolve_indexes(&config, &disabled), vec![1]);
    }

    #[test]
    #[allow(clippy::expect_used)]
    fn body_is_an_index_keyed_map() {
        let body = build_body(&[3, 7]).expect("index map should serialize");
        assert_eq!(body, r#"{"3":true,"7":true}"#);
    }

    #[test]
    fn missing_rules_key_resolves_to_nothing() {
        let disabled = vec!["MATCH,DIRECT".to_owned()];

        assert!(resolve_indexes(&Mapping::new(), &disabled).is_empty());
    }
}
