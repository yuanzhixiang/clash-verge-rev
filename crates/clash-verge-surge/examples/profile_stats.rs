//! Read a Mihomo YAML profile from stdin and report Surge-style CONF round-trip statistics.

use std::io::{self, Read as _};

fn count(mapping: &serde_yaml_ng::Mapping, key: &str) -> usize {
    mapping
        .get(serde_yaml_ng::Value::String(key.to_owned()))
        .and_then(serde_yaml_ng::Value::as_sequence)
        .map_or(0, Vec::len)
}

fn main() -> anyhow::Result<()> {
    let arguments = std::env::args().collect::<Vec<_>>();
    let mut yaml = String::new();
    io::stdin().read_to_string(&mut yaml)?;
    if arguments.iter().any(|argument| argument == "--check-conf") {
        let mapping = clash_verge_surge::parse_profile(&yaml)?;
        let rewritten = clash_verge_surge::serialize_profile(&mapping)?;
        if clash_verge_surge::parse_profile(&rewritten)? != mapping {
            anyhow::bail!("CONF rewrite mismatch")
        }
        println!(
            "{}",
            serde_json::json!({
                "conf_bytes": yaml.len(),
                "proxies": count(&mapping, "proxies"),
                "proxy_groups": count(&mapping, "proxy-groups"),
                "rules": count(&mapping, "rules"),
                "round_trip_equal": true,
            })
        );
        return Ok(());
    }
    let mut value: serde_yaml_ng::Value = serde_yaml_ng::from_str(&yaml)?;
    value.apply_merge()?;
    let expected = value
        .as_mapping()
        .ok_or_else(|| anyhow::anyhow!("YAML root must be a mapping"))?;
    let conf = clash_verge_surge::serialize_profile(expected)?;
    let reparsed = clash_verge_surge::parse_profile(&conf)?;
    if &reparsed != expected {
        anyhow::bail!("CONF round-trip mismatch")
    }
    if arguments.iter().any(|argument| argument == "--emit") {
        print!("{conf}");
        return Ok(());
    }
    println!(
        "{}",
        serde_json::json!({
            "yaml_bytes": yaml.len(),
            "yaml_lines": yaml.lines().count(),
            "conf_bytes": conf.len(),
            "conf_lines": conf.lines().count(),
            "proxies": count(expected, "proxies"),
            "proxy_groups": count(expected, "proxy-groups"),
            "rules": count(expected, "rules"),
            "round_trip_equal": true,
        })
    );
    Ok(())
}
