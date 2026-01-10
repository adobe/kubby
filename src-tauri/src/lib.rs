mod dashboard;
mod resource_columns;
mod resource_list;

use tokio::process::Command;
use tokio::time::{timeout, Duration};

use serde::{Serialize, Deserialize};

const KUBECTL_TIMEOUT_SECS: u64 = 5;

// Kubectl types
#[derive(Serialize)]
struct KubectlOutput {
    stdout: String,
    stderr: String,
}

// Label selector for filtering resources
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelSelector {
    pub key: String,
    pub value: String,
}

// Frontend-facing column config
#[derive(Debug, Serialize)]
pub struct ColumnConfig {
    name: String,
    #[serde(rename = "jsonPath")]
    json_path: String,
}

#[derive(Debug, Serialize)]
pub struct ResourceColumnConfig {
    columns: Vec<ColumnConfig>,
}

// Response type for get_resources command
#[derive(Debug, Serialize)]
pub struct ResourceItem {
    name: String,
    #[serde(flatten)]
    columns: std::collections::HashMap<String, String>,
    labels: Vec<LabelSelector>,
}

#[derive(Debug, Serialize)]
pub struct ResourceListResponse {
    columns: Vec<ColumnConfig>,
    items: Vec<ResourceItem>,
}


#[tauri::command]
async fn kubectl(args: Vec<String>) -> Result<KubectlOutput, String> {
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your network connection then click refresh to retry", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(stderr);
    }

    Ok(KubectlOutput { stdout, stderr })
}


#[tauri::command]
fn get_resource_columns(
    resource_type: String,
    context: String,
    namespace: String,
) -> Result<ResourceColumnConfig, String> {
    resource_columns::get_resource_columns(resource_type, context, namespace)
}

#[tauri::command]
async fn get_resource_types(context: String) -> Result<Vec<String>, String> {
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
async fn get_resource_detail(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            kubectl,
            dashboard::get_dashboard_config,
            get_resource_columns,
            get_resource_types,
            get_resource_detail,
            resource_list::get_resources,
            resource_list::get_pod_containers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
