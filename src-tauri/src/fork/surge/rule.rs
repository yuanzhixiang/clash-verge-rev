use super::line::{is_comment, split_tokens, unquote};

/// Converts a policy-less `TYPE,VALUE` matcher, as found in logic rules and rule sets.
pub fn convert_matcher(kind: &str, value: &str) -> Result<String, String> {
    let kind = kind.trim().to_ascii_uppercase();
    let value = unquote(value.trim());
    match kind.as_str() {
        "AND" | "OR" | "NOT" => convert_logic(&kind, value),
        "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD" | "DOMAIN-WILDCARD" | "IP-CIDR" | "IP-CIDR6" | "GEOIP"
        | "IP-ASN" | "SRC-PORT" | "IN-PORT" | "PROCESS-PATH" => Ok(format!("{kind},{value}")),
        "DEST-PORT" | "DST-PORT" => Ok(format!("DST-PORT,{value}")),
        "SRC-IP" if value.contains('/') => Ok(format!("SRC-IP-CIDR,{value}")),
        "SRC-IP" => Ok(format!("SRC-IP-CIDR,{value}/32")),
        "PROTOCOL" => match value.to_ascii_uppercase().as_str() {
            protocol @ ("TCP" | "UDP") => Ok(format!("NETWORK,{protocol}")),
            other => Err(format!("PROTOCOL,{other} has no mihomo equivalent")),
        },
        // Surge matches a process path when the value contains a slash; a trailing slash means a directory prefix.
        "PROCESS-NAME" if value.ends_with('/') => Ok(format!("PROCESS-PATH-REGEX,^{}", regex::escape(value))),
        "PROCESS-NAME" if value.contains('/') => Ok(format!("PROCESS-PATH,{value}")),
        "PROCESS-NAME" => Ok(format!("PROCESS-NAME,{value}")),
        other => Err(format!("{other} rules are not supported by mihomo")),
    }
}

/// `((A,x), (B,y))` -> `((A,x),(B,y))` with each sub-rule converted.
fn convert_logic(kind: &str, inner: &str) -> Result<String, String> {
    let body = inner
        .trim()
        .strip_prefix('(')
        .and_then(|rest| rest.strip_suffix(')'))
        .ok_or_else(|| format!("malformed {kind} rule"))?;

    let mut parts = Vec::new();
    for sub in split_tokens(body) {
        let sub = sub
            .trim()
            .strip_prefix('(')
            .and_then(|rest| rest.strip_suffix(')'))
            .ok_or_else(|| format!("malformed {kind} sub-rule: {sub}"))?;
        let tokens = split_tokens(sub);
        let [sub_kind, sub_value, ..] = tokens.as_slice() else {
            return Err(format!("malformed {kind} sub-rule: {sub}"));
        };
        parts.push(format!("({})", convert_matcher(sub_kind, sub_value)?));
    }
    Ok(format!("{kind},({})", parts.join(",")))
}

/// Converts a full rule line given its already-mapped policy.
pub fn convert_rule(tokens: &[String], policy: &str) -> Result<String, String> {
    let [kind, value, _policy, options @ ..] = tokens else {
        return Err(format!("malformed rule: {}", tokens.join(",")));
    };
    let matcher = convert_matcher(kind, value)?;
    let no_resolve = options.iter().any(|option| option.eq_ignore_ascii_case("no-resolve"));
    Ok(if no_resolve {
        format!("{matcher},{policy},no-resolve")
    } else {
        format!("{matcher},{policy}")
    })
}

pub struct ConvertedSet {
    pub content: String,
    pub dropped: usize,
}

/// Surge rule set -> mihomo `classical` text provider.
pub fn convert_rule_set(content: &str) -> ConvertedSet {
    let mut lines = Vec::new();
    let mut dropped = 0;
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || is_comment(line) {
            continue;
        }
        let tokens = split_tokens(line);
        let converted = match tokens.as_slice() {
            [kind, value, options @ ..] => convert_matcher(kind, value).map(|matcher| {
                if options.iter().any(|option| option.eq_ignore_ascii_case("no-resolve")) {
                    format!("{matcher},no-resolve")
                } else {
                    matcher
                }
            }),
            _ => Err(String::new()),
        };
        match converted {
            Ok(rule) => lines.push(rule),
            Err(_) => dropped += 1,
        }
    }
    ConvertedSet {
        content: lines.join("\n"),
        dropped,
    }
}

/// Surge domain set -> mihomo `domain` text provider. Surge `.example.com` also matches the apex.
pub fn convert_domain_set(content: &str) -> ConvertedSet {
    let lines: Vec<String> = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !is_comment(line))
        .map(|line| match line.strip_prefix('.') {
            Some(suffix) => format!("+.{suffix}"),
            None => line.to_owned(),
        })
        .collect();
    ConvertedSet {
        content: lines.join("\n"),
        dropped: 0,
    }
}

/// Surge's built-in `LAN` rule set.
pub const LAN_RULES: &[&str] = &[
    "DOMAIN-SUFFIX,local",
    "IP-CIDR,10.0.0.0/8",
    "IP-CIDR,100.64.0.0/10",
    "IP-CIDR,127.0.0.0/8",
    "IP-CIDR,169.254.0.0/16",
    "IP-CIDR,172.16.0.0/12",
    "IP-CIDR,192.168.0.0/16",
    "IP-CIDR6,fe80::/10",
];

#[cfg(test)]
mod tests {
    use super::{convert_domain_set, convert_matcher, convert_rule, convert_rule_set};
    use crate::fork::surge::line::split_tokens;

    #[test]
    fn converts_logic_rules_with_renamed_matchers() {
        let tokens = split_tokens("AND,((PROTOCOL,UDP), (DEST-PORT,7882)),DIRECT");
        assert_eq!(
            convert_rule(&tokens, "DIRECT"),
            Ok("AND,((NETWORK,UDP),(DST-PORT,7882)),DIRECT".to_owned())
        );
        assert!(convert_matcher("PROTOCOL", "STUN").is_err());
    }

    #[test]
    fn converts_process_paths() {
        assert_eq!(
            convert_matcher("PROCESS-NAME", "/Applications/Donut.app/"),
            Ok(r"PROCESS-PATH-REGEX,^/Applications/Donut\.app/".to_owned())
        );
        assert_eq!(
            convert_matcher("PROCESS-NAME", r#""Grok Bot""#),
            Ok("PROCESS-NAME,Grok Bot".to_owned())
        );
    }

    #[test]
    fn keeps_no_resolve_and_drops_unsupported_lines() {
        let set = convert_rule_set("# c\nIP-CIDR,1.0.0.0/8,no-resolve\nURL-REGEX,^http://a\nDOMAIN,a.com\n");
        assert_eq!(set.content, "IP-CIDR,1.0.0.0/8,no-resolve\nDOMAIN,a.com");
        assert_eq!(set.dropped, 1);
        assert_eq!(convert_domain_set(".a.com\nb.com\n").content, "+.a.com\nb.com");
    }
}
