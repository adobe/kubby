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

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use crate::kubectl;

/// Timeout in seconds for waiting for port-forward confirmation
const PORT_FORWARD_CONFIRM_TIMEOUT_SECS: u64 = 10;

/// How long to keep dead port forward info before expiring (in seconds)
const DEAD_FORWARD_EXPIRY_SECS: u64 = 60;

/// Global state for tracking active port forwards
static PORT_FORWARDS: Mutex<Option<HashMap<String, PortForwardProcess>>> = Mutex::new(None);

/// Maximum stderr lines to retain per port-forward process
const MAX_STDERR_LINES: usize = 50;

/// Information about a port forward that died unexpectedly
#[derive(Debug, Serialize, Clone)]
pub struct DeadPortForward {
    pub info: ActivePortForward,
    /// Exit code if available
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    /// Detailed error message from kubectl stderr, if available
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
}

/// Dead port forward with timestamp for expiry
struct DeadPortForwardWithTimestamp {
    dead_forward: DeadPortForward,
    timestamp: u64,
}

/// Global state for tracking port forwards that died unexpectedly
/// These are stored temporarily so the frontend can retrieve them
static DEAD_PORT_FORWARDS: Mutex<Vec<DeadPortForwardWithTimestamp>> = Mutex::new(Vec::new());

/// Internal tracking of a port forward process
struct PortForwardProcess {
    child: Child,
    info: ActivePortForward,
    stderr_buffer: Arc<Mutex<Vec<String>>>,
}

/// Container port information
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContainerPort {
    pub port: u16,
    pub protocol: String,
    pub name: Option<String>,
}

/// Port forward target (container with its ports)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortForwardTarget {
    #[serde(rename = "containerName")]
    pub container_name: String,
    pub ports: Vec<ContainerPort>,
}

/// Response for get_port_forward_targets
#[derive(Debug, Serialize)]
pub struct PortForwardTargetsResponse {
    pub targets: Vec<PortForwardTarget>,
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    #[serde(rename = "resourceName")]
    pub resource_name: String,
}

/// Active port forward information
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivePortForward {
    pub id: String,
    pub context: String,
    pub namespace: String,
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    #[serde(rename = "resourceName")]
    pub resource_name: String,
    #[serde(rename = "containerName")]
    pub container_name: Option<String>,
    #[serde(rename = "localPort")]
    pub local_port: u16,
    #[serde(rename = "targetPort")]
    pub target_port: u16,
}

/// Initialize the port forwards map if not already initialized
fn ensure_initialized() {
    let mut guard = PORT_FORWARDS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

/// Get port forward targets for a resource (service, pod, or container)
#[tauri::command]
pub async fn get_port_forward_targets(
    context: String,
    namespace: String,
    resource_type: String,
    resource_name: String,
    parent_resource_name: Option<String>,
) -> Result<PortForwardTargetsResponse, String> {
    let normalized_type = resource_type.to_lowercase();

    match normalized_type.as_str() {
        "service" | "services" | "svc" => {
            get_service_targets(&context, &namespace, &resource_name).await
        }
        "pod" | "pods" => get_pod_targets(&context, &namespace, &resource_name).await,
        "container" | "containers" => {
            // For containers, we need the parent pod name
            let pod_name = parent_resource_name
                .ok_or_else(|| "Parent pod name required for container".to_string())?;
            get_container_targets(&context, &namespace, &pod_name, &resource_name).await
        }
        _ => Err(format!(
            "Port forwarding not supported for resource type: {}",
            resource_type
        )),
    }
}

/// Get targets for a service (ports defined in the service spec)
async fn get_service_targets(
    context: &str,
    namespace: &str,
    service_name: &str,
) -> Result<PortForwardTargetsResponse, String> {
    let result = kubectl::run([
        "get", "service", service_name,
        "--context", context,
        "--namespace", namespace,
        "--output", "json",
    ]).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
    let service: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse service JSON: {}", e))?;

    // Extract ports from service spec
    let ports: Vec<ContainerPort> = service
        .pointer("/spec/ports")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|port| {
                    let port_num = port
                        .get("port")
                        .or_else(|| port.get("targetPort"))
                        .and_then(|p| p.as_u64())
                        .map(|p| p as u16)?;

                    let protocol = port
                        .get("protocol")
                        .and_then(|p| p.as_str())
                        .unwrap_or("TCP")
                        .to_string();

                    let name = port.get("name").and_then(|n| n.as_str()).map(String::from);

                    Some(ContainerPort {
                        port: port_num,
                        protocol,
                        name,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(PortForwardTargetsResponse {
        targets: vec![PortForwardTarget {
            container_name: service_name.to_string(),
            ports,
        }],
        resource_type: "service".to_string(),
        resource_name: service_name.to_string(),
    })
}

/// Get targets for a pod (all containers with their ports)
async fn get_pod_targets(
    context: &str,
    namespace: &str,
    pod_name: &str,
) -> Result<PortForwardTargetsResponse, String> {
    let result = kubectl::run([
        "get", "pod", pod_name,
        "--context", context,
        "--namespace", namespace,
        "--output", "json",
    ]).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
    let pod: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse pod JSON: {}", e))?;

    // Extract containers and their ports from pod spec
    let targets = extract_container_ports(&pod);

    Ok(PortForwardTargetsResponse {
        targets,
        resource_type: "pod".to_string(),
        resource_name: pod_name.to_string(),
    })
}

/// Get targets for a specific container
async fn get_container_targets(
    context: &str,
    namespace: &str,
    pod_name: &str,
    container_name: &str,
) -> Result<PortForwardTargetsResponse, String> {
    let result = kubectl::run([
        "get", "pod", pod_name,
        "--context", context,
        "--namespace", namespace,
        "--output", "json",
    ]).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
    let pod: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse pod JSON: {}", e))?;

    // Extract all containers and filter to just the one we want
    let all_targets = extract_container_ports(&pod);
    let targets: Vec<PortForwardTarget> = all_targets
        .into_iter()
        .filter(|t| t.container_name == container_name)
        .collect();

    if targets.is_empty() {
        return Err(format!(
            "Container '{}' not found in pod '{}'",
            container_name, pod_name
        ));
    }

    Ok(PortForwardTargetsResponse {
        targets,
        resource_type: "container".to_string(),
        resource_name: container_name.to_string(),
    })
}

/// Extract container ports from a pod spec
fn extract_container_ports(pod: &serde_json::Value) -> Vec<PortForwardTarget> {
    let containers = pod
        .pointer("/spec/containers")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    containers
        .iter()
        .map(|container| {
            let container_name = container
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("<unknown>")
                .to_string();

            let ports: Vec<ContainerPort> = container
                .get("ports")
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|port| {
                            let port_num =
                                port.get("containerPort").and_then(|p| p.as_u64())? as u16;

                            let protocol = port
                                .get("protocol")
                                .and_then(|p| p.as_str())
                                .unwrap_or("TCP")
                                .to_string();

                            let name =
                                port.get("name").and_then(|n| n.as_str()).map(String::from);

                            Some(ContainerPort {
                                port: port_num,
                                protocol,
                                name,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            PortForwardTarget {
                container_name,
                ports,
            }
        })
        .collect()
}

/// Start a port forward
#[tauri::command]
pub async fn start_port_forward(
    context: String,
    namespace: String,
    resource_type: String,
    resource_name: String,
    container_port: u16,
    local_port: u16,
    container_name: Option<String>,
    parent_resource_name: Option<String>,
) -> Result<ActivePortForward, String> {
    ensure_initialized();

    let normalized_type = resource_type.to_lowercase();

    // Build the kubectl port-forward command
    let resource_ref = match normalized_type.as_str() {
        "service" | "services" | "svc" => format!("svc/{}", resource_name),
        "pod" | "pods" => format!("pod/{}", resource_name),
        "container" | "containers" => {
            // For containers, port-forward to the parent pod
            let pod_name = parent_resource_name
                .clone()
                .ok_or_else(|| "Parent pod name required for container".to_string())?;
            format!("pod/{}", pod_name)
        }
        _ => {
            return Err(format!(
                "Port forwarding not supported for resource type: {}",
                resource_type
            ))
        }
    };

    let port_mapping = format!("{}:{}", local_port, container_port);

    let mut args = vec![
        "port-forward".to_string(),
        resource_ref,
        port_mapping,
        "--context".to_string(),
        context.clone(),
        "--namespace".to_string(),
        namespace.clone(),
    ];

    // Add address flag to listen on all interfaces
    args.push("--address".to_string());
    args.push("127.0.0.1".to_string());

    // Spawn the port-forward process with stdout/stderr captured
    let mut child = kubectl::async_command()
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start port-forward: {}", e))?;

    // Take ownership of stdout and stderr for reading
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Wait for confirmation or error from kubectl
    // kubectl outputs "Forwarding from 127.0.0.1:PORT -> PORT" on stdout when successful
    // or an error message on stderr when it fails
    let confirmation_result = timeout(
        Duration::from_secs(PORT_FORWARD_CONFIRM_TIMEOUT_SECS),
        async {
            loop {
                tokio::select! {
                    // Check stdout for success message
                    stdout_line = stdout_reader.next_line() => {
                        match stdout_line {
                            Ok(Some(line)) => {
                                if line.starts_with("Forwarding from") {
                                    return Ok(());
                                }
                            }
                            Ok(None) => {
                                // stdout closed, process may have exited
                                return Err("Port forward process exited unexpectedly".to_string());
                            }
                            Err(e) => {
                                return Err(format!("Error reading stdout: {}", e));
                            }
                        }
                    }
                    // Check stderr for error messages
                    stderr_line = stderr_reader.next_line() => {
                        match stderr_line {
                            Ok(Some(line)) => {
                                // Common error patterns
                                if line.contains("address already in use") || 
                                   line.contains("bind: address already in use") ||
                                   line.contains("unable to listen") {
                                    return Err(format!("Port {} is already in use", local_port));
                                }
                                if line.contains("error") || line.contains("Error") || line.contains("unable to") {
                                    return Err(line);
                                }
                            }
                            Ok(None) => {
                                // stderr closed but no error found yet, continue checking stdout
                            }
                            Err(e) => {
                                return Err(format!("Error reading stderr: {}", e));
                            }
                        }
                    }
                    // Also check if the process has exited
                    exit_status = child.wait() => {
                        match exit_status {
                            Ok(status) => {
                                if !status.success() {
                                    return Err(format!("Port forward failed with exit code: {}", status));
                                }
                                return Err("Port forward process exited unexpectedly".to_string());
                            }
                            Err(e) => {
                                return Err(format!("Error waiting for process: {}", e));
                            }
                        }
                    }
                }
            }
        },
    )
    .await;

    // Handle timeout or result
    match confirmation_result {
        Ok(Ok(())) => {
            // Success! Port forward is confirmed
            let stderr_buffer: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
            let stderr_buffer_clone = stderr_buffer.clone();

            // Drain stdout so the pipe stays open and kubectl doesn't get SIGPIPE
            tokio::spawn(async move {
                while let Ok(Some(_)) = stdout_reader.next_line().await {}
            });
            // Capture stderr lines into the shared buffer so we can report them if the process dies
            tokio::spawn(async move {
                while let Ok(Some(line)) = stderr_reader.next_line().await {
                    let mut buf = stderr_buffer_clone.lock().unwrap();
                    if buf.len() >= MAX_STDERR_LINES {
                        buf.remove(0);
                    }
                    buf.push(line);
                }
            });

            let id = Uuid::new_v4().to_string();

            let info = ActivePortForward {
                id: id.clone(),
                context,
                namespace,
                resource_type: normalized_type,
                resource_name,
                container_name,
                local_port,
                target_port: container_port,
            };

            // Store the process with its stderr buffer
            {
                let mut guard = PORT_FORWARDS.lock().unwrap();
                if let Some(ref mut map) = *guard {
                    map.insert(id, PortForwardProcess {
                        child,
                        info: info.clone(),
                        stderr_buffer,
                    });
                }
            }

            return Ok(info);
        }
        Ok(Err(e)) => {
            // kubectl reported an error - kill and wait to clean up resources
            let _ = child.kill().await;
            let _ = child.wait().await;
            // Drain any remaining stderr lines for a more complete error
            let mut extra_lines = Vec::new();
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                if !line.trim().is_empty() {
                    extra_lines.push(line);
                }
            }
            return if extra_lines.is_empty() {
                Err(e)
            } else {
                Err(format!("{}\n{}", e, extra_lines.join("\n")))
            };
        }
        Err(_) => {
            // Timeout waiting for confirmation - kill and wait to clean up resources
            let _ = child.kill().await;
            let _ = child.wait().await;
            // Drain any stderr lines to include in the timeout error
            let mut extra_lines = Vec::new();
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                if !line.trim().is_empty() {
                    extra_lines.push(line);
                }
            }
            let base = format!(
                "Timeout waiting for port forward to start ({}s)",
                PORT_FORWARD_CONFIRM_TIMEOUT_SECS
            );
            return if extra_lines.is_empty() {
                Err(base)
            } else {
                Err(format!("{}\n{}", base, extra_lines.join("\n")))
            };
        }
    }
}

/// Stop a port forward
#[tauri::command]
pub async fn stop_port_forward(id: String) -> Result<(), String> {
    ensure_initialized();

    // Extract the process from the map (releasing the lock)
    let process = {
        let mut guard = PORT_FORWARDS.lock().unwrap();
        if let Some(ref mut map) = *guard {
            map.remove(&id)
        } else {
            return Err("Port forwards not initialized".to_string());
        }
    };

    // Now kill the process outside the lock
    if let Some(mut process) = process {
        let _ = process.child.kill().await;
        // Wait for the process to be reaped to avoid zombie processes
        // and ensure all file descriptors are properly closed
        let _ = process.child.wait().await;
        Ok(())
    } else {
        Err(format!("Port forward not found: {}", id))
    }
}

/// List active port forwards, optionally filtered by context and namespace
#[tauri::command]
pub async fn list_active_port_forwards(
    context: Option<String>,
    namespace: Option<String>,
    resource_type: Option<String>,
    resource_name: Option<String>,
) -> Result<Vec<ActivePortForward>, String> {
    ensure_initialized();

    // Clean up dead processes first
    cleanup_dead_processes().await;

    let guard = PORT_FORWARDS.lock().unwrap();
    if let Some(ref map) = *guard {
        let forwards: Vec<ActivePortForward> = map
            .values()
            .filter(|pf| {
                let matches_context = context
                    .as_ref()
                    .map(|c| c == &pf.info.context)
                    .unwrap_or(true);
                let matches_namespace = namespace
                    .as_ref()
                    .map(|n| n == &pf.info.namespace)
                    .unwrap_or(true);
                let matches_type = resource_type
                    .as_ref()
                    .map(|t| t.to_lowercase() == pf.info.resource_type)
                    .unwrap_or(true);
                let matches_name = resource_name
                    .as_ref()
                    .map(|n| n == &pf.info.resource_name)
                    .unwrap_or(true);
                matches_context && matches_namespace && matches_type && matches_name
            })
            .map(|pf| pf.info.clone())
            .collect();

        Ok(forwards)
    } else {
        Ok(vec![])
    }
}

/// Get current timestamp in seconds since UNIX epoch
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Strip the kubectl log prefix (e.g. "E0403 10:26:45.474731  94024 portforward.go:424] ")
/// so we can deduplicate lines that differ only by timestamp/pid.
fn strip_klog_prefix(line: &str) -> &str {
    if let Some(pos) = line.find("] ") {
        let prefix = &line[..pos];
        // Verify it looks like a klog prefix: starts with a letter + digits
        if prefix.len() > 1 && prefix.as_bytes()[0].is_ascii_alphabetic()
            && prefix.as_bytes()[1].is_ascii_digit()
        {
            return &line[pos + 2..];
        }
    }
    line
}

/// Extract error-relevant lines from a stderr buffer, filtering out noise like
/// "Handling connection for ..." and "Forwarding from ..." lines, and deduplicating
/// lines that only differ by their klog timestamp/pid prefix.
fn extract_error_message(stderr_buffer: &Arc<Mutex<Vec<String>>>) -> Option<String> {
    let lines = stderr_buffer.lock().unwrap();
    let mut seen = std::collections::HashSet::new();
    let error_lines: Vec<&str> = lines
        .iter()
        .map(|l| l.as_str())
        .filter(|l| {
            !l.starts_with("Handling connection for")
                && !l.starts_with("Forwarding from")
                && !l.trim().is_empty()
        })
        .filter(|l| seen.insert(strip_klog_prefix(l).to_string()))
        .collect();
    if error_lines.is_empty() {
        None
    } else {
        Some(error_lines.join("\n"))
    }
}

/// Clean up any dead processes from the map and store them in the dead list
fn cleanup_dead_processes_and_store() {
    let mut guard = PORT_FORWARDS.lock().unwrap();
    let now = current_timestamp();
    
    if let Some(ref mut map) = *guard {
        let mut dead_ids = Vec::new();
        let mut new_dead_forwards = Vec::new();

        for (id, process) in map.iter_mut() {
            // Try to check if process is still running
            match process.child.try_wait() {
                Ok(Some(status)) => {
                    let error_message = extract_error_message(&process.stderr_buffer);
                    eprintln!(
                        "[PortForward] Process died: {} -> {} (exit code: {:?}, stderr: {:?})",
                        process.info.resource_name,
                        process.info.target_port,
                        status.code(),
                        error_message,
                    );
                    dead_ids.push(id.clone());
                    new_dead_forwards.push(DeadPortForwardWithTimestamp {
                        dead_forward: DeadPortForward {
                            info: process.info.clone(),
                            exit_code: status.code(),
                            error_message,
                        },
                        timestamp: now,
                    });
                }
                Ok(None) => {
                    // Process is still running
                }
                Err(e) => {
                    // Error checking, assume dead
                    eprintln!(
                        "[PortForward] Error checking process for {}: {}",
                        process.info.resource_name, e
                    );
                    let error_message = extract_error_message(&process.stderr_buffer);
                    dead_ids.push(id.clone());
                    new_dead_forwards.push(DeadPortForwardWithTimestamp {
                        dead_forward: DeadPortForward {
                            info: process.info.clone(),
                            exit_code: None,
                            error_message,
                        },
                        timestamp: now,
                    });
                }
            }
        }

        for id in dead_ids {
            map.remove(&id);
        }
        
        // Store the newly dead forwards in the global list
        if !new_dead_forwards.is_empty() {
            eprintln!("[PortForward] Stored {} dead forwards", new_dead_forwards.len());
            let mut dead_guard = DEAD_PORT_FORWARDS.lock().unwrap();
            dead_guard.extend(new_dead_forwards);
        }
    }
}

/// Clean up any dead processes from the map (called by list_active_port_forwards)
async fn cleanup_dead_processes() {
    cleanup_dead_processes_and_store();
}

/// Check for port forwards that have died and return their info
/// This retrieves and clears the stored dead forwards, also removing expired entries
#[tauri::command]
pub async fn check_dead_port_forwards() -> Result<Vec<DeadPortForward>, String> {
    ensure_initialized();
    
    // First, do a cleanup to detect any newly dead processes
    cleanup_dead_processes_and_store();
    
    // Then retrieve and clear the stored dead forwards
    let now = current_timestamp();
    let mut guard = DEAD_PORT_FORWARDS.lock().unwrap();
    
    // Filter out expired entries and collect the rest
    let (valid, expired): (Vec<_>, Vec<_>) = guard
        .drain(..)
        .partition(|entry| now - entry.timestamp < DEAD_FORWARD_EXPIRY_SECS);
    
    if !valid.is_empty() || !expired.is_empty() {
        eprintln!(
            "[PortForward] check_dead_port_forwards: returning {} valid, {} expired",
            valid.len(),
            expired.len()
        );
    }
    
    // Return the dead forwards (the list is now empty)
    let result: Vec<DeadPortForward> = valid.into_iter().map(|entry| entry.dead_forward).collect();
    Ok(result)
}
