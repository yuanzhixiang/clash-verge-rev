/// Raw tokens of a Surge `name = type, arg, k=v, ...` declaration.
pub struct SurgeLine<'a> {
    pub name: &'a str,
    pub kind: String,
    pub positional: Vec<String>,
    /// Keys are lowercased.
    pub params: Vec<(String, String)>,
}

pub const fn is_comment(line: &str) -> bool {
    let bytes = line.as_bytes();
    matches!(bytes.first(), Some(b'#' | b';')) || matches!(bytes, [b'/', b'/', ..])
}

/// `Ok(None)` for blank lines, comments and section headers.
pub fn parse_declaration(line: &str) -> anyhow::Result<Option<SurgeLine<'_>>> {
    let trimmed = line.trim();
    if trimmed.is_empty() || is_comment(trimmed) || (trimmed.starts_with('[') && trimmed.ends_with(']')) {
        return Ok(None);
    }

    let Some((name, rest)) = trimmed.split_once('=') else {
        anyhow::bail!("missing '=' separator");
    };
    let name = name.trim();
    if name.is_empty() {
        anyhow::bail!("empty name");
    }

    let tokens = split_tokens(rest);
    let Some((kind, args)) = tokens.split_first() else {
        anyhow::bail!("missing type");
    };

    let mut positional = Vec::new();
    let mut params = Vec::new();
    for token in args {
        match token.split_once('=') {
            Some((key, value)) => params.push((key.trim().to_ascii_lowercase(), unquote(value.trim()).to_owned())),
            None => positional.push(unquote(token).to_owned()),
        }
    }

    Ok(Some(SurgeLine {
        name,
        kind: kind.to_ascii_lowercase(),
        positional,
        params,
    }))
}

/// Splits on commas outside quotes and outside `()`, `[]`, `{}`.
pub fn split_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut depth = 0_u32;
    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                current.push(ch);
            }
            '(' | '[' | '{' if !in_quotes => {
                depth += 1;
                current.push(ch);
            }
            ')' | ']' | '}' if !in_quotes => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if !in_quotes && depth == 0 => {
                push_token(&mut tokens, &current);
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    push_token(&mut tokens, &current);
    tokens
}

fn push_token(tokens: &mut Vec<String>, raw: &str) {
    let token = raw.trim();
    if !token.is_empty() {
        tokens.push(token.to_owned());
    }
}

pub fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(value)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{parse_declaration, split_tokens};

    #[test]
    fn parses_declaration_with_quoted_commas() {
        let line = parse_declaration(r#"node = trojan, example.com, 443, password=p, ws-headers="Host:a.com,b.com""#)
            .unwrap()
            .unwrap();
        assert_eq!(line.name, "node");
        assert_eq!(line.kind, "trojan");
        assert_eq!(line.positional, vec!["example.com", "443"]);
        assert_eq!(
            line.params.last().unwrap(),
            &("ws-headers".to_owned(), "Host:a.com,b.com".to_owned())
        );
    }

    #[test]
    fn keeps_parenthesized_groups_together() {
        assert_eq!(
            split_tokens("AND,((PROTOCOL,UDP), (DEST-PORT,7882)),DIRECT"),
            vec!["AND", "((PROTOCOL,UDP), (DEST-PORT,7882))", "DIRECT"]
        );
    }
}
