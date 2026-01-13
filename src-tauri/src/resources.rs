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
