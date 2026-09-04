use std::{
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

fn git_output(arguments: &[&str]) -> Option<String> {
    let output = Command::new("git").args(arguments).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn watch_git_path(name: &str) {
    if let Some(path) = git_output(&["rev-parse", "--git-path", name]) {
        println!("cargo:rerun-if-changed={path}");
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=VINKEY_COMMIT_SHA");
    println!("cargo:rerun-if-env-changed=SOURCE_DATE_EPOCH");
    watch_git_path("HEAD");
    watch_git_path("packed-refs");
    if let Some(reference) = git_output(&["symbolic-ref", "-q", "HEAD"]) {
        watch_git_path(&reference);
    }

    let commit_sha = std::env::var("VINKEY_COMMIT_SHA")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| git_output(&["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".into());
    let working_tree_dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .is_some_and(|output| !output.stdout.is_empty());
    let build_time = std::env::var("SOURCE_DATE_EPOCH")
        .ok()
        .and_then(|value| value.parse::<u128>().ok())
        .map(|seconds| seconds * 1_000)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        });

    println!("cargo:rustc-env=VINKEY_COMMIT_SHA={commit_sha}");
    println!("cargo:rustc-env=VINKEY_BUILD_TIME={build_time}");
    println!("cargo:rustc-env=VINKEY_WORKING_TREE_DIRTY={working_tree_dirty}");
    tauri_build::build()
}
