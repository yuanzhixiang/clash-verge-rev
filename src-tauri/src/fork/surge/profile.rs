use std::collections::HashMap;

use serde_yaml_ng::{Mapping, Value};

use super::{
    line::{SurgeLine, is_comment, parse_declaration, split_tokens, unquote},
    node::to_mihomo_proxy,
    rule::{LAN_RULES, convert_rule},
};

const DEFAULT_TEST_URL: &str = "https://www.gstatic.com/generate_204";
const DEFAULT_REMOTE_INTERVAL: u64 = 86_400;
const MAX_WARNINGS: usize = 200;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteKind {
    ProxyList,
    RuleSet,
    DomainSet,
}

#[derive(Clone, Debug)]
pub struct Remote {
    pub kind: RemoteKind,
    pub url: String,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct Stats {
    pub proxies: usize,
    pub groups: usize,
    pub rules: usize,
    pub proxy_providers: usize,
    pub rule_providers: usize,
}

pub struct Conversion {
    pub config: Mapping,
    pub remotes: Vec<(String, Remote)>,
    pub stats: Stats,
    pub warnings: Vec<String>,
}

/// Stable id so provider URLs survive reconversion (FNV-1a 64).
pub fn remote_id(kind: RemoteKind, url: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let tag: &[u8] = match kind {
        RemoteKind::ProxyList => b"p",
        RemoteKind::RuleSet => b"r",
        RemoteKind::DomainSet => b"d",
    };
    for byte in tag.iter().chain(url.as_bytes()) {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn text(value: &str) -> Value {
    Value::String(value.to_owned())
}

fn is_enabled(value: &str) -> bool {
    matches!(value.trim().to_ascii_lowercase().as_str(), "true" | "1" | "yes")
}

struct Converter<'a> {
    remote_base: &'a str,
    aliases: HashMap<String, &'static str>,
    proxies: Vec<Value>,
    groups: Vec<Value>,
    proxy_providers: Mapping,
    rule_providers: Mapping,
    rules: Vec<Value>,
    hosts: Mapping,
    nameserver_policy: Mapping,
    remotes: Vec<(String, Remote)>,
    warnings: Vec<String>,
}

impl<'a> Converter<'a> {
    fn new(remote_base: &'a str) -> Self {
        Self {
            remote_base,
            aliases: HashMap::new(),
            proxies: Vec::new(),
            groups: Vec::new(),
            proxy_providers: Mapping::new(),
            rule_providers: Mapping::new(),
            rules: Vec::new(),
            hosts: Mapping::new(),
            nameserver_policy: Mapping::new(),
            remotes: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn warn(&mut self, message: String) {
        if self.warnings.len() < MAX_WARNINGS {
            self.warnings.push(message);
        }
    }

    fn policy(&self, name: &str) -> String {
        let name = unquote(name.trim());
        if let Some(builtin) = self.aliases.get(name) {
            return (*builtin).to_owned();
        }
        match name {
            "REJECT" | "REJECT-TINYGIF" | "REJECT-NO-DROP" => "REJECT".to_owned(),
            other => other.to_owned(),
        }
    }

    fn remote_url(&mut self, kind: RemoteKind, url: &str) -> String {
        let id = remote_id(kind, url);
        if !self.remotes.iter().any(|(existing, _)| existing == &id) {
            self.remotes.push((
                id.clone(),
                Remote {
                    kind,
                    url: url.to_owned(),
                },
            ));
        }
        format!("{}/remote/{id}", self.remote_base)
    }

    fn proxy(&mut self, raw: &str) {
        match parse_declaration(raw) {
            Ok(None) => {}
            Ok(Some(line)) => match line.kind.as_str() {
                "direct" => {
                    self.aliases.insert(line.name.to_owned(), "DIRECT");
                }
                "reject" | "reject-tinygif" | "reject-no-drop" => {
                    self.aliases.insert(line.name.to_owned(), "REJECT");
                }
                "reject-drop" => {
                    self.aliases.insert(line.name.to_owned(), "REJECT-DROP");
                }
                _ => match to_mihomo_proxy(&line) {
                    Ok(proxy) => self.proxies.push(Value::Mapping(proxy)),
                    Err(err) => self.warn(format!("[Proxy] {}: {err}", line.name)),
                },
            },
            Err(err) => self.warn(format!("[Proxy] {}: {err}", raw.trim())),
        }
    }

    fn group(&mut self, raw: &str) {
        let line = match parse_declaration(raw) {
            Ok(Some(line)) => line,
            Ok(None) => return,
            Err(err) => {
                self.warn(format!("[Proxy Group] {}: {err}", raw.trim()));
                return;
            }
        };
        let group = self.build_group(&line);
        self.groups.push(Value::Mapping(group));
    }

    fn build_group(&mut self, line: &SurgeLine<'_>) -> Mapping {
        let kind = match line.kind.as_str() {
            kind @ ("select" | "url-test" | "fallback" | "load-balance") => kind,
            "smart" => {
                self.warn(format!("[Proxy Group] {}: smart group converted to url-test", line.name));
                "url-test"
            }
            other => {
                self.warn(format!("[Proxy Group] {}: {other} group converted to select", line.name));
                "select"
            }
        };

        let mut members: Vec<Value> = line.positional.iter().map(|name| text(&self.policy(name))).collect();
        let mut group = Mapping::new();
        group.insert(text("name"), text(line.name));
        group.insert(text("type"), text(kind));

        let mut remote_interval = DEFAULT_REMOTE_INTERVAL;
        let mut policy_path = None;
        let mut include_all = false;
        for (key, value) in &line.params {
            match key.as_str() {
                "policy-path" => policy_path = Some(value.clone()),
                "update-interval" => remote_interval = value.parse().unwrap_or(DEFAULT_REMOTE_INTERVAL),
                "include-all-proxies" => include_all = is_enabled(value),
                "include-other-group" => {
                    members.extend(value.split(',').map(|name| text(&self.policy(name))));
                }
                "policy-regex-filter" => {
                    group.insert(text("filter"), text(value));
                }
                "url" => {
                    group.insert(text("url"), text(value));
                }
                "interval" | "tolerance" => {
                    if let Ok(number) = value.parse::<u64>() {
                        group.insert(text(key), Value::Number(number.into()));
                    }
                }
                // Surge timeouts are seconds, mihomo's are milliseconds.
                "timeout" => {
                    if let Ok(seconds) = value.parse::<u64>() {
                        group.insert(text("timeout"), Value::Number((seconds * 1000).into()));
                    }
                }
                "hidden" => {
                    group.insert(text("hidden"), Value::Bool(is_enabled(value)));
                }
                _ => {}
            }
        }

        if let Some(url) = policy_path {
            if url.starts_with("http://") || url.starts_with("https://") {
                let provider = format!("policy-{}", line.name);
                let mut entry = Mapping::new();
                entry.insert(text("type"), text("http"));
                entry.insert(text("url"), text(&self.remote_url(RemoteKind::ProxyList, &url)));
                entry.insert(text("interval"), Value::Number(remote_interval.into()));
                self.proxy_providers.insert(text(&provider), Value::Mapping(entry));
                group.insert(text("use"), Value::Sequence(vec![text(&provider)]));
            } else {
                self.warn(format!("[Proxy Group] {}: local policy-path is not supported", line.name));
            }
        }
        if include_all {
            group.insert(text("include-all-proxies"), Value::Bool(true));
        }
        if kind != "select" {
            if !group.contains_key("url") {
                group.insert(text("url"), text(DEFAULT_TEST_URL));
            }
            if !group.contains_key("interval") {
                group.insert(text("interval"), Value::Number(300.into()));
            }
        }
        if members.is_empty() && !group.contains_key("use") && !include_all {
            self.warn(format!("[Proxy Group] {}: no members, falling back to DIRECT", line.name));
            members.push(text("DIRECT"));
        }
        if !members.is_empty() {
            group.insert(text("proxies"), Value::Sequence(members));
        }
        group
    }

    fn rule(&mut self, raw: &str) {
        let tokens = split_tokens(raw);
        let Some(kind) = tokens.first().map(|kind| kind.to_ascii_uppercase()) else {
            return;
        };
        let policy = tokens.get(2).map(|name| self.policy(name));
        match (kind.as_str(), policy) {
            ("FINAL", _) => {
                let policy = tokens.get(1).map_or_else(|| "DIRECT".to_owned(), |name| self.policy(name));
                self.rules.push(text(&format!("MATCH,{policy}")));
            }
            ("RULE-SET" | "DOMAIN-SET", Some(policy)) => self.rule_set(&kind, &tokens, &policy),
            (_, Some(policy)) => match convert_rule(&tokens, &policy) {
                Ok(rule) => self.rules.push(text(&rule)),
                Err(err) => self.warn(format!("[Rule] {raw}: {err}")),
            },
            (_, None) => self.warn(format!("[Rule] {raw}: missing policy")),
        }
    }

    fn rule_set(&mut self, kind: &str, tokens: &[String], policy: &str) {
        let target = unquote(&tokens[1]).to_owned();
        let options = &tokens[3..];
        let no_resolve = options.iter().any(|option| option.eq_ignore_ascii_case("no-resolve"));

        if kind == "RULE-SET" && target == "LAN" {
            for rule in LAN_RULES {
                let suffix = if rule.starts_with("IP-") { ",no-resolve" } else { "" };
                self.rules.push(text(&format!("{rule},{policy}{suffix}")));
            }
            return;
        }
        if !(target.starts_with("http://") || target.starts_with("https://")) {
            self.warn(format!("[Rule] {kind},{target}: only remote rule sets are supported"));
            return;
        }

        let interval = options
            .iter()
            .filter_map(|option| option.trim_matches('"').strip_prefix("update-interval="))
            .find_map(|value| value.parse::<u64>().ok())
            .unwrap_or(DEFAULT_REMOTE_INTERVAL);
        let (remote_kind, behavior) = if kind == "RULE-SET" {
            (RemoteKind::RuleSet, "classical")
        } else {
            (RemoteKind::DomainSet, "domain")
        };
        let name = format!("ruleset-{}", self.rule_providers.len() + 1);
        let mut entry = Mapping::new();
        entry.insert(text("type"), text("http"));
        entry.insert(text("behavior"), text(behavior));
        entry.insert(text("format"), text("text"));
        entry.insert(text("url"), text(&self.remote_url(remote_kind, &target)));
        entry.insert(text("interval"), Value::Number(interval.into()));
        self.rule_providers.insert(text(&name), Value::Mapping(entry));

        let suffix = if no_resolve { ",no-resolve" } else { "" };
        self.rules.push(text(&format!("RULE-SET,{name},{policy}{suffix}")));
    }

    fn host(&mut self, raw: &str) {
        let Some((domain, value)) = raw.split_once('=') else {
            return;
        };
        let domain = domain.trim();
        let value = unquote(value.trim());
        match value.strip_prefix("server:") {
            Some("system") => {}
            Some(server) => {
                self.nameserver_policy.insert(text(domain), text(server.trim()));
            }
            None => {
                self.hosts.insert(text(domain), text(value));
            }
        }
    }
}

fn general_options(general: &[&str], config: &mut Mapping, warnings: &mut Vec<String>) -> Option<Vec<Value>> {
    let mut nameservers = None;
    for raw in general {
        let Some((key, value)) = raw.split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key.trim().to_ascii_lowercase().as_str() {
            "dns-server" => {
                let servers: Vec<Value> = value
                    .split(',')
                    .map(str::trim)
                    .filter(|server| !server.is_empty() && *server != "system")
                    .map(text)
                    .collect();
                if !servers.is_empty() {
                    nameservers = Some(servers);
                }
            }
            "ipv6" => {
                config.insert(text("ipv6"), Value::Bool(is_enabled(value)));
            }
            "loglevel" => {
                let level = match value {
                    "verbose" => "debug",
                    "warning" => "warning",
                    "error" => "error",
                    _ => "info",
                };
                config.insert(text("log-level"), text(level));
            }
            key @ ("skip-proxy" | "block-quic" | "udp-policy-not-supported-behaviour" | "always-real-ip") => {
                warnings.push(format!("[General] {key} is Surge-only and was skipped"));
            }
            _ => {}
        }
    }
    nameservers
}

/// Converts a complete Surge profile into a mihomo config.
/// `remote_base` is the URL prefix under which remote lists are served converted.
pub fn convert_profile(content: &str, remote_base: &str) -> Conversion {
    let mut sections: Vec<(String, Vec<&str>)> = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || is_comment(line) {
            continue;
        }
        if let Some(name) = line.strip_prefix('[').and_then(|rest| rest.strip_suffix(']')) {
            sections.push((name.trim().to_owned(), Vec::new()));
        } else if let Some((_, lines)) = sections.last_mut() {
            lines.push(line);
        }
    }

    let mut converter = Converter::new(remote_base);
    let mut config = Mapping::new();
    let mut general_warnings = Vec::new();
    let mut nameservers = None;
    // Aliases from [Proxy] must exist before groups and rules resolve policies.
    for (name, lines) in &sections {
        match name.as_str() {
            "General" => nameservers = general_options(lines, &mut config, &mut general_warnings),
            "Proxy" => lines.iter().for_each(|line| converter.proxy(line)),
            _ => {}
        }
    }
    for (name, lines) in &sections {
        match name.as_str() {
            "General" | "Proxy" => {}
            "Proxy Group" => lines.iter().for_each(|line| converter.group(line)),
            "Rule" => lines.iter().for_each(|line| converter.rule(line)),
            "Host" => lines.iter().for_each(|line| converter.host(line)),
            other => converter.warn(format!(
                "[{other}] {} lines skipped: not supported by mihomo",
                lines.len()
            )),
        }
    }
    general_warnings.append(&mut converter.warnings);

    if !converter.rules.iter().any(|rule| rule.as_str().is_some_and(|rule| rule.starts_with("MATCH,"))) {
        general_warnings.push("[Rule] no FINAL rule, added MATCH,DIRECT".to_owned());
        converter.rules.push(text("MATCH,DIRECT"));
    }

    if nameservers.is_some() || !converter.nameserver_policy.is_empty() {
        let mut dns = Mapping::new();
        dns.insert(text("enable"), Value::Bool(true));
        if let Some(servers) = nameservers {
            dns.insert(text("nameserver"), Value::Sequence(servers));
        }
        if !converter.nameserver_policy.is_empty() {
            dns.insert(text("nameserver-policy"), Value::Mapping(converter.nameserver_policy));
        }
        config.insert(text("dns"), Value::Mapping(dns));
    }
    if !converter.hosts.is_empty() {
        config.insert(text("hosts"), Value::Mapping(converter.hosts));
    }

    let stats = Stats {
        proxies: converter.proxies.len(),
        groups: converter.groups.len(),
        rules: converter.rules.len(),
        proxy_providers: converter.proxy_providers.len(),
        rule_providers: converter.rule_providers.len(),
    };
    config.insert(text("proxies"), Value::Sequence(converter.proxies));
    if !converter.proxy_providers.is_empty() {
        config.insert(text("proxy-providers"), Value::Mapping(converter.proxy_providers));
    }
    config.insert(text("proxy-groups"), Value::Sequence(converter.groups));
    if !converter.rule_providers.is_empty() {
        config.insert(text("rule-providers"), Value::Mapping(converter.rule_providers));
    }
    config.insert(text("rules"), Value::Sequence(converter.rules));

    Conversion {
        config,
        remotes: converter.remotes,
        stats,
        warnings: general_warnings,
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::indexing_slicing)]
mod tests {
    use super::convert_profile;

    const PROFILE: &str = r#"
[General]
dns-server = system, 119.29.29.29
ipv6 = false
skip-proxy = 127.0.0.1

[Proxy]
Block = reject
exit = socks5, 192.0.2.1, 443, username=u, password=p, underlying-proxy=manual

[Proxy Group]
manual = select, DIRECT, remote, exit
remote = select, policy-path=https://example.com/list.txt, update-interval=3600, include-all-proxies=0

[Rule]
// comment
DOMAIN-SUFFIX,example.com,manual
AND,((PROTOCOL,UDP), (DEST-PORT,3478)),DIRECT
PROTOCOL,STUN,DIRECT
RULE-SET,https://example.com/rules.list,Block,"update-interval=3600"
FINAL,manual,dns-failed

[Host]
example.org = 192.0.2.10

[MITM]
hostname = a.com
"#;

    #[test]
    fn converts_a_full_profile() {
        let conversion = convert_profile(PROFILE, "http://127.0.0.1:1/surge/t");
        let yaml = serde_yaml_ng::to_string(&conversion.config).unwrap();

        assert_eq!(conversion.stats.proxies, 1);
        assert_eq!(conversion.stats.groups, 2);
        assert_eq!(conversion.stats.proxy_providers, 1);
        assert_eq!(conversion.stats.rule_providers, 1);
        assert_eq!(conversion.remotes.len(), 2);
        assert!(yaml.contains("dialer-proxy: manual"));
        assert!(yaml.contains("url: http://127.0.0.1:1/surge/t/remote/"));
        assert!(yaml.contains("AND,((NETWORK,UDP),(DST-PORT,3478)),DIRECT"));
        assert!(yaml.contains("RULE-SET,ruleset-1,REJECT"));
        assert!(yaml.contains("MATCH,manual"));
        assert!(yaml.contains("example.org: 192.0.2.10"));
        assert!(!yaml.contains("system"));
        assert!(conversion.warnings.iter().any(|w| w.contains("STUN")));
        assert!(conversion.warnings.iter().any(|w| w.contains("[MITM]")));
        assert!(conversion.warnings.iter().any(|w| w.contains("skip-proxy")));
    }
}
