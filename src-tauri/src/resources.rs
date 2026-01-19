use crate::kubectl;

#[tauri::command]
pub async fn get_resource_types(context: String) -> Result<Vec<String>, String> {
    let args = [
        "api-resources",
        "--context", &context,
        "-o", "name",
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    let args = [
        "get",
        &resource_type,
        &resource_name,
        "--context", &context,
        "-n", &namespace,
        "-o", "json",
    ];
    
    let output = kubectl::run(&args).await?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
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
    // Use --wait=false to return immediately after delete is initiated
    // (otherwise kubectl waits for finalizers which can take a long time)
    let args = [
        "delete",
        &resource_type,
        &resource_name,
        "--context", &context,
        "-n", &namespace,
        "--wait=false",
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    let args = [
        "rollout", "restart", "deployment",
        &deployment_name,
        "--context", &context,
        "-n", &namespace,
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    let args = [
        "get", "hpa",
        "--context", &context,
        "-n", &namespace,
        "-o", "json",
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    
    let args = [
        "get", "pdb",
        "--context", &context,
        "-n", &namespace,
        "-o", "json",
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    let replicas_arg = format!("--replicas={}", replicas);
    let args = [
        "scale", "deployment",
        &deployment_name,
        &replicas_arg,
        "--context", &context,
        "-n", &namespace,
    ];
    
    let output = kubectl::run(&args).await?;
    
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
    let patch = format!(
        r#"{{"spec":{{"minReplicas":{},"maxReplicas":{}}}}}"#,
        min_replicas, max_replicas
    );
    
    let args = [
        "patch", "hpa",
        &hpa_name,
        "-p", &patch,
        "--context", &context,
        "-n", &namespace,
    ];
    
    let output = kubectl::run(&args).await?;
    
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
            if let Ok(num) = min.parse::<u32>() {
                format!(r#"{{"spec":{{"minAvailable":{},"maxUnavailable":null}}}}"#, num)
            } else {
                format!(r#"{{"spec":{{"minAvailable":"{}","maxUnavailable":null}}}}"#, min)
            }
        }
        (None, Some(max)) => {
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
    
    let args = [
        "patch", "pdb",
        &pdb_name,
        "-p", &patch,
        "--context", &context,
        "-n", &namespace,
    ];
    
    let output = kubectl::run(&args).await?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to patch PDB: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().to_string())
}
