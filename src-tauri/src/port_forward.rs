use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use crate::types::KUBECTL_TIMEOUT_SECS;

/// Global state for tracking active port forwards
static PORT_FORWARDS: Mutex<Option<HashMap<String, PortForwardProcess>>> = Mutex::new(None);

/// Internal tracking of a port forward process
struct PortForwardProcess {
    child: Child,
    info: ActivePortForward,
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
    let args = vec![
        "get".to_string(),
        "service".to_string(),
        service_name.to_string(),
        "--context".to_string(),
        context.to_string(),
        "-n".to_string(),
        namespace.to_string(),
        "-o".to_string(),
        "json".to_string(),
    ];

    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl").args(&args).output(),
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
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
    let args = vec![
        "get".to_string(),
        "pod".to_string(),
        pod_name.to_string(),
        "--context".to_string(),
        context.to_string(),
        "-n".to_string(),
        namespace.to_string(),
        "-o".to_string(),
        "json".to_string(),
    ];

    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl").args(&args).output(),
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
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
    let args = vec![
        "get".to_string(),
        "pod".to_string(),
        pod_name.to_string(),
        "--context".to_string(),
        context.to_string(),
        "-n".to_string(),
        namespace.to_string(),
        "-o".to_string(),
        "json".to_string(),
    ];

    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl").args(&args).output(),
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
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
        "-n".to_string(),
        namespace.clone(),
    ];

    // Add address flag to listen on all interfaces
    args.push("--address".to_string());
    args.push("127.0.0.1".to_string());

    // Spawn the port-forward process
    let child = Command::new("kubectl")
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start port-forward: {}", e))?;

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

    // Store the process
    {
        let mut guard = PORT_FORWARDS.lock().unwrap();
        if let Some(ref mut map) = *guard {
            map.insert(id, PortForwardProcess { child, info: info.clone() });
        }
    }

    Ok(info)
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

/// Clean up any dead processes from the map
async fn cleanup_dead_processes() {
    let mut guard = PORT_FORWARDS.lock().unwrap();
    if let Some(ref mut map) = *guard {
        let mut dead_ids = Vec::new();

        for (id, process) in map.iter_mut() {
            // Try to check if process is still running
            match process.child.try_wait() {
                Ok(Some(_)) => {
                    // Process has exited
                    dead_ids.push(id.clone());
                }
                Ok(None) => {
                    // Process is still running
                }
                Err(_) => {
                    // Error checking, assume dead
                    dead_ids.push(id.clone());
                }
            }
        }

        for id in dead_ids {
            map.remove(&id);
        }
    }
}
