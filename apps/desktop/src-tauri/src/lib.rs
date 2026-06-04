use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

const DESKTOP_MIDDLEWARE_PORT: &str = "41880";
const DESKTOP_MIDDLEWARE_PROJECT: &str = "apps/omnux-middleware/Omnux.Middleware.csproj";
const MIDDLEWARE_BOOTSTRAP_EVENT: &str = "omnux://middleware-bootstrap";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MiddlewareBootstrapEvent {
    phase: &'static str,
    pid: Option<u32>,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartOnLaunchState {
    supported: bool,
    enabled: bool,
    configured_path: String,
    message: String,
}

#[derive(Default)]
struct MiddlewareBootstrapState {
    child: Mutex<Option<(u32, tauri_plugin_shell::process::CommandChild)>>,
}

impl MiddlewareBootstrapState {
    fn store(&self, pid: u32, child: tauri_plugin_shell::process::CommandChild) {
        *self.child.lock().expect("middleware bootstrap state lock") = Some((pid, child));
    }

    fn clear_if_pid(&self, pid: u32) {
        let mut guard = self.child.lock().expect("middleware bootstrap state lock");
        if guard.as_ref().is_some_and(|(stored_pid, _)| *stored_pid == pid) {
            guard.take();
        }
    }

    fn kill(&self) {
        if let Some((_, child)) = self.child.lock().expect("middleware bootstrap state lock").take()
        {
            let _ = child.kill();
        }
    }
}

fn desktop_repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("desktop repository root")
        .to_path_buf()
}

fn emit_middleware_bootstrap_event(
    app: &AppHandle,
    phase: &'static str,
    pid: Option<u32>,
    message: impl Into<String>,
) {
    let _ = app.emit(
        MIDDLEWARE_BOOTSTRAP_EVENT,
        MiddlewareBootstrapEvent {
            phase,
            pid,
            message: message.into(),
        },
    );
}

fn current_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|error| format!("현재 실행 파일 경로를 확인하지 못했다: {error}"))
        .map(|path| path.to_string_lossy().to_string())
}

// 자동 시작은 Tauri 공식 autostart 플러그인(승인된 셸 API)에 위임한다.
// Rust 셸에서 OS 명령(reg 등)을 직접 실행하지 않는다.
#[tauri::command]
fn get_start_on_launch_state(app: AppHandle) -> Result<StartOnLaunchState, String> {
    let enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|error| format!("자동 시작 상태를 확인하지 못했다: {error}"))?;
    Ok(StartOnLaunchState {
        supported: true,
        enabled,
        configured_path: current_exe_path()?,
        message: "OS 로그인 시 자동 시작 (tauri-plugin-autostart)".to_string(),
    })
}

#[tauri::command]
fn set_start_on_launch(app: AppHandle, enabled: bool) -> Result<StartOnLaunchState, String> {
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|error| format!("자동 시작 설정에 실패했다: {error}"))?;
    } else {
        manager
            .disable()
            .map_err(|error| format!("자동 시작 해제에 실패했다: {error}"))?;
    }
    let current = manager
        .is_enabled()
        .map_err(|error| format!("자동 시작 상태를 확인하지 못했다: {error}"))?;
    Ok(StartOnLaunchState {
        supported: true,
        enabled: current,
        configured_path: current_exe_path()?,
        message: "OS 로그인 시 자동 시작 (tauri-plugin-autostart)".to_string(),
    })
}

fn bootstrap_desktop_middleware(app: AppHandle) {
    #[cfg(debug_assertions)]
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_dev_middleware_bootstrap(app).await {
            eprintln!("[desktop-bootstrap] .NET 미들웨어 시작 실패: {error}");
        }
    });

    #[cfg(not(debug_assertions))]
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_sidecar_middleware_bootstrap(app).await {
            eprintln!("[desktop-bootstrap] .NET 미들웨어 sidecar 시작 실패: {error}");
        }
    });
}

#[cfg(debug_assertions)]
async fn run_dev_middleware_bootstrap(app: AppHandle) -> Result<(), String> {
    let repo_root = desktop_repo_root();
    let project_path = repo_root.join(DESKTOP_MIDDLEWARE_PROJECT);
    let project_arg = project_path.to_string_lossy().to_string();
    emit_middleware_bootstrap_event(
        &app,
        "starting",
        None,
        ".NET 미들웨어 dev bootstrap을 시작한다.",
    );
    let (mut rx, child) = match app
        .shell()
        .command("dotnet")
        .args(["run", "--project", project_arg.as_str(), "--no-launch-profile"])
        .current_dir(repo_root)
        .env("OMNUX_WS_PORT", DESKTOP_MIDDLEWARE_PORT)
        .env("OMNUX_TELEGRAM_POLLING_DISABLED", "1")
        .spawn()
    {
        Ok(result) => result,
        Err(error) => {
            let message = format!("dotnet run spawn 실패: {error}");
            emit_middleware_bootstrap_event(&app, "error", None, message.clone());
            return Err(message);
        }
    };
    let pid = child.pid();
    app.state::<MiddlewareBootstrapState>().store(pid, child);
    emit_middleware_bootstrap_event(
        &app,
        "started",
        Some(pid),
        format!(".NET 미들웨어 dev bootstrap 시작됨 (ws={DESKTOP_MIDDLEWARE_PORT})"),
    );
    println!(
        "[desktop-bootstrap] .NET 미들웨어를 시작했다 (pid={pid}, ws={DESKTOP_MIDDLEWARE_PORT})"
    );

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let message = String::from_utf8_lossy(&line).trim().to_string();
                if !message.is_empty() {
                    println!("[desktop-bootstrap][middleware][stdout] {message}");
                }
            }
            CommandEvent::Stderr(line) => {
                let message = String::from_utf8_lossy(&line).trim().to_string();
                if !message.is_empty() {
                    emit_middleware_bootstrap_event(&app, "stderr", Some(pid), message.clone());
                    eprintln!("[desktop-bootstrap][middleware][stderr] {message}");
                }
            }
            CommandEvent::Error(message) => {
                emit_middleware_bootstrap_event(&app, "error", Some(pid), message.clone());
                eprintln!("[desktop-bootstrap][middleware][error] {message}");
            }
            CommandEvent::Terminated(payload) => {
                emit_middleware_bootstrap_event(
                    &app,
                    "terminated",
                    Some(pid),
                    format!(
                        ".NET 미들웨어 종료됨 (code={:?}, signal={:?})",
                        payload.code, payload.signal
                    ),
                );
                println!(
                    "[desktop-bootstrap] .NET 미들웨어가 종료됐다 (pid={pid}, code={:?}, signal={:?})",
                    payload.code, payload.signal
                );
                app.state::<MiddlewareBootstrapState>().clear_if_pid(pid);
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

#[cfg(not(debug_assertions))]
const DESKTOP_MIDDLEWARE_SIDECAR: &str = "omnux-middleware";

#[cfg(not(debug_assertions))]
async fn run_sidecar_middleware_bootstrap(app: AppHandle) -> Result<(), String> {
    emit_middleware_bootstrap_event(
        &app,
        "starting",
        None,
        ".NET 미들웨어 sidecar bootstrap을 시작한다.",
    );
    let (rx, child) = match app
        .shell()
        .sidecar(DESKTOP_MIDDLEWARE_SIDECAR)
        .map_err(|error| format!("sidecar command 생성 실패: {error}"))?
        .env("OMNUX_WS_PORT", DESKTOP_MIDDLEWARE_PORT)
        .env("OMNUX_TELEGRAM_POLLING_DISABLED", "1")
        .spawn()
    {
        Ok(result) => result,
        Err(error) => {
            let message = format!("sidecar spawn 실패: {error}");
            emit_middleware_bootstrap_event(&app, "error", None, message.clone());
            return Err(message);
        }
    };
    let pid = child.pid();
    app.state::<MiddlewareBootstrapState>().store(pid, child);
    emit_middleware_bootstrap_event(
        &app,
        "started",
        Some(pid),
        format!(".NET 미들웨어 sidecar 시작됨 (ws={DESKTOP_MIDDLEWARE_PORT})"),
    );
    println!(
        "[desktop-bootstrap] .NET 미들웨어 sidecar를 시작했다 (pid={pid}, ws={DESKTOP_MIDDLEWARE_PORT})"
    );
    watch_middleware_bootstrap(app, rx, pid).await;
    Ok(())
}

#[cfg(not(debug_assertions))]
async fn watch_middleware_bootstrap(
    app: AppHandle,
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    pid: u32,
) {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let message = String::from_utf8_lossy(&line).trim().to_string();
                if !message.is_empty() {
                    println!("[desktop-bootstrap][middleware][stdout] {message}");
                }
            }
            CommandEvent::Stderr(line) => {
                let message = String::from_utf8_lossy(&line).trim().to_string();
                if !message.is_empty() {
                    emit_middleware_bootstrap_event(&app, "stderr", Some(pid), message.clone());
                    eprintln!("[desktop-bootstrap][middleware][stderr] {message}");
                }
            }
            CommandEvent::Error(message) => {
                emit_middleware_bootstrap_event(&app, "error", Some(pid), message.clone());
                eprintln!("[desktop-bootstrap][middleware][error] {message}");
            }
            CommandEvent::Terminated(payload) => {
                emit_middleware_bootstrap_event(
                    &app,
                    "terminated",
                    Some(pid),
                    format!(
                        ".NET 미들웨어 종료됨 (code={:?}, signal={:?})",
                        payload.code, payload.signal
                    ),
                );
                println!(
                    "[desktop-bootstrap] .NET 미들웨어가 종료됐다 (pid={pid}, code={:?}, signal={:?})",
                    payload.code, payload.signal
                );
                app.state::<MiddlewareBootstrapState>().clear_if_pid(pid);
                break;
            }
            _ => {}
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(MiddlewareBootstrapState::default())
        .invoke_handler(tauri::generate_handler![
            get_start_on_launch_state,
            set_start_on_launch
        ])
        .setup(|app| {
            bootstrap_desktop_middleware(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building omnux desktop shell")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                emit_middleware_bootstrap_event(
                    app,
                    "stopping",
                    None,
                    ".NET 미들웨어 bootstrap child process를 정리한다.",
                );
                app.state::<MiddlewareBootstrapState>().kill();
            }
        });
}
