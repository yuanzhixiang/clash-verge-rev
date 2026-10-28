use serde_yaml_ng::{Mapping, Value};

use super::line::{SurgeLine, parse_declaration};

fn text(value: &str) -> Value {
    Value::String(value.to_owned())
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    }
}

fn insert(map: &mut Mapping, key: &str, value: Value) {
    map.insert(text(key), value);
}

fn insert_bool(map: &mut Mapping, key: &str, raw: &str) -> anyhow::Result<()> {
    let parsed = parse_bool(raw).ok_or_else(|| anyhow::anyhow!("invalid boolean for {key}: {raw:?}"))?;
    insert(map, key, Value::Bool(parsed));
    Ok(())
}

/// Surge `Host:a.com|X-Foo:bar` header list.
fn parse_ws_headers(raw: &str) -> Mapping {
    let mut headers = Mapping::new();
    for pair in raw.split('|') {
        if let Some((key, value)) = pair.split_once(':') {
            insert(&mut headers, key.trim(), text(value.trim()));
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

#[derive(Default)]
struct Transport {
    obfs_mode: Option<String>,
    obfs_host: Option<String>,
    ws: bool,
    ws_path: Option<String>,
    ws_headers: Option<Mapping>,
}

impl Transport {
    fn apply(self, proxy_type: &str, proxy: &mut Mapping) {
        if self.ws {
            insert(proxy, "network", text("ws"));
            let mut ws_opts = Mapping::new();
            if let Some(path) = self.ws_path {
                insert(&mut ws_opts, "path", text(&path));
            }
            if let Some(headers) = self.ws_headers {
                insert(&mut ws_opts, "headers", Value::Mapping(headers));
            }
            if !ws_opts.is_empty() {
                insert(proxy, "ws-opts", Value::Mapping(ws_opts));
            }
        }

        let Some(mode) = self.obfs_mode else {
            return;
        };
        let mut opts = Mapping::new();
        insert(&mut opts, "mode", text(&mode));
        if let Some(host) = self.obfs_host {
            insert(&mut opts, "host", text(&host));
        }
        match proxy_type {
            "ss" => {
                insert(proxy, "plugin", text("obfs"));
                insert(proxy, "plugin-opts", Value::Mapping(opts));
            }
            "snell" => insert(proxy, "obfs-opts", Value::Mapping(opts)),
            _ => {}
        }
    }
}

/// Converts one Surge proxy declaration into a mihomo proxy.
pub fn to_mihomo_proxy(line: &SurgeLine<'_>) -> anyhow::Result<Mapping> {
    let (proxy_type, implied_tls) = match line.kind.as_str() {
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
    let raw_port = line
        .positional
        .get(1)
        .ok_or_else(|| anyhow::anyhow!("missing port"))?;
    let port: u16 = raw_port
        .parse()
        .map_err(|_| anyhow::anyhow!("invalid port: {raw_port:?}"))?;

    let mut proxy = Mapping::new();
    insert(&mut proxy, "name", text(line.name));
    insert(&mut proxy, "type", text(proxy_type));
    insert(&mut proxy, "server", text(server));
    insert(&mut proxy, "port", Value::Number(port.into()));
    if implied_tls {
        insert(&mut proxy, "tls", Value::Bool(true));
    }
    // mihomo rejects vmess proxies without cipher and alterId.
    if proxy_type == "vmess" {
        insert(&mut proxy, "cipher", text("auto"));
        insert(&mut proxy, "alterId", Value::Number(0.into()));
    }

    let mut transport = Transport::default();
    for (key, value) in &line.params {
        apply_param(proxy_type, key, value, &mut proxy, &mut transport)?;
    }
    transport.apply(proxy_type, &mut proxy);
    Ok(proxy)
}

fn apply_param(
    proxy_type: &str,
    key: &str,
    value: &str,
    proxy: &mut Mapping,
    transport: &mut Transport,
) -> anyhow::Result<()> {
    match (proxy_type, key) {
        (_, "udp-relay") => insert_bool(proxy, "udp", value)?,
        (_, "underlying-proxy") => insert(proxy, "dialer-proxy", text(value)),
        (_, "skip-cert-verify") => insert_bool(proxy, "skip-cert-verify", value)?,
        (_, "tfo") => insert_bool(proxy, "tfo", value)?,
        (_, "server-cert-fingerprint-sha256") => insert(proxy, "fingerprint", text(value)),
        (_, "ip-version") => {
            if let Some(mapped) = map_ip_version(value) {
                insert(proxy, "ip-version", text(mapped));
            }
        }

        ("ss" | "vmess", "encrypt-method") => insert(proxy, "cipher", text(value)),
        ("ss" | "anytls" | "trojan" | "socks5" | "http", "password") => insert(proxy, "password", text(value)),
        ("ss" | "snell", "obfs") => transport.obfs_mode = Some(value.to_owned()),
        ("ss" | "snell", "obfs-host") => transport.obfs_host = Some(value.to_owned()),

        ("anytls" | "trojan" | "http", "sni") => insert(proxy, "sni", text(value)),
        ("socks5" | "http", "username") => insert(proxy, "username", text(value)),
        ("socks5" | "http" | "vmess", "tls") => insert_bool(proxy, "tls", value)?,

        ("vmess", "username") => insert(proxy, "uuid", text(value)),
        ("vmess", "sni") => insert(proxy, "servername", text(value)),
        ("vmess", "vmess-aead") => {
            let aead = parse_bool(value).ok_or_else(|| anyhow::anyhow!("invalid boolean for vmess-aead: {value:?}"))?;
            insert(proxy, "alterId", Value::Number(u64::from(!aead).into()));
        }

        ("trojan" | "vmess", "ws") => transport.ws = parse_bool(value) == Some(true),
        ("trojan" | "vmess", "ws-path") => transport.ws_path = Some(value.to_owned()),
        ("trojan" | "vmess", "ws-headers") => transport.ws_headers = Some(parse_ws_headers(value)),

        ("snell", "psk") => insert(proxy, "psk", text(value)),
        ("snell", "version") => {
            let version: u64 = value
                .parse()
                .map_err(|_| anyhow::anyhow!("invalid snell version: {value:?}"))?;
            insert(proxy, "version", Value::Number(version.into()));
        }

        // Surge-only knobs (test-url, interface, block-quic, ...) have no mihomo equivalent.
        _ => {}
    }
    Ok(())
}

pub struct NodeList {
    pub proxies: Vec<Mapping>,
    pub skipped: Vec<String>,
}

/// Accepts either a Surge proxy list or a YAML document with a `proxies` array.
pub fn convert_node_list(content: &str) -> NodeList {
    if let Ok(Value::Mapping(doc)) = serde_yaml_ng::from_str::<Value>(content)
        && let Some(Value::Sequence(items)) = doc.get("proxies")
    {
        return NodeList {
            proxies: items.iter().filter_map(|item| item.as_mapping().cloned()).collect(),
            skipped: Vec::new(),
        };
    }

    let mut list = NodeList {
        proxies: Vec::new(),
        skipped: Vec::new(),
    };
    for raw in content.lines() {
        match parse_declaration(raw) {
            Ok(None) => {}
            Ok(Some(line)) => match to_mihomo_proxy(&line) {
                Ok(proxy) => list.proxies.push(proxy),
                Err(err) => list.skipped.push(format!("{}: {err}", line.name)),
            },
            Err(err) => list.skipped.push(format!("{}: {err}", raw.trim())),
        }
    }
    list
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use serde_yaml_ng::{Mapping, Value};

    use super::{convert_node_list, text, to_mihomo_proxy};
    use crate::fork::surge::line::parse_declaration;

    fn convert(line: &str) -> Mapping {
        to_mihomo_proxy(&parse_declaration(line).unwrap().unwrap()).unwrap()
    }

    #[test]
    fn converts_ss_with_obfs() {
        let proxy = convert(
            "node = ss, example.com, 8100, encrypt-method=aes-256-gcm, password=pw, udp-relay=true, obfs=http, obfs-host=bing.com",
        );
        assert_eq!(proxy.get("cipher"), Some(&text("aes-256-gcm")));
        assert_eq!(proxy.get("udp"), Some(&Value::Bool(true)));
        assert_eq!(proxy.get("plugin"), Some(&text("obfs")));
    }

    #[test]
    fn maps_underlying_proxy_to_dialer_proxy() {
        let proxy = convert("exit = socks5, 192.0.2.1, 443, username=u, password=p, underlying-proxy=manual");
        assert_eq!(proxy.get("dialer-proxy"), Some(&text("manual")));
        assert_eq!(proxy.get("username"), Some(&text("u")));
    }

    #[test]
    fn reads_yaml_and_surge_lists() {
        assert_eq!(
            convert_node_list("proxies:\n  - {name: a, type: ss, server: example.com, port: 1}\n")
                .proxies
                .len(),
            1
        );
        let list = convert_node_list("a = ss, example.com, 1, encrypt-method=aes-128-gcm, password=p\nb = wireguard, x\n");
        assert_eq!(list.proxies.len(), 1);
        assert_eq!(list.skipped.len(), 1);
    }
}
