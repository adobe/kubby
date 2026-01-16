use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::types::{KUBECTL_TIMEOUT_SECS, KUBECTL_DELETE_TIMEOUT_SECS};

#[tauri::command]
pub async fn get_resource_types(context: String) -> Result<Vec<String>, String> {
    // Execute kubectl api-resources to get all resource types (async/non-blocking)
    let args = vec![
        "api-resources".to_string(),
        "--context".to_string(),
        context,
        "-o".to_string(),
        "name".to_string(),
    ];
    
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your network connection then click refresh to retry", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse output: kubectl api-resources -o name returns one resource type per line
    // Format is like: deployments.v1.apps, pods.v1.core, etc.
    // We want to extract just the resource name (first part before the dot)
    let mut resource_types: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            // Extract resource name (part before first dot, or the whole thing if no dot)
            let resource_name = if let Some(dot_pos) = trimmed.find('.') {
                &trimmed[..dot_pos]
            } else {
                trimmed
            };
            Some(resource_name.to_string())
        })
        .collect();
    
    // Remove duplicates and sort
    resource_types.sort();
    resource_types.dedup();
    
    Ok(resource_types)
}

#[tauri::command]
pub async fn get_resource_detail(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
) -> Result<serde_json::Value, String> {
    // Build kubectl command to get a single resource as JSON
    let args = vec![
        "get".to_string(),
        resource_type,
        resource_name,
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "-o".to_string(),
        "json".to_string(),
    ];
    
    // Execute kubectl command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your network connection then click refresh to retry", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse and return the raw JSON
    let detail: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse kubectl JSON output: {}", e))?;
    
    Ok(detail)
}

#[tauri::command]
pub async fn delete_resource(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Build kubectl delete command
    // Use --wait=false to return immediately after delete is initiated
    // (otherwise kubectl waits for finalizers which can take a long time)
    let args = vec![
        "delete".to_string(),
        resource_type.clone(),
        resource_name.clone(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "--wait=false".to_string(),
    ];
    
    // Execute kubectl delete command asynchronously with timeout
    // Delete operations can take longer, so we use a longer timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_DELETE_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl delete timed out after {}s", KUBECTL_DELETE_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl delete: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete resource: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn rolling_restart_deployment(
    deployment_name: String,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Build kubectl rollout restart command
    let args = vec![
        "rollout".to_string(),
        "restart".to_string(),
        "deployment".to_string(),
        deployment_name.clone(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // Execute kubectl rollout restart command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl rollout restart timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl rollout restart: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to restart deployment: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn get_hpa_for_target(
    target_kind: String,
    target_name: String,
    context: String,
    namespace: String,
) -> Result<Option<serde_json::Value>, String> {
    // Get all HPAs in the namespace as JSON
    let args = vec![
        "get".to_string(),
        "hpa".to_string(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "-o".to_string(),
        "json".to_string(),
    ];
    
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl get hpa timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl get hpa: {}", e))?;
    
    // If no HPAs exist, kubectl returns an error - treat as empty
    if !output.status.success() {
        return Ok(None);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let hpa_list: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse HPA JSON: {}", e))?;
    
    // Find HPA that targets the specified resource
    let target_kind_lower = target_kind.to_lowercase();
    if let Some(items) = hpa_list.get("items").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(spec) = item.get("spec") {
                if let Some(scale_target_ref) = spec.get("scaleTargetRef") {
                    let kind = scale_target_ref.get("kind")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let name = scale_target_ref.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    
                    if kind == target_kind_lower && name == target_name {
                        return Ok(Some(item.clone()));
                    }
                }
            }
        }
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn get_pdb_for_deployment(
    deployment_name: String,
    context: String,
    namespace: String,
) -> Result<Option<serde_json::Value>, String> {
    // First, get the deployment to find its selector labels
    let deployment = get_resource_detail(
        "deployment".to_string(),
        deployment_name,
        context.clone(),
        namespace.clone(),
    ).await?;
    
    // Extract the deployment's matchLabels from spec.selector.matchLabels
    let deployment_labels = deployment
        .get("spec")
        .and_then(|s| s.get("selector"))
        .and_then(|s| s.get("matchLabels"))
        .and_then(|v| v.as_object());
    
    let deployment_labels = match deployment_labels {
        Some(labels) => labels,
        None => return Ok(None), // No selector labels found
    };
    
    // Get all PDBs in the namespace as JSON
    let args = vec![
        "get".to_string(),
        "pdb".to_string(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "-o".to_string(),
        "json".to_string(),
    ];
    
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl get pdb timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl get pdb: {}", e))?;
    
    // If no PDBs exist, kubectl returns an error - treat as empty
    if !output.status.success() {
        return Ok(None);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let pdb_list: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse PDB JSON: {}", e))?;
    
    // Find PDB whose selector matches the deployment's labels
    if let Some(items) = pdb_list.get("items").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(pdb_selector) = item
                .get("spec")
                .and_then(|s| s.get("selector"))
                .and_then(|s| s.get("matchLabels"))
                .and_then(|v| v.as_object())
            {
                // Check if all PDB selector labels match the deployment's labels
                let matches = pdb_selector.iter().all(|(key, value)| {
                    deployment_labels.get(key) == Some(value)
                });
                
                if matches && !pdb_selector.is_empty() {
                    return Ok(Some(item.clone()));
                }
            }
        }
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn scale_deployment(
    deployment_name: String,
    replicas: u32,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Build kubectl scale command
    let args = vec![
        "scale".to_string(),
        "deployment".to_string(),
        deployment_name.clone(),
        format!("--replicas={}", replicas),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // Execute kubectl scale command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl scale timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl scale: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to scale deployment: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn patch_hpa(
    hpa_name: String,
    min_replicas: u32,
    max_replicas: u32,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Build patch JSON
    let patch = format!(
        r#"{{"spec":{{"minReplicas":{},"maxReplicas":{}}}}}"#,
        min_replicas, max_replicas
    );
    
    // Build kubectl patch command
    let args = vec![
        "patch".to_string(),
        "hpa".to_string(),
        hpa_name.clone(),
        "-p".to_string(),
        patch,
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // Execute kubectl patch command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl patch hpa timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl patch hpa: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to patch HPA: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}

#[tauri::command]
pub async fn patch_pdb(
    pdb_name: String,
    min_available: Option<String>,
    max_unavailable: Option<String>,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Build patch JSON based on which field is provided
    // PDB only allows one of minAvailable or maxUnavailable
    let patch = match (min_available, max_unavailable) {
        (Some(min), None) => {
            // Parse to check if it's a number or string (percentage)
            if let Ok(num) = min.parse::<u32>() {
                format!(r#"{{"spec":{{"minAvailable":{},"maxUnavailable":null}}}}"#, num)
            } else {
                format!(r#"{{"spec":{{"minAvailable":"{}","maxUnavailable":null}}}}"#, min)
            }
        }
        (None, Some(max)) => {
            // Parse to check if it's a number or string (percentage)
            if let Ok(num) = max.parse::<u32>() {
                format!(r#"{{"spec":{{"minAvailable":null,"maxUnavailable":{}}}}}"#, num)
            } else {
                format!(r#"{{"spec":{{"minAvailable":null,"maxUnavailable":"{}"}}}}"#, max)
            }
        }
        (Some(min), Some(_)) => {
            // If both provided, use minAvailable (PDB only allows one)
            if let Ok(num) = min.parse::<u32>() {
                format!(r#"{{"spec":{{"minAvailable":{},"maxUnavailable":null}}}}"#, num)
            } else {
                format!(r#"{{"spec":{{"minAvailable":"{}","maxUnavailable":null}}}}"#, min)
            }
        }
        (None, None) => {
            return Err("Either minAvailable or maxUnavailable must be provided".to_string());
        }
    };
    
    // Build kubectl patch command
    let args = vec![
        "patch".to_string(),
        "pdb".to_string(),
        pdb_name.clone(),
        "-p".to_string(),
        patch,
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // Execute kubectl patch command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl patch pdb timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl patch pdb: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to patch PDB: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}
