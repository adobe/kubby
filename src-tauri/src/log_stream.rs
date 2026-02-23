use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::kubectl;

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
    previous: bool,
) -> Result<(), String> {
    // Stop any existing log stream first
    stop_log_stream_internal().await;
    
    // Build kubectl logs command
    let mut args = vec![
        "logs".to_string(),
    ];
    
    // Only follow (stream) for current logs; previous logs are finite
    if !previous {
        args.push("-f".to_string());
    }
    
    args.extend([
        "--tail=100".to_string(),
        format!("{}/{}", resource_type, resource_name),
        "--context".to_string(),
        context,
        "--namespace".to_string(),
        namespace,
    ]);
    
    if previous {
        args.push("--previous".to_string());
    }
    
    // If a specific container is requested, use -c flag
    if let Some(container) = container_name {
        args.push("--context".to_string());
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
    let kubectl_path = kubectl::get_path();
    let mut stdbuf_cmd = Command::new("stdbuf");
    stdbuf_cmd
        .arg("-oL") // Line-buffer stdout
        .arg(kubectl_path)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    kubectl::apply_env_async(&mut stdbuf_cmd);
    
    let mut child = stdbuf_cmd.spawn()
        .or_else(|_| {
            // Fallback to direct kubectl if stdbuf is not available
            let mut fallback_cmd = Command::new(kubectl_path);
            fallback_cmd
                .args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            kubectl::apply_env_async(&mut fallback_cmd);
            fallback_cmd.spawn()
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
        // Wait for the process to be reaped to avoid zombie processes
        // and ensure all file descriptors are properly closed
        let _ = child.wait().await;
    }
}

#[tauri::command]
pub async fn stop_log_stream() -> Result<(), String> {
    stop_log_stream_internal().await;
    Ok(())
}

/// Parse timestamp from a log line.
/// Expected formats:
/// - With prefix: [pod/name/container] 2026-01-11T08:00:39.783922111Z log text
/// - Without prefix: 2026-01-11T08:00:39.783922111Z log text
fn parse_log_timestamp(line: &str) -> Option<&str> {
    // Try format with prefix first: [prefix] timestamp
    if line.starts_with('[') {
        if let Some(bracket_end) = line.find("] ") {
            let after_bracket = &line[bracket_end + 2..];
            // Look for ISO8601 timestamp
            if after_bracket.len() >= 30 && after_bracket.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                // Find end of timestamp (space after Z)
                if let Some(space_idx) = after_bracket.find(' ') {
                    let timestamp = &after_bracket[..space_idx];
                    if timestamp.ends_with('Z') {
                        return Some(timestamp);
                    }
                }
            }
        }
    }
    
    // Try format without prefix: timestamp directly at start
    if line.len() >= 30 && line.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
        if let Some(space_idx) = line.find(' ') {
            let timestamp = &line[..space_idx];
            if timestamp.ends_with('Z') {
                return Some(timestamp);
            }
        }
    }
    
    None
}

/// Fetch historical logs (non-streaming, one-shot).
/// Used for lazy loading when user scrolls up.
#[tauri::command]
pub async fn fetch_historical_logs(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
    container_name: Option<String>,
    tail_lines: u32,
    before_timestamp: Option<String>,
    previous: bool,
) -> Result<Vec<String>, String> {
    // Build kubectl logs command (non-streaming)
    let mut args = vec![
        "logs".to_string(),
        format!("--tail={}", tail_lines),
        "--timestamps".to_string(),
        format!("{}/{}", resource_type, resource_name),
        "--context".to_string(),
        context,
        "--namespace".to_string(),
        namespace,
    ];
    
    if previous {
        args.push("--previous".to_string());
    }
    
    // If a specific container is requested, use -c flag
    if let Some(container) = container_name {
        args.push("-c".to_string());
        args.push(container);
    } else {
        // Show logs from all containers
        args.push("--all-containers".to_string());
        args.push("--prefix".to_string());
    }
    
    let kubectl_path = kubectl::get_path();
    let command_str = kubectl::format_command(&args);
    let output = Command::new(kubectl_path)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute kubectl logs: {}\nCommand: {}", e, command_str))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl logs failed: {}\nCommand: {}", stderr.trim(), command_str));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<String> = stdout.lines().map(|s| s.to_string()).collect();
    
    // If no before_timestamp provided, return all lines
    let before_ts = match before_timestamp {
        Some(ts) => ts,
        None => return Ok(lines),
    };
    
    // Filter to only lines with timestamps before the given timestamp
    let filtered: Vec<String> = lines
        .into_iter()
        .filter(|line| {
            if let Some(ts) = parse_log_timestamp(line) {
                // Simple string comparison works for ISO8601 timestamps
                ts < before_ts.as_str()
            } else {
                false // Skip lines without parseable timestamps
            }
        })
        .collect();
    
    Ok(filtered)
}
