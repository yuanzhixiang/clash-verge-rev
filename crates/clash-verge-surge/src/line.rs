//! Surge 节点行 tokenizer。
//!
//! 行格式：`节点名 = 类型, server, port, k1=v1, k2=v2, ...`
//! 值允许用双引号包裹（引号内的逗号不作为分隔符）。

/// 一行 Surge 节点声明的原始 token。
pub(crate) struct SurgeLine<'a> {
    pub name: &'a str,
    pub proto: String,
    /// `proto` 之后的顺序参数（server、port 等）。
    pub positional: Vec<String>,
    /// `k=v` 形式的命名参数，key 统一小写。
    pub params: Vec<(String, String)>,
}

/// 解析一行。返回：
/// - `Ok(Some(line))`：一条节点声明
/// - `Ok(None)`：空行 / 注释 / `[Section]` 头，直接忽略
/// - `Err`：形如节点声明但无法解析
pub(crate) fn parse_surge_line(line: &str) -> anyhow::Result<Option<SurgeLine<'_>>> {
    let trimmed = line.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with(';')
        || trimmed.starts_with("//")
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        return Ok(None);
    }

    let Some((name, rest)) = trimmed.split_once('=') else {
        anyhow::bail!("missing '=' separator");
    };
    let name = name.trim();
    if name.is_empty() {
        anyhow::bail!("empty node name");
    }

    let tokens = split_tokens(rest);
    let Some(proto) = tokens.first() else {
        anyhow::bail!("missing proxy type");
    };
    let proto = proto.to_ascii_lowercase();
    if proto.is_empty() {
        anyhow::bail!("missing proxy type");
    }

    let mut positional = Vec::new();
    let mut params = Vec::new();
    for token in &tokens[1..] {
        match token.split_once('=') {
            Some((key, value)) => params.push((key.trim().to_ascii_lowercase(), unquote(value.trim()).to_string())),
            None => positional.push(unquote(token).to_string()),
        }
    }

    Ok(Some(SurgeLine {
        name,
        proto,
        positional,
        params,
    }))
}

/// 按逗号切分，双引号内的逗号不算分隔符。
fn split_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                current.push(ch);
            }
            ',' if !in_quotes => {
                let token = current.trim();
                if !token.is_empty() {
                    tokens.push(token.to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let token = current.trim();
    if !token.is_empty() {
        tokens.push(token.to_string());
    }
    tokens
}

fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(value)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_line() {
        let line = parse_surge_line(
            "🇭🇰 HK | 香港 01 = anytls, 4eeg11.gkkgrp.xyz, 29112, password=8c187fb157, tls=true, sni=edge-v1.msstatic.com, skip-cert-verify=true",
        )
        .unwrap()
        .unwrap();
        assert_eq!(line.name, "🇭🇰 HK | 香港 01");
        assert_eq!(line.proto, "anytls");
        assert_eq!(line.positional, vec!["4eeg11.gkkgrp.xyz", "29112"]);
        assert_eq!(
            line.params,
            vec![
                ("password".into(), "8c187fb157".into()),
                ("tls".into(), "true".into()),
                ("sni".into(), "edge-v1.msstatic.com".into()),
                ("skip-cert-verify".into(), "true".into()),
            ]
        );
    }

    #[test]
    fn skips_comments_sections_and_blank_lines() {
        for input in ["", "  ", "# comment", "; comment", "// comment", "[Proxy]"] {
            assert!(parse_surge_line(input).unwrap().is_none(), "{input:?}");
        }
    }

    #[test]
    fn keeps_quoted_commas_intact() {
        let line = parse_surge_line(r#"node = trojan, example.com, 443, password=p, ws-headers="Host:a.com,b.com""#)
            .unwrap()
            .unwrap();
        assert_eq!(
            line.params.last().unwrap(),
            &("ws-headers".into(), "Host:a.com,b.com".into())
        );
    }

    #[test]
    fn rejects_line_without_equals() {
        assert!(parse_surge_line("not a node line").is_err());
    }
}
