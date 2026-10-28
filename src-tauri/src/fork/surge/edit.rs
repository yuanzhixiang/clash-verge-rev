//! Line-level edits of the `[Rule]` section that leave the rest of the file byte-for-byte intact.

use serde::Serialize;

use super::line::{is_comment, parse_declaration, split_tokens};

/// Matchers that can be added from the UI and CLI; anything else is edited in the file itself.
pub const EDITABLE_KINDS: &[&str] = &["DOMAIN-SUFFIX", "DOMAIN", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6"];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RuleEntry {
    #[serde(rename = "type")]
    pub kind: String,
    pub value: String,
    pub policy: String,
    pub editable: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Change {
    Added,
    Updated { previous: String },
    Unchanged,
}

fn section_name(line: &str) -> Option<&str> {
    line.trim()
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .map(str::trim)
}

/// Byte ranges `(start, end)` of every line, without its terminator.
fn line_spans(content: &str) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut start = 0;
    for (index, byte) in content.bytes().enumerate() {
        if byte == b'\n' {
            let end = if index > start && content.as_bytes()[index - 1] == b'\r' {
                index - 1
            } else {
                index
            };
            spans.push((start, end));
            start = index + 1;
        }
    }
    if start < content.len() {
        spans.push((start, content.len()));
    }
    spans
}

struct RuleLine {
    span: (usize, usize),
    tokens: Vec<String>,
}

/// The `[Rule]` header span and the rule lines below it.
fn rule_section(content: &str) -> Option<((usize, usize), Vec<RuleLine>)> {
    let mut header = None;
    let mut lines = Vec::new();
    for span in line_spans(content) {
        let line = &content[span.0..span.1];
        if let Some(name) = section_name(line) {
            if header.is_some() {
                break;
            }
            if name == "Rule" {
                header = Some(span);
            }
            continue;
        }
        let trimmed = line.trim();
        if header.is_none() || trimmed.is_empty() || is_comment(trimmed) {
            continue;
        }
        lines.push(RuleLine {
            span,
            tokens: split_tokens(trimmed),
        });
    }
    header.map(|header| (header, lines))
}

fn same_matcher(tokens: &[String], kind: &str, value: &str) -> bool {
    matches!(tokens, [k, v, ..] if k.eq_ignore_ascii_case(kind) && v.eq_ignore_ascii_case(value))
}

pub fn list_rules(content: &str) -> Vec<RuleEntry> {
    let Some((_, lines)) = rule_section(content) else {
        return Vec::new();
    };
    lines
        .iter()
        .filter_map(|line| match line.tokens.as_slice() {
            [kind, value, policy, ..] => Some(RuleEntry {
                editable: EDITABLE_KINDS.iter().any(|k| k.eq_ignore_ascii_case(kind)),
                kind: kind.to_ascii_uppercase(),
                value: value.clone(),
                policy: policy.clone(),
            }),
            _ => None,
        })
        .collect()
}

/// Built-in policies plus every `[Proxy]` and `[Proxy Group]` name.
pub fn list_policies(content: &str) -> Vec<String> {
    let mut policies = vec!["DIRECT".to_owned(), "REJECT".to_owned()];
    let mut section = "";
    for raw in content.lines() {
        if let Some(name) = section_name(raw) {
            section = name;
            continue;
        }
        if !matches!(section, "Proxy" | "Proxy Group") {
            continue;
        }
        if let Ok(Some(line)) = parse_declaration(raw)
            && !policies.iter().any(|known| known == line.name)
        {
            policies.push(line.name.to_owned());
        }
    }
    policies
}

/// Normalizes and validates user input into `(KIND, value)`.
pub fn normalize(kind: &str, value: &str) -> Result<(String, String), String> {
    let kind = kind.trim().to_ascii_uppercase();
    if !EDITABLE_KINDS.contains(&kind.as_str()) {
        return Err(format!(
            "{kind} cannot be edited here; supported: {}",
            EDITABLE_KINDS.join(", ")
        ));
    }
    let mut value = value.trim().trim_end_matches('.').to_ascii_lowercase();
    if kind == "DOMAIN-SUFFIX" {
        value = value.trim_start_matches('.').to_owned();
    }
    if value.is_empty() || value.contains([',', '"', '\n', '\r', ' ']) {
        return Err(format!("invalid {kind} value `{value}`"));
    }
    if kind.starts_with("IP-CIDR") && !value.contains('/') {
        value = if value.contains(':') {
            format!("{value}/128")
        } else {
            format!("{value}/32")
        };
    }
    Ok((kind, value))
}

/// Sets the policy of `KIND,value`, inserting the rule at the top of `[Rule]` when absent.
pub fn upsert_rule(content: &str, kind: &str, value: &str, policy: &str) -> Result<(String, Change), String> {
    let (header, lines) = rule_section(content).ok_or("the profile has no [Rule] section")?;
    if let Some(line) = lines.iter().find(|line| same_matcher(&line.tokens, kind, value)) {
        let previous = line.tokens.get(2).cloned().unwrap_or_default();
        if previous == policy {
            return Ok((content.to_owned(), Change::Unchanged));
        }
        let mut tokens = line.tokens.clone();
        tokens[2] = policy.to_owned();
        let text = &content[line.span.0..line.span.1];
        let indent = &text[..text.len() - text.trim_start().len()];
        let replaced = format!(
            "{}{indent}{}{}",
            &content[..line.span.0],
            tokens.join(","),
            &content[line.span.1..]
        );
        return Ok((replaced, Change::Updated { previous }));
    }

    let newline = if content[header.1..].starts_with("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let insert_at = header.1;
    let inserted = format!(
        "{}{newline}{kind},{value},{policy}{}",
        &content[..insert_at],
        &content[insert_at..]
    );
    Ok((inserted, Change::Added))
}

/// Removes every `KIND,value` line from `[Rule]`, returning the removed policy.
pub fn remove_rule(content: &str, kind: &str, value: &str) -> Result<(String, String), String> {
    let (_, lines) = rule_section(content).ok_or("the profile has no [Rule] section")?;
    let matched: Vec<&RuleLine> = lines
        .iter()
        .filter(|line| same_matcher(&line.tokens, kind, value))
        .collect();
    let first = matched.first().ok_or_else(|| format!("no rule {kind},{value}"))?;
    let policy = first.tokens.get(2).cloned().unwrap_or_default();

    let mut result = String::with_capacity(content.len());
    let mut cursor = 0;
    for line in matched {
        result.push_str(&content[cursor..line.span.0]);
        cursor = line.span.1;
        // Drop the line terminator too so no blank line is left behind.
        if content[cursor..].starts_with("\r\n") {
            cursor += 2;
        } else if content[cursor..].starts_with('\n') {
            cursor += 1;
        }
    }
    result.push_str(&content[cursor..]);
    Ok((result, policy))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{Change, list_policies, list_rules, normalize, remove_rule, upsert_rule};

    const PROFILE: &str = "[Proxy]\nnode = trojan, a.com, 443, password=p\n\n[Proxy Group]\nai = select, node\n\n[Rule]\nDOMAIN-SUFFIX,a.com,ai\n# note\nRULE-SET,https://x/list,DIRECT\nFINAL,DIRECT\n\n[Host]\na.com = 1.1.1.1\n";

    #[test]
    fn inserts_new_rules_at_the_top_of_the_section() {
        let (next, change) = upsert_rule(PROFILE, "DOMAIN-SUFFIX", "b.com", "node").unwrap();
        assert_eq!(change, Change::Added);
        assert!(next.contains("[Rule]\nDOMAIN-SUFFIX,b.com,node\nDOMAIN-SUFFIX,a.com,ai\n"));
        assert_eq!(next.len(), PROFILE.len() + "DOMAIN-SUFFIX,b.com,node\n".len());
    }

    #[test]
    fn updates_and_removes_existing_rules_in_place() {
        let (next, change) = upsert_rule(PROFILE, "domain-suffix", "A.com", "DIRECT").unwrap();
        assert_eq!(
            change,
            Change::Updated {
                previous: "ai".to_owned()
            }
        );
        assert!(next.contains("[Rule]\nDOMAIN-SUFFIX,a.com,DIRECT\n# note\n"));
        assert_eq!(
            upsert_rule(&next, "DOMAIN-SUFFIX", "a.com", "DIRECT").unwrap().1,
            Change::Unchanged
        );

        let (removed, policy) = remove_rule(PROFILE, "DOMAIN-SUFFIX", "a.com").unwrap();
        assert_eq!(policy, "ai");
        assert!(removed.contains("[Rule]\n# note\nRULE-SET"));
    }

    #[test]
    fn keeps_crlf_line_endings() {
        let crlf = PROFILE.replace('\n', "\r\n");
        let (next, _) = upsert_rule(&crlf, "DOMAIN", "b.com", "ai").unwrap();
        assert!(next.contains("[Rule]\r\nDOMAIN,b.com,ai\r\nDOMAIN-SUFFIX"));
        let (removed, _) = remove_rule(&crlf, "DOMAIN-SUFFIX", "a.com").unwrap();
        assert!(removed.contains("[Rule]\r\n# note\r\n"));
    }

    #[test]
    fn lists_rules_and_policies() {
        let rules = list_rules(PROFILE);
        assert_eq!(rules.len(), 2);
        assert!(rules[0].editable);
        assert!(!rules[1].editable);
        assert_eq!(list_policies(PROFILE), vec!["DIRECT", "REJECT", "node", "ai"]);
    }

    #[test]
    fn normalizes_input() {
        assert_eq!(
            normalize("domain-suffix", " .Foo.com. ").unwrap(),
            ("DOMAIN-SUFFIX".to_owned(), "foo.com".to_owned())
        );
        assert_eq!(normalize("IP-CIDR", "1.2.3.4").unwrap().1, "1.2.3.4/32");
        assert!(normalize("RULE-SET", "x").is_err());
        assert!(normalize("DOMAIN", "a,b").is_err());
    }
}
