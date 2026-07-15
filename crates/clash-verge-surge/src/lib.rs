//! Surge policy-path 外部节点列表 → mihomo proxies 转换。
//!
//! 输入是一段远程拉取的文本，自动识别两种内容：
//! - mihomo YAML（含 `proxies:` 数组）：直接抽取，用于 UA 协商后返回
//!   Clash 格式的面板订阅；
//! - Surge 节点行列表（`名字 = 类型, server, port, k=v...`）：逐行解析并
//!   转换为 mihomo proxy 字段。
//!
//! 纯转换库，无 IO、无应用依赖。

mod convert;
mod line;
mod profile;

pub use profile::{parse_profile, serialize_profile};

use serde_yaml_ng::{Mapping, Value};

/// 被跳过的行（解析失败或协议不支持）。
#[derive(Debug)]
pub struct SkippedLine {
    /// 1 起始的行号。
    pub line_no: usize,
    /// 若能解析出节点名则携带。
    pub name: Option<String>,
    pub reason: String,
}

/// 转换结果。`proxies` 中的每一项可直接作为 provider 文件里
/// `proxies:` 数组的元素序列化。
#[derive(Debug, Default)]
pub struct ConversionOutput {
    pub proxies: Vec<Mapping>,
    pub skipped: Vec<SkippedLine>,
}

/// 自动识别并转换一段节点列表文本。
///
/// 内容既不是含 `proxies:` 的 YAML、也没有任何可解析的 Surge 节点行时，
/// 返回的 `proxies` 为空，由调用方决定视为失败。
pub fn convert_node_list(content: &str) -> ConversionOutput {
    if let Some(proxies) = try_extract_yaml_proxies(content) {
        return ConversionOutput {
            proxies,
            skipped: Vec::new(),
        };
    }
    convert_surge_lines(content)
}

/// 内容是 YAML 映射且含 `proxies` 数组时抽取其中的映射项。
fn try_extract_yaml_proxies(content: &str) -> Option<Vec<Mapping>> {
    let value: Value = serde_yaml_ng::from_str(content).ok()?;
    let mapping = value.as_mapping()?;
    let proxies = mapping.get(Value::String("proxies".into()))?.as_sequence()?;
    Some(proxies.iter().filter_map(|item| item.as_mapping().cloned()).collect())
}

fn convert_surge_lines(content: &str) -> ConversionOutput {
    let mut output = ConversionOutput::default();
    for (index, raw_line) in content.lines().enumerate() {
        let line_no = index + 1;
        match line::parse_surge_line(raw_line) {
            Ok(None) => {}
            Ok(Some(parsed)) => match convert::to_mihomo_proxy(&parsed) {
                Ok(proxy) => output.proxies.push(proxy),
                Err(error) => output.skipped.push(SkippedLine {
                    line_no,
                    name: Some(parsed.name.to_string()),
                    reason: error.to_string(),
                }),
            },
            Err(error) => output.skipped.push(SkippedLine {
                line_no,
                name: None,
                reason: error.to_string(),
            }),
        }
    }
    output
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn converts_surge_node_list() {
        let content = "\
# node list
🇭🇰 HK | 香港 01 = anytls, host.xyz, 29112, password=pw, tls=true, sni=edge.msstatic.com, skip-cert-verify=true

localrust = ss, 127.0.0.1, 8100, encrypt-method=aes-256-cfb, password=hello-world, udp-relay=true
bad line without equals sign, really
mystery = warp, host, 443
";
        let output = convert_node_list(content);
        assert_eq!(output.proxies.len(), 2);
        assert_eq!(output.skipped.len(), 2);
        assert_eq!(output.skipped[0].line_no, 5);
        assert!(output.skipped[0].name.is_none());
        assert_eq!(output.skipped[1].name.as_deref(), Some("mystery"));
        assert!(output.skipped[1].reason.contains("unsupported"));
    }

    #[test]
    fn extracts_yaml_proxies_directly() {
        let content = "\
proxies:
- name: n1
  type: ss
  server: a.com
  port: 443
  cipher: aes-128-gcm
  password: pw
- name: n2
  type: trojan
  server: b.com
  port: 443
  password: pw
";
        let output = convert_node_list(content);
        assert_eq!(output.proxies.len(), 2);
        assert!(output.skipped.is_empty());
        assert_eq!(
            output.proxies[0].get(serde_yaml_ng::Value::String("name".into())),
            Some(&serde_yaml_ng::Value::String("n1".into()))
        );
    }

    #[test]
    fn yaml_without_proxies_falls_back_to_surge_parsing() {
        // 单行 Surge 声明也能被 YAML 解析成映射，但没有 proxies 键，
        // 必须回落到 Surge 行解析。
        let content = "node = ss, a.com, 443, encrypt-method=aes-128-gcm, password=pw";
        let output = convert_node_list(content);
        assert_eq!(output.proxies.len(), 1);
    }

    #[test]
    fn empty_content_yields_empty_output() {
        let output = convert_node_list("");
        assert!(output.proxies.is_empty());
        assert!(output.skipped.is_empty());
    }
}
