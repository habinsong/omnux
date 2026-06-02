use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

fn main() {
    ensure_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_sidecar_placeholder() {
    let target_triple = env::var("TARGET")
        .or_else(|_| env::var("HOST"))
        .unwrap_or_else(|_| "unknown-local-target".to_string());
    let extension = if target_triple.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar_path = PathBuf::from("binaries")
        .join(format!("omnux-middleware-{target_triple}{extension}"));

    if sidecar_path.exists() {
        return;
    }

    if let Some(parent) = sidecar_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if target_triple.contains("windows") {
        let _ = fs::write(&sidecar_path, b"omnux middleware sidecar placeholder\n");
        return;
    }

    let _ = fs::write(
        &sidecar_path,
        b"#!/bin/sh\necho 'omnux middleware sidecar was not built. Run npm run build:sidecar.' >&2\nexit 1\n",
    );
    make_executable(&sidecar_path);
}

#[cfg(unix)]
fn make_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    if let Ok(metadata) = fs::metadata(path) {
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        let _ = fs::set_permissions(path, permissions);
    }
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) {}
