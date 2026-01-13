use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

/// Global state for log streaming process
static LOG_STREAM_PROCESS: std::sync::OnceLock<Arc<Mutex<Option<tokio::process::Child>>>> = std::sync::OnceLock::new();

fn get_log_stream_state() -> &'static Arc<Mutex<Option<tokio::process::Child>>> {
    LOG_STREAM_PROCESS.get_or_init(|| Arc::new(Mutex::new(None)))
}

/// Event payload for log lines
#[derive(Clone, Serialize)]
struct LogLinePayload {
    line: String,
}

/// Event payload for log stream errors
#[derive(Clone, Serialize)]
struct LogErrorPayload {
    error: String,
}

/// Event payload for log stream end
#[derive(Clone, Serialize)]
struct LogEndPayload {
    reason: String,
}

#[tauri::command]
pub async fn start_log_stream(
    app: AppHandle,
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
    timestamps: bool,
    container_name: Option<String>,
) -> Result<(), String> {
    // Stop any existing log stream first
    stop_log_stream_internal().await;
    
    // Build kubectl logs command
    let mut args = vec![
        "logs".to_string(),
        "-f".to_string(),
        "--tail=1000".to_string(),
        format!("{}/{}", resource_type, resource_name),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // If a specific container is requested, use -c flag
    if let Some(container) = container_name {
        args.push("-c".to_string());
        args.push(container);
    } else {
        // Show logs from all containers when viewing a pod or higher-level resource (deployment, etc.)
        args.push("--all-containers".to_string());
        args.push("--prefix".to_string()); // Prefix each line with pod/container name
    }
    
    if timestamps {
        args.push("--timestamps".to_string());
    }
    
    // Spawn the kubectl process with unbuffered output
    // Use stdbuf to force line-buffering on stdout for real-time streaming
    let mut child = Command::new("stdbuf")
        .arg("-oL") // Line-buffer stdout
        .arg("kubectl")
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .or_else(|_| {
            // Fallback to direct kubectl if stdbuf is not available
            Command::new("kubectl")
                .args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
        })
        .map_err(|e| format!("Failed to spawn kubectl logs: {}", e))?;
    
    // Take stdout for reading
    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;
    
    // Store the child process for later cleanup
    {
        let state = get_log_stream_state();
        let mut guard = state.lock().await;
        *guard = Some(child);
    }
    
    // Spawn task to read stdout and emit events
    let app_clone = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        
        while let Ok(Some(line)) = lines.next_line().await {
            if app_clone.emit("log-line", LogLinePayload { line }).is_err() {
                break;
            }
        }
        
        // Stream ended
        let _ = app_clone.emit("log-end", LogEndPayload { reason: "Stream ended".to_string() });
    });
    
    // Spawn task to read stderr and emit errors
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.is_empty() {
                let _ = app.emit("log-error", LogErrorPayload { error: line });
            }
        }
    });
    
    Ok(())
}

pub async fn stop_log_stream_internal() {
    let state = get_log_stream_state();
    let mut guard = state.lock().await;
    if let Some(mut child) = guard.take() {
        let _ = child.kill().await;
    }
}

#[tauri::command]
pub async fn stop_log_stream() -> Result<(), String> {
    stop_log_stream_internal().await;
    Ok(())
}
