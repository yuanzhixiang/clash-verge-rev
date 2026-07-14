//! Surge 节点参数 → mihomo proxy 字段映射。

use serde_yaml_ng::{Mapping, Value};

use crate::line::SurgeLine;

fn value_str(value: &str) -> Value {
    Value::String(value.to_string())
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    }
}

fn insert(map: &mut Mapping, key: &str, value: Value) {
    map.insert(value_str(key), value);
}

fn insert_bool(map: &mut Mapping, key: &str, raw: &str) -> anyhow::Result<()> {
    let parsed = parse_bool(raw).ok_or_else(|| anyhow::anyhow!("invalid boolean for {key}: {raw:?}"))?;
    insert(map, key, Value::Bool(parsed));
    Ok(())
}

/// Surge `ws-headers="Host:a.com|X-Foo:bar"` → mihomo `ws-opts.headers` 映射。
fn parse_ws_headers(raw: &str) -> Mapping {
    let mut headers = Mapping::new();
    for pair in raw.split('|') {
        if let Some((key, value)) = pair.split_once(':') {
            insert(&mut headers, key.trim(), value_str(value.trim()));
        }
    }
    headers
}

fn map_ip_version(raw: &str) -> Option<&'static str> {
    match raw {
        "v4-only" => Some("ipv4"),
        "v6-only" => Some("ipv6"),
        "prefer-v4" => Some("ipv4-prefer"),
        "prefer-v6" => Some("ipv6-prefer"),
        "dual" => Some("dual"),
        _ => None,
    }
}

/// 把一条 Surge 节点声明转换为 mihomo proxy Mapping。
pub(crate) fn to_mihomo_proxy(line: &SurgeLine<'_>) -> anyhow::Result<Mapping> {
    let (proxy_type, implied_tls) = match line.proto.as_str() {
        "ss" => ("ss", false),
        "anytls" => ("anytls", false),
        "socks5" => ("socks5", false),
        "socks5-tls" => ("socks5", true),
        "trojan" => ("trojan", false),
        "vmess" => ("vmess", false),
        "http" => ("http", false),
        "https" => ("http", true),
        "snell" => ("snell", false),
        other => anyhow::bail!("unsupported proxy type: {other}"),
    };

    let server = line
        .positional
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing server"))?;
    let port: u16 = line
        .positional
        .get(1)
        .ok_or_else(|| anyhow::anyhow!("missing port"))?
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid port: {:?}", line.positional[1]))?;

    let mut proxy = Mapping::new();
    insert(&mut proxy, "name", value_str(line.name));
    insert(&mut proxy, "type", value_str(proxy_type));
    insert(&mut proxy, "server", value_str(server));
    insert(&mut proxy, "port", Value::Number(port.into()));
    if implied_tls {
        insert(&mut proxy, "tls", Value::Bool(true));
    }

    // vmess 缺省值：mihomo 要求 uuid/cipher/alterId 齐全
    if proxy_type == "vmess" {
        insert(&mut proxy, "cipher", value_str("auto"));
        insert(&mut proxy, "alterId", Value::Number(0.into()));
    }

    // ss obfs / snell obfs、trojan/vmess 的 ws 参数先收集，最后组装
    let mut obfs_mode: Option<String> = None;
    let mut obfs_host: Option<String> = None;
    let mut ws_enabled = false;
    let mut ws_path: Option<String> = None;
    let mut ws_headers: Option<Mapping> = None;

    for (key, value) in &line.params {
        match (proxy_type, key.as_str()) {
            // ---- 通用参数 ----
            (_, "udp-relay") => insert_bool(&mut proxy, "udp", value)?,
            (_, "underlying-proxy") => insert(&mut proxy, "dialer-proxy", value_str(value)),
            (_, "skip-cert-verify") => insert_bool(&mut proxy, "skip-cert-verify", value)?,
            (_, "tfo") => insert_bool(&mut proxy, "tfo", value)?,
            (_, "server-cert-fingerprint-sha256") => insert(&mut proxy, "fingerprint", value_str(value)),
            (_, "ip-version") => {
                if let Some(mapped) = map_ip_version(value) {
                    insert(&mut proxy, "ip-version", value_str(mapped));
                }
            }
            // Surge 专属、mihomo 无对应概念的参数，静默忽略
            (
                _,
                "test-url"
                | "interface"
                | "no-error-alert"
                | "hybrid"
                | "allow-other-interface"
                | "update-interval"
                | "block-quic"
                | "ecn"
                | "test-timeout",
            ) => {}

            // ---- ss ----
            ("ss", "encrypt-method") => insert(&mut proxy, "cipher", value_str(value)),
            ("ss", "password") => insert(&mut proxy, "password", value_str(value)),
            ("ss", "obfs") => obfs_mode = Some(value.clone()),
            ("ss", "obfs-host") => obfs_host = Some(value.clone()),

            // ---- anytls ----
            ("anytls", "password") => insert(&mut proxy, "password", value_str(value)),
            ("anytls", "sni") => insert(&mut proxy, "sni", value_str(value)),
            ("anytls", "tls") => {} // anytls 恒为 TLS

            // ---- socks5 / http ----
            ("socks5" | "http", "username") => insert(&mut proxy, "username", value_str(value)),
            ("socks5" | "http", "password") => insert(&mut proxy, "password", value_str(value)),
            ("socks5" | "http", "tls") => insert_bool(&mut proxy, "tls", value)?,
            ("http", "sni") => insert(&mut proxy, "sni", value_str(value)),

            // ---- trojan ----
            ("trojan", "password") => insert(&mut proxy, "password", value_str(value)),
            ("trojan", "sni") => insert(&mut proxy, "sni", value_str(value)),

            // ---- vmess ----
            ("vmess", "username") => insert(&mut proxy, "uuid", value_str(value)),
            ("vmess", "encrypt-method") => insert(&mut proxy, "cipher", value_str(value)),
            ("vmess", "vmess-aead") => {
                let aead =
                    parse_bool(value).ok_or_else(|| anyhow::anyhow!("invalid boolean for vmess-aead: {value:?}"))?;
                insert(&mut proxy, "alterId", Value::Number(if aead { 0 } else { 1 }.into()));
            }
            ("vmess", "tls") => insert_bool(&mut proxy, "tls", value)?,
            ("vmess", "sni") => insert(&mut proxy, "servername", value_str(value)),

            // ---- trojan / vmess 共用的 ws 传输层 ----
            ("trojan" | "vmess", "ws") => ws_enabled = parse_bool(value) == Some(true),
            ("trojan" | "vmess", "ws-path") => ws_path = Some(value.clone()),
            ("trojan" | "vmess", "ws-headers") => ws_headers = Some(parse_ws_headers(value)),

            // ---- snell ----
            ("snell", "psk") => insert(&mut proxy, "psk", value_str(value)),
            ("snell", "version") => {
                let version: u64 = value
                    .parse()
                    .map_err(|_| anyhow::anyhow!("invalid snell version: {value:?}"))?;
                insert(&mut proxy, "version", Value::Number(version.into()));
            }
            ("snell", "obfs") => obfs_mode = Some(value.clone()),
            ("snell", "obfs-host") => obfs_host = Some(value.clone()),

            // 其余未知参数忽略，保持对新参数的前向兼容
            _ => {}
        }
    }

    if ws_enabled {
        insert(&mut proxy, "network", value_str("ws"));
        let mut ws_opts = Mapping::new();
        if let Some(path) = ws_path {
            insert(&mut ws_opts, "path", value_str(&path));
        }
        if let Some(headers) = ws_headers {
            insert(&mut ws_opts, "headers", Value::Mapping(headers));
        }
        if !ws_opts.is_empty() {
            insert(&mut proxy, "ws-opts", Value::Mapping(ws_opts));
        }
    }

    if let Some(mode) = obfs_mode {
        let mut opts = Mapping::new();
        insert(&mut opts, "mode", value_str(&mode));
        if let Some(host) = obfs_host {
            insert(&mut opts, "host", value_str(&host));
        }
        match proxy_type {
            "ss" => {
                insert(&mut proxy, "plugin", value_str("obfs"));
                insert(&mut proxy, "plugin-opts", Value::Mapping(opts));
            }
            "snell" => {
                insert(&mut proxy, "obfs-opts", Value::Mapping(opts));
            }
            _ => {}
        }
    }

    Ok(proxy)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::line::parse_surge_line;

    fn convert(line: &str) -> Mapping {
        to_mihomo_proxy(&parse_surge_line(line).unwrap().unwrap()).unwrap()
    }

    fn get<'a>(map: &'a Mapping, key: &str) -> &'a Value {
        map.get(value_str(key)).unwrap_or_else(|| panic!("missing key {key}"))
    }

    #[test]
    fn converts_ss_with_obfs() {
        let proxy = convert(
            "node = ss, example.com, 8100, encrypt-method=aes-256-cfb, password=pw, udp-relay=true, obfs=http, obfs-host=bing.com",
        );
        assert_eq!(get(&proxy, "type"), &value_str("ss"));
        assert_eq!(get(&proxy, "cipher"), &value_str("aes-256-cfb"));
        assert_eq!(get(&proxy, "password"), &value_str("pw"));
        assert_eq!(get(&proxy, "udp"), &Value::Bool(true));
        assert_eq!(get(&proxy, "plugin"), &value_str("obfs"));
        let opts = get(&proxy, "plugin-opts").as_mapping().unwrap();
        assert_eq!(get(opts, "mode"), &value_str("http"));
        assert_eq!(get(opts, "host"), &value_str("bing.com"));
    }

    #[test]
    fn converts_anytls() {
        let proxy = convert(
            "🇭🇰 HK | 香港 01 = anytls, host.xyz, 29112, password=pw, tls=true, sni=edge.msstatic.com, skip-cert-verify=true",
        );
        assert_eq!(get(&proxy, "type"), &value_str("anytls"));
        assert_eq!(get(&proxy, "name"), &value_str("🇭🇰 HK | 香港 01"));
        assert_eq!(get(&proxy, "sni"), &value_str("edge.msstatic.com"));
        assert_eq!(get(&proxy, "skip-cert-verify"), &Value::Bool(true));
        assert!(proxy.get(value_str("tls")).is_none());
    }

    #[test]
    fn converts_socks5_with_underlying_proxy() {
        let proxy =
            convert("US‑Static‑NY = socks5, 64.50.132.50, 443, username=user, password=pw, underlying-proxy=manual");
        assert_eq!(get(&proxy, "type"), &value_str("socks5"));
        assert_eq!(get(&proxy, "username"), &value_str("user"));
        assert_eq!(get(&proxy, "dialer-proxy"), &value_str("manual"));
    }

    #[test]
    fn converts_socks5_tls_alias() {
        let proxy = convert("node = socks5-tls, example.com, 443, username=u, password=p");
        assert_eq!(get(&proxy, "type"), &value_str("socks5"));
        assert_eq!(get(&proxy, "tls"), &Value::Bool(true));
    }

    #[test]
    fn converts_trojan_with_ws() {
        let proxy = convert(
            r#"node = trojan, example.com, 443, password=pw, sni=a.com, ws=true, ws-path=/ws, ws-headers="Host:a.com|X-Foo:bar""#,
        );
        assert_eq!(get(&proxy, "network"), &value_str("ws"));
        let ws = get(&proxy, "ws-opts").as_mapping().unwrap();
        assert_eq!(get(ws, "path"), &value_str("/ws"));
        let headers = get(ws, "headers").as_mapping().unwrap();
        assert_eq!(get(headers, "Host"), &value_str("a.com"));
        assert_eq!(get(headers, "X-Foo"), &value_str("bar"));
    }

    #[test]
    fn converts_vmess_aead_and_tls() {
        let proxy = convert("node = vmess, example.com, 443, username=uuid-123, vmess-aead=true, tls=true, sni=v.com");
        assert_eq!(get(&proxy, "uuid"), &value_str("uuid-123"));
        assert_eq!(get(&proxy, "alterId"), &Value::Number(0.into()));
        assert_eq!(get(&proxy, "cipher"), &value_str("auto"));
        assert_eq!(get(&proxy, "tls"), &Value::Bool(true));
        assert_eq!(get(&proxy, "servername"), &value_str("v.com"));
    }

    #[test]
    fn converts_https_alias() {
        let proxy = convert("node = https, example.com, 443, username=u, password=p, sni=s.com");
        assert_eq!(get(&proxy, "type"), &value_str("http"));
        assert_eq!(get(&proxy, "tls"), &Value::Bool(true));
        assert_eq!(get(&proxy, "sni"), &value_str("s.com"));
    }

    #[test]
    fn converts_snell() {
        let proxy = convert("node = snell, example.com, 443, psk=secret, version=4, obfs=tls, obfs-host=bing.com");
        assert_eq!(get(&proxy, "psk"), &value_str("secret"));
        assert_eq!(get(&proxy, "version"), &Value::Number(4.into()));
        let opts = get(&proxy, "obfs-opts").as_mapping().unwrap();
        assert_eq!(get(opts, "mode"), &value_str("tls"));
    }

    #[test]
    fn rejects_unsupported_type() {
        let line = parse_surge_line("node = wireguard, wg-home").unwrap().unwrap();
        assert!(to_mihomo_proxy(&line).is_err());
    }

    #[test]
    fn rejects_invalid_port() {
        let line = parse_surge_line("node = ss, example.com, notaport, password=p")
            .unwrap()
            .unwrap();
        assert!(to_mihomo_proxy(&line).is_err());
    }
}
