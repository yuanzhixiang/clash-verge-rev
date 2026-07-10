/// Returns whether this binary was compiled for the read-only Tauri development shell.
pub const fn is_safe_dev() -> bool {
    cfg!(feature = "safe-dev")
}

#[cfg(test)]
mod tests {
    use super::is_safe_dev;

    #[test]
    fn safe_dev_matches_the_compile_time_feature() {
        assert_eq!(is_safe_dev(), cfg!(feature = "safe-dev"));
    }
}
