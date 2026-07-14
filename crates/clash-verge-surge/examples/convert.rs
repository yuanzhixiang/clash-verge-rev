//! 开发用：从 stdin 读入节点列表文本，输出 mihomo provider YAML。
//! 用法：curl -s <url> | cargo run -p clash-verge-surge --example convert

use std::io::Read as _;

fn main() -> anyhow::Result<()> {
    let mut content = String::new();
    std::io::stdin().read_to_string(&mut content)?;
    let output = clash_verge_surge::convert_node_list(&content);
    for skipped in &output.skipped {
        eprintln!(
            "skipped line {} ({}): {}",
            skipped.line_no,
            skipped.name.as_deref().unwrap_or("-"),
            skipped.reason
        );
    }
    eprintln!("converted {} proxies", output.proxies.len());
    let mut doc = serde_yaml_ng::Mapping::new();
    doc.insert(
        serde_yaml_ng::Value::String("proxies".into()),
        serde_yaml_ng::Value::Sequence(
            output
                .proxies
                .into_iter()
                .map(serde_yaml_ng::Value::Mapping)
                .collect(),
        ),
    );
    println!("{}", serde_yaml_ng::to_string(&doc)?);
    Ok(())
}
