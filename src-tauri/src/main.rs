// 0xFLUX desktop shell. Developed by 0x3.
// Locates the Python backend, starts it as a hidden child process, opens the
// webview, and stops the backend when the window closes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct Backend(Mutex<Option<Child>>);

/// Find the folder that contains `app/main.py`, both in development
/// (src-tauri/target/debug/…) and in an installed build (next to the exe).
fn backend_dir() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("backend"));
            candidates.push(dir.join("..").join("backend"));
            candidates.push(dir.join("..").join("..").join("..").join("backend"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("backend"));
        candidates.push(cwd.join("..").join("backend"));
    }
    candidates
        .into_iter()
        .find(|p| p.join("flux_engine.py").exists())
}

/// The frozen engine shipped by the installer, next to 0xFLUX.exe.
fn bundled_engine() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name = if cfg!(windows) { "0xflux-engine.exe" } else { "0xflux-engine" };
    let path = exe.parent()?.join(name);
    path.exists().then_some(path)
}

fn spawn_backend() -> Option<Child> {
    let parent = std::process::id().to_string();

    // 1) Installed build: run the bundled engine — no Python needed.
    if let Some(engine) = bundled_engine() {
        let mut cmd = Command::new(&engine);
        cmd.args(["--parent-pid", &parent]);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        match cmd.spawn() {
            Ok(child) => return Some(child),
            Err(e) => eprintln!("[0xFLUX] bundled engine failed to start: {e}"),
        }
    }

    // 2) Development: run the backend from source with Python.
    let dir = match backend_dir() {
        Some(d) => d,
        None => {
            eprintln!("[0xFLUX] backend folder not found next to the application");
            return None;
        }
    };

    let mut pythons: Vec<PathBuf> = Vec::new();
    let venv = if cfg!(windows) {
        dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        dir.join(".venv").join("bin").join("python")
    };
    if venv.exists() {
        pythons.push(venv);
    }
    for name in ["python", "py", "python3"] {
        pythons.push(PathBuf::from(name));
    }

    for py in pythons {
        let mut cmd = Command::new(&py);
        cmd.args(["flux_engine.py", "--parent-pid", &parent]).current_dir(&dir);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        if let Ok(child) = cmd.spawn() {
            println!("[0xFLUX] backend started with {}", py.display());
            return Some(child);
        }
    }
    eprintln!("[0xFLUX] could not start the backend — is Python installed?");
    None
}

fn main() {
    tauri::Builder::default()
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let state = app.state::<Backend>();
            *state.0.lock().unwrap() = spawn_backend();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Backend>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running 0xFLUX");
}
