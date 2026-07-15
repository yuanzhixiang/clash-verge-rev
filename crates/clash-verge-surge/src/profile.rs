//! Clash Verge Surge-style complete profile codec.

use anyhow::{Context as _, Result, anyhow, bail};
use serde_yaml_ng::{Mapping, Value};

use crate::line::split_tokens;

const SPECIAL_KEYS: &[&str] = &[
    "proxies",
    "proxy-groups",
    "proxy-providers",
    "rule-providers",
    "rules",
    "hosts",
];

#[derive(Clone, Copy)]
enum Section {
    General,
    Proxy,
    ProxyGroup,
    ProxyProvider,
    RuleProvider,
    Rule,
    Host,
    Mihomo,
}

fn string(value: &str) -> Value {
    Value::String(value.to_owned())
}

fn key(value: &str) -> Value {
    string(value)
}

fn section(name: &str, line: usize) -> Result<Section> {
    match name {
        "General" => Ok(Section::General),
        "Proxy" => Ok(Section::Proxy),
        "Proxy Group" => Ok(Section::ProxyGroup),
        "Proxy Provider" => Ok(Section::ProxyProvider),
        "Rule Provider" => Ok(Section::RuleProvider),
        "Rule" => Ok(Section::Rule),
        "Host" => Ok(Section::Host),
        "Mihomo" => Ok(Section::Mihomo),
        "MITM" | "URL Rewrite" => bail!("unsupported section [{name}] at line {line}"),
        _ => bail!("unknown section [{name}] at line {line}"),
    }
}

fn top_level_equals(input: &str) -> Option<usize> {
    let mut quoted = false;
    let mut escaped = false;
    let mut depth = 0_u32;
    for (index, ch) in input.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match ch {
            '\\' if quoted => escaped = true,
            '"' => quoted = !quoted,
            '[' | '{' if !quoted => depth += 1,
            ']' | '}' if !quoted => depth = depth.saturating_sub(1),
            '=' if !quoted && depth == 0 => return Some(index),
            _ => {}
        }
    }
    None
}

fn strip_inline_comment(input: &str) -> &str {
    let mut quoted = false;
    let mut escaped = false;
    let mut depth = 0_u32;
    let mut previous_whitespace = true;
    for (index, ch) in input.char_indices() {
        if escaped {
            escaped = false;
            previous_whitespace = ch.is_whitespace();
            continue;
        }
        match ch {
            '\\' if quoted => escaped = true,
            '"' => quoted = !quoted,
            '[' | '{' if !quoted => depth += 1,
            ']' | '}' if !quoted => depth = depth.saturating_sub(1),
            '#' | ';' if !quoted && depth == 0 && previous_whitespace => return input[..index].trim_end(),
            '/' if !quoted && depth == 0 && previous_whitespace && input[index..].starts_with("//") => {
                return input[..index].trim_end();
            }
            _ => {}
        }
        previous_whitespace = ch.is_whitespace();
    }
    input
}

fn split_assignment(input: &str, line: usize) -> Result<(&str, &str)> {
    let Some(index) = top_level_equals(input) else {
        bail!("missing '=' at line {line}")
    };
    let (left, right) = input.split_at(index);
    let right = &right[1..];
    if left.trim().is_empty() {
        bail!("empty key at line {line}")
    }
    Ok((left.trim(), right.trim()))
}

fn decode_string(raw: &str, line: usize) -> Result<String> {
    let raw = raw.trim();
    if raw.starts_with('"') {
        return serde_json::from_str(raw).with_context(|| format!("invalid quoted string at line {line}"));
    }
    if raw.is_empty() {
        bail!("empty string at line {line}")
    }
    Ok(raw.to_owned())
}

fn json_to_yaml(value: serde_json::Value) -> Result<Value> {
    serde_yaml_ng::to_value(value).context("failed to convert JSON value")
}

fn decode_value(raw: &str, line: usize) -> Result<Value> {
    let raw = raw.trim();
    let looks_typed = raw.starts_with(['"', '[', '{'])
        || matches!(raw, "true" | "false" | "null")
        || raw.parse::<i64>().is_ok()
        || raw.parse::<f64>().is_ok();
    if looks_typed {
        let parsed: serde_json::Value =
            serde_json::from_str(raw).with_context(|| format!("invalid JSON value at line {line}"))?;
        return json_to_yaml(parsed);
    }
    Ok(string(raw))
}

fn insert_unique(mapping: &mut Mapping, name: String, value: Value, line: usize) -> Result<()> {
    if mapping.insert(key(&name), value).is_some() {
        bail!("duplicate key {name:?} at line {line}")
    }
    Ok(())
}

fn parse_mapping_line(input: &str, line: usize) -> Result<(String, Value)> {
    let (left, right) = split_assignment(input, line)?;
    Ok((decode_string(left, line)?, decode_value(right, line)?))
}

fn parse_named_mapping(input: &str, line: usize, kind: &str, native_fields: bool) -> Result<Mapping> {
    let (left, right) = split_assignment(input, line)?;
    let name = decode_string(left, line)?;
    let tokens = split_tokens(right);
    let Some(first) = tokens.first() else {
        bail!("missing {kind} type at line {line}")
    };
    let entity_type = decode_string(first, line)?;
    let mut mapping = Mapping::new();
    mapping.insert(key("name"), string(&name));
    mapping.insert(key("type"), string(&entity_type));

    let mut positional = Vec::new();
    for token in tokens.iter().skip(1) {
        if top_level_equals(token).is_some() {
            let (raw_key, raw_value) = split_assignment(token, line)?;
            let field = decode_string(raw_key.trim(), line)?;
            let value = decode_value(raw_value, line)?;
            insert_unique(&mut mapping, field, value, line)?;
        } else {
            positional.push(decode_string(token, line)?);
        }
    }

    match kind {
        "proxy" => {
            if let Some(server) = positional.first() {
                mapping.insert(key("server"), string(server));
            }
            if let Some(port) = positional.get(1) {
                mapping.insert(key("port"), decode_value(port, line)?);
            }
            if positional.len() > 2 {
                bail!("unexpected proxy positional value at line {line}")
            }
            if !native_fields {
                apply_proxy_aliases(&mut mapping)?;
            }
        }
        "proxy group" => {
            if !positional.is_empty() {
                mapping.insert(
                    key("proxies"),
                    Value::Sequence(positional.into_iter().map(Value::String).collect()),
                );
            }
        }
        _ if !positional.is_empty() => bail!("unexpected {kind} positional value at line {line}"),
        _ => {}
    }
    Ok(mapping)
}

fn apply_proxy_aliases(mapping: &mut Mapping) -> Result<()> {
    let mut proxy_type = mapping
        .get(key("type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let aliases = [
        ("encrypt-method", "cipher"),
        ("udp-relay", "udp"),
        ("underlying-proxy", "dialer-proxy"),
    ];
    for (source, target) in aliases {
        if let Some(value) = mapping.remove(key(source)) {
            mapping.insert(key(target), value);
        }
    }
    if proxy_type == "socks5-tls" {
        proxy_type = "socks5".to_owned();
        mapping.insert(key("type"), string("socks5"));
        mapping.insert(key("tls"), Value::Bool(true));
    } else if proxy_type == "https" {
        proxy_type = "http".to_owned();
        mapping.insert(key("type"), string("http"));
        mapping.insert(key("tls"), Value::Bool(true));
    }
    if proxy_type == "vmess" {
        if let Some(value) = mapping.remove(key("username")) {
            mapping.insert(key("uuid"), value);
        }
        if let Some(value) = mapping.remove(key("sni")) {
            mapping.insert(key("servername"), value);
        }
        if let Some(value) = mapping.remove(key("vmess-aead")) {
            let enabled = value.as_bool().ok_or_else(|| anyhow!("vmess-aead must be a boolean"))?;
            mapping.insert(key("alterId"), Value::Number(if enabled { 0 } else { 1 }.into()));
        }
    }
    if let Some(value) = mapping.remove(key("server-cert-fingerprint-sha256")) {
        mapping.insert(key("fingerprint"), value);
    }
    if let Some(value) = mapping.get_mut(key("ip-version"))
        && let Some(raw) = value.as_str()
    {
        let mapped = match raw {
            "v4-only" => Some("ipv4"),
            "v6-only" => Some("ipv6"),
            "prefer-v4" => Some("ipv4-prefer"),
            "prefer-v6" => Some("ipv6-prefer"),
            _ => None,
        };
        if let Some(mapped) = mapped {
            *value = string(mapped);
        }
    }
    if mapping
        .remove(key("ws"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        mapping.insert(key("network"), string("ws"));
        let mut options = Mapping::new();
        if let Some(path) = mapping.remove(key("ws-path")) {
            options.insert(key("path"), path);
        }
        if let Some(Value::String(raw_headers)) = mapping.remove(key("ws-headers")) {
            let mut headers = Mapping::new();
            for pair in raw_headers.split('|') {
                if let Some((header, value)) = pair.split_once(':') {
                    headers.insert(key(header.trim()), string(value.trim()));
                }
            }
            if !headers.is_empty() {
                options.insert(key("headers"), Value::Mapping(headers));
            }
        }
        if !options.is_empty() {
            mapping.insert(key("ws-opts"), Value::Mapping(options));
        }
    }
    if let Some(mode) = mapping.remove(key("obfs")) {
        let mut options = Mapping::new();
        options.insert(key("mode"), mode);
        if let Some(host) = mapping.remove(key("obfs-host")) {
            options.insert(key("host"), host);
        }
        if proxy_type == "ss" {
            mapping.insert(key("plugin"), string("obfs"));
            mapping.insert(key("plugin-opts"), Value::Mapping(options));
        } else if proxy_type == "snell" {
            mapping.insert(key("obfs-opts"), Value::Mapping(options));
        }
    }
    Ok(())
}

fn push_sequence(root: &mut Mapping, name: &str, value: Value) {
    let entry = root.entry(key(name)).or_insert_with(|| Value::Sequence(Vec::new()));
    entry.as_sequence_mut().expect("sequence initialized above").push(value);
}

fn provider_name(group: &str) -> String {
    format!("{group}-policy-path")
}

fn handle_policy_path(group: &mut Mapping, providers: &mut Mapping, line: usize) -> Result<()> {
    let Some(path) = group.remove(key("policy-path")) else {
        return Ok(());
    };
    let url = path
        .as_str()
        .ok_or_else(|| anyhow!("policy-path must be a string at line {line}"))?;
    let group_name = group.get(key("name")).and_then(Value::as_str).unwrap_or("provider");
    let name = provider_name(group_name);
    let mut provider = Mapping::new();
    provider.insert(key("type"), string("http"));
    provider.insert(key("url"), string(url));
    provider.insert(key("verge-format"), string("surge"));
    if let Some(interval) = group.remove(key("update-interval")) {
        provider.insert(key("interval"), interval);
    }
    insert_unique(providers, name.clone(), Value::Mapping(provider), line)?;
    group.insert(key("use"), Value::Sequence(vec![string(&name)]));
    Ok(())
}

pub fn parse_profile(content: &str) -> Result<Mapping> {
    let mut root = Mapping::new();
    let mut current = None;
    let mut hosts = Mapping::new();
    let mut proxy_providers = Mapping::new();
    let mut rule_providers = Mapping::new();
    let native_fields = content
        .trim_start()
        .starts_with("# Clash Verge Surge-style profile; not a native Surge configuration.");

    for (index, raw) in content.lines().enumerate() {
        let line_no = index + 1;
        let line = strip_inline_comment(raw.trim()).trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') || line.starts_with("//") {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            current = Some(section(&line[1..line.len() - 1], line_no)?);
            continue;
        }
        let section = current.ok_or_else(|| anyhow!("content before first section at line {line_no}"))?;
        match section {
            Section::General | Section::Mihomo => {
                let (name, value) = parse_mapping_line(line, line_no)?;
                insert_unique(&mut root, name, value, line_no)?;
            }
            Section::Host => {
                let (name, value) = parse_mapping_line(line, line_no)?;
                insert_unique(&mut hosts, name, value, line_no)?;
            }
            Section::Proxy => push_sequence(
                &mut root,
                "proxies",
                Value::Mapping(parse_named_mapping(line, line_no, "proxy", native_fields)?),
            ),
            Section::ProxyGroup => {
                let mut group = parse_named_mapping(line, line_no, "proxy group", native_fields)?;
                if !native_fields {
                    handle_policy_path(&mut group, &mut proxy_providers, line_no)?;
                }
                push_sequence(&mut root, "proxy-groups", Value::Mapping(group));
            }
            Section::ProxyProvider => {
                let provider = parse_named_mapping(line, line_no, "proxy provider", native_fields)?;
                let name = provider
                    .get(key("name"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let mut provider = provider;
                provider.remove(key("name"));
                insert_unique(&mut proxy_providers, name, Value::Mapping(provider), line_no)?;
            }
            Section::RuleProvider => {
                let provider = parse_named_mapping(line, line_no, "rule provider", native_fields)?;
                let name = provider
                    .get(key("name"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let mut provider = provider;
                provider.remove(key("name"));
                insert_unique(&mut rule_providers, name, Value::Mapping(provider), line_no)?;
            }
            Section::Rule => {
                let rule = if line.starts_with('"') {
                    decode_string(line, line_no)?
                } else {
                    line.to_owned()
                };
                push_sequence(&mut root, "rules", string(&rule));
            }
        }
    }
    if !proxy_providers.is_empty() {
        root.insert(key("proxy-providers"), Value::Mapping(proxy_providers));
    }
    if !rule_providers.is_empty() {
        root.insert(key("rule-providers"), Value::Mapping(rule_providers));
    }
    if !hosts.is_empty() {
        root.insert(key("hosts"), Value::Mapping(hosts));
    }
    Ok(root)
}

fn safe_bare(value: &str) -> bool {
    !value.is_empty()
        && !matches!(value, "true" | "false" | "null")
        && value.parse::<f64>().is_err()
        && value
            .chars()
            .all(|ch| ch.is_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':' | '/' | '@' | '+' | ' '))
        && !value.starts_with(['#', ';', '['])
        && !value.starts_with("//")
        && !value.contains([',', '='])
}

fn encode_string(value: &str) -> Result<String> {
    if safe_bare(value) {
        Ok(value.to_owned())
    } else {
        serde_json::to_string(value).context("failed to quote string")
    }
}

fn encode_value(value: &Value, path: &str) -> Result<String> {
    if let Value::String(value) = value {
        return encode_string(value);
    }
    let json = serde_json::to_value(value).with_context(|| format!("unsupported value at {path}"))?;
    serde_json::to_string(&json).with_context(|| format!("failed to encode value at {path}"))
}

fn mapping_field<'a>(mapping: &'a Mapping, name: &str) -> Option<&'a Value> {
    mapping.get(key(name))
}

fn serialize_entity(mapping: &Mapping, kind: &str, path: &str) -> Result<String> {
    let name = mapping_field(mapping, "name")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing string name at {path}"))?;
    let entity_type = mapping_field(mapping, "type")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing string type at {path}"))?;
    let mut tokens = vec![encode_string(entity_type)?];
    let mut skipped = vec!["name", "type"];
    if kind == "proxy" {
        if let Some(server) = mapping_field(mapping, "server") {
            tokens.push(encode_value(server, &format!("{path}.server"))?);
            skipped.push("server");
        }
        if let Some(port) = mapping_field(mapping, "port") {
            tokens.push(encode_value(port, &format!("{path}.port"))?);
            skipped.push("port");
        }
    } else if kind == "proxy group" {
        if let Some(proxies) = mapping_field(mapping, "proxies") {
            let proxies = proxies
                .as_sequence()
                .ok_or_else(|| anyhow!("proxies must be an array at {path}"))?;
            if proxies.is_empty() {
                tokens.push("proxies=[]".to_owned());
            } else {
                for (index, proxy) in proxies.iter().enumerate() {
                    let proxy = proxy
                        .as_str()
                        .ok_or_else(|| anyhow!("proxy member must be a string at {path}.proxies[{index}]"))?;
                    tokens.push(encode_string(proxy)?);
                }
            }
            skipped.push("proxies");
        }
    }
    for (raw_key, value) in mapping {
        let field = raw_key.as_str().ok_or_else(|| anyhow!("non-string key at {path}"))?;
        if skipped.contains(&field) {
            continue;
        }
        tokens.push(format!(
            "{}={}",
            encode_string(field)?,
            encode_value(value, &format!("{path}.{field}"))?
        ));
    }
    Ok(format!("{} = {}", encode_string(name)?, tokens.join(", ")))
}

fn write_section(output: &mut String, name: &str, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    if !output.ends_with("\n\n") {
        output.push('\n');
    }
    output.push_str(&format!("[{name}]\n"));
    for line in lines {
        output.push_str(line);
        output.push('\n');
    }
}

fn serialize_sequence(root: &Mapping, key_name: &str, kind: &str) -> Result<Vec<String>> {
    let Some(value) = root.get(key(key_name)) else {
        return Ok(Vec::new());
    };
    let sequence = value
        .as_sequence()
        .ok_or_else(|| anyhow!("{key_name} must be an array"))?;
    sequence
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let mapping = value
                .as_mapping()
                .ok_or_else(|| anyhow!("{key_name}[{index}] must be a mapping"))?;
            serialize_entity(mapping, kind, &format!("$.{key_name}[{index}]"))
        })
        .collect()
}

fn serialize_providers(root: &Mapping, key_name: &str, kind: &str) -> Result<Vec<String>> {
    let Some(value) = root.get(key(key_name)) else {
        return Ok(Vec::new());
    };
    let providers = value
        .as_mapping()
        .ok_or_else(|| anyhow!("{key_name} must be a mapping"))?;
    providers
        .iter()
        .map(|(name, value)| {
            let name = name
                .as_str()
                .ok_or_else(|| anyhow!("non-string provider name in {key_name}"))?;
            let mut mapping = value
                .as_mapping()
                .ok_or_else(|| anyhow!("provider {name:?} must be a mapping"))?
                .clone();
            mapping.insert(key("name"), string(name));
            serialize_entity(&mapping, kind, &format!("$.{key_name}.{name}"))
        })
        .collect()
}

pub fn serialize_profile(root: &Mapping) -> Result<String> {
    let mut output = String::from("# Clash Verge Surge-style profile; not a native Surge configuration.\n");
    let mut general = Vec::new();
    let mut mihomo = Vec::new();
    for (raw_key, value) in root {
        let name = raw_key.as_str().ok_or_else(|| anyhow!("non-string top-level key"))?;
        if SPECIAL_KEYS.contains(&name) {
            let empty =
                value.as_sequence().is_some_and(Vec::is_empty) || value.as_mapping().is_some_and(Mapping::is_empty);
            if empty {
                mihomo.push(format!(
                    "{} = {}",
                    encode_string(name)?,
                    encode_value(value, &format!("$.{name}"))?
                ));
            }
            continue;
        }
        let line = format!(
            "{} = {}",
            encode_string(name)?,
            encode_value(value, &format!("$.{name}"))?
        );
        if matches!(
            value,
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
        ) {
            general.push(line);
        } else {
            mihomo.push(line);
        }
    }
    write_section(&mut output, "General", &general);
    write_section(&mut output, "Proxy", &serialize_sequence(root, "proxies", "proxy")?);
    write_section(
        &mut output,
        "Proxy Group",
        &serialize_sequence(root, "proxy-groups", "proxy group")?,
    );
    write_section(
        &mut output,
        "Proxy Provider",
        &serialize_providers(root, "proxy-providers", "proxy provider")?,
    );
    write_section(
        &mut output,
        "Rule Provider",
        &serialize_providers(root, "rule-providers", "rule provider")?,
    );
    let rules = root
        .get(key("rules"))
        .map(|value| {
            value
                .as_sequence()
                .ok_or_else(|| anyhow!("rules must be an array"))?
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    let rule = value
                        .as_str()
                        .ok_or_else(|| anyhow!("rules[{index}] must be a string"))?;
                    if rule.starts_with(['#', ';', '[']) || rule.starts_with("//") {
                        serde_json::to_string(rule).context("failed to quote rule")
                    } else {
                        Ok(rule.to_owned())
                    }
                })
                .collect::<Result<Vec<_>>>()
        })
        .transpose()?
        .unwrap_or_default();
    write_section(&mut output, "Rule", &rules);
    let hosts = root
        .get(key("hosts"))
        .map(|value| {
            value
                .as_mapping()
                .ok_or_else(|| anyhow!("hosts must be a mapping"))?
                .iter()
                .map(|(name, value)| {
                    let name = name.as_str().ok_or_else(|| anyhow!("non-string host key"))?;
                    Ok(format!(
                        "{} = {}",
                        encode_string(name)?,
                        encode_value(value, &format!("$.hosts.{name}"))?
                    ))
                })
                .collect::<Result<Vec<_>>>()
        })
        .transpose()?
        .unwrap_or_default();
    write_section(&mut output, "Host", &hosts);
    write_section(&mut output, "Mihomo", &mihomo);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_complete_profile() {
        let yaml = r#"
mixed-port: 7890
allow-lan: true
proxies:
  - name: node, one=a
    type: vless
    server: example.com
    port: 443
    flow: null
    ws-opts:
      headers:
        Host: edge.example.com
proxy-groups:
  - name: PROXY
    type: select
    proxies: ["node, one=a", DIRECT]
proxy-providers:
  remote:
    type: http
    url: https://example.com/list
rules:
  - DOMAIN-SUFFIX,example.com,PROXY
  - MATCH,DIRECT
hosts:
  example.test: 127.0.0.1
dns:
  enable: true
  nameserver: [1.1.1.1]
"#;
        let root = serde_yaml_ng::from_str::<Value>(yaml)
            .unwrap()
            .as_mapping()
            .unwrap()
            .clone();
        let conf = serialize_profile(&root).unwrap();
        let reparsed = parse_profile(&conf).unwrap();
        assert_eq!(reparsed, root);
        assert!(conf.contains("[Proxy]"));
        assert!(conf.contains("ws-opts={"));
    }

    #[test]
    fn rejects_unsupported_and_unknown_sections() {
        assert!(
            parse_profile("[MITM]\nenable = true")
                .unwrap_err()
                .to_string()
                .contains("line 1")
        );
        assert!(
            parse_profile("[Unknown]\na = 1")
                .unwrap_err()
                .to_string()
                .contains("unknown section")
        );
    }

    #[test]
    fn policy_path_becomes_provider() {
        let parsed = parse_profile(
            "[Proxy Group]\nRemote = select, policy-path=https://example.com/nodes, update-interval=3600\n",
        )
        .unwrap();
        assert!(parsed.get(key("proxy-providers")).is_some());
        let group = &parsed.get(key("proxy-groups")).unwrap().as_sequence().unwrap()[0];
        assert!(group.as_mapping().unwrap().get(key("use")).is_some());
    }

    #[test]
    fn accepts_surge_proxy_aliases() {
        let parsed = parse_profile(
            "[Proxy]\nnode = ss, example.com, 443, encrypt-method=aes-128-gcm, udp-relay=true, underlying-proxy=relay\n",
        )
        .unwrap();
        let proxy = parsed.get(key("proxies")).unwrap().as_sequence().unwrap()[0]
            .as_mapping()
            .unwrap();
        assert_eq!(proxy.get(key("cipher")).and_then(Value::as_str), Some("aes-128-gcm"));
        assert_eq!(proxy.get(key("udp")).and_then(Value::as_bool), Some(true));
        assert_eq!(proxy.get(key("dialer-proxy")).and_then(Value::as_str), Some("relay"));
        assert!(!proxy.contains_key(key("encrypt-method")));
    }
}
