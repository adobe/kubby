/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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
    
    // If a specific container is requested, use --container flag
    if let Some(container) = container_name {
        args.push("--container".to_string());
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
    
    let result = kubectl::run(&args).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl logs failed: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
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

/// Write log contents to a file in the user's Downloads directory (falling back
/// to the home directory). Returns the absolute path of the written file.
async fn write_to_downloads(file_name: &str, contents: &str) -> Result<String, String> {
    // Resolve the home directory (HOME on macOS/Linux, USERPROFILE on Windows)
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not resolve home directory".to_string())?;

    // Prefer ~/Downloads, fall back to the home directory itself
    let downloads = std::path::Path::new(&home).join("Downloads");
    let dir = if downloads.is_dir() {
        downloads
    } else {
        std::path::PathBuf::from(&home)
    };

    // Sanitize the file name so it can't escape the target directory
    let safe_name = file_name.replace(['/', '\\'], "-");
    let path = dir.join(safe_name);

    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| format!("Failed to save logs: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// Save already-loaded log contents to a file in the user's Downloads directory.
/// Returns the absolute path of the written file.
#[tauri::command]
pub async fn save_pod_logs(file_name: String, contents: String) -> Result<String, String> {
    write_to_downloads(&file_name, &contents).await
}

/// Fetch the complete log for a resource in a single (non-streaming) call.
/// `previous` targets the previously terminated container instance.
async fn fetch_full_logs(
    resource_type: &str,
    resource_name: &str,
    context: &str,
    namespace: &str,
    container_name: &Option<String>,
    timestamps: bool,
    previous: bool,
) -> Result<String, String> {
    let mut args = vec![
        "logs".to_string(),
        "--tail=-1".to_string(), // -1 = all lines
        format!("{}/{}", resource_type, resource_name),
        "--context".to_string(),
        context.to_string(),
        "--namespace".to_string(),
        namespace.to_string(),
    ];

    if timestamps {
        args.push("--timestamps".to_string());
    }
    if previous {
        args.push("--previous".to_string());
    }
    if let Some(container) = container_name {
        args.push("-c".to_string());
        args.push(container.clone());
    } else {
        // Show logs from all containers when viewing a pod or higher-level resource
        args.push("--all-containers".to_string());
        args.push("--prefix".to_string());
    }

    let result = kubectl::run(&args).await?;
    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl logs failed: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&result.output.stdout).to_string())
}

/// Fetch the full container log from the cluster and write it to the user's
/// Downloads directory. When `include_previous` is set, the previously
/// terminated container's log is prepended (when one exists). Returns the
/// absolute path of the written file.
#[tauri::command]
pub async fn download_pod_logs(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
    container_name: Option<String>,
    timestamps: bool,
    include_previous: bool,
    file_name: String,
) -> Result<String, String> {
    let current = fetch_full_logs(
        &resource_type,
        &resource_name,
        &context,
        &namespace,
        &container_name,
        timestamps,
        false,
    )
    .await?;

    let contents = if include_previous {
        // The previous container may not exist (never restarted); if the call
        // fails or returns nothing, fall back to the current log rather than
        // failing the whole download.
        match fetch_full_logs(
            &resource_type,
            &resource_name,
            &context,
            &namespace,
            &container_name,
            timestamps,
            true,
        )
        .await
        {
            Ok(previous) if !previous.trim().is_empty() => format!(
                "===== previous terminated container =====\n{}\n===== current container =====\n{}",
                previous.trim_end(),
                current
            ),
            _ => current,
        }
    } else {
        current
    };

    write_to_downloads(&file_name, &contents).await
}
