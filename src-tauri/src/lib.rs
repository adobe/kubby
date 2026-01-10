mod dashboard;
mod resource_columns;
mod resource_list;

use tokio::process::Command;
use tokio::time::{timeout, Duration};
use tokio::io::AsyncWriteExt;
use std::env;

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

/// Get the editor command to use for editing resources.
/// Priority: KUBE_EDITOR > EDITOR > platform default (vi on Unix, notepad on Windows)
fn get_editor() -> String {
    if let Ok(editor) = env::var("KUBE_EDITOR") {
        if !editor.is_empty() {
            return editor;
        }
    }
    if let Ok(editor) = env::var("EDITOR") {
        if !editor.is_empty() {
            return editor;
        }
    }
    // Platform default
    #[cfg(target_os = "windows")]
    {
        "notepad".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        "vi".to_string()
    }
}

#[tauri::command]
async fn edit_resource(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
) -> Result<String, String> {
    // Step 1: Fetch the resource as YAML
    let get_args = vec![
        "get".to_string(),
        resource_type.clone(),
        resource_name.clone(),
        "--context".to_string(),
        context.clone(),
        "-n".to_string(),
        namespace.clone(),
        "-o".to_string(),
        "yaml".to_string(),
    ];
    
    let get_output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&get_args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl get timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl get: {}", e))?;
    
    if !get_output.status.success() {
        let stderr = String::from_utf8_lossy(&get_output.stderr);
        return Err(format!("Failed to get resource: {}", stderr));
    }
    
    let yaml_content = String::from_utf8_lossy(&get_output.stdout);
    
    // Step 2: Write to a temporary file with .yaml extension
    let temp_dir = tempfile::tempdir()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_file_path = temp_dir.path().join(format!("{}-{}.yaml", resource_type, resource_name));
    
    let mut temp_file = tokio::fs::File::create(&temp_file_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    temp_file.write_all(yaml_content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to temp file: {}", e))?;
    temp_file.flush()
        .await
        .map_err(|e| format!("Failed to flush temp file: {}", e))?;
    drop(temp_file); // Close the file handle before opening in editor
    
    // Step 3: Open editor and wait for it to close
    let editor = get_editor();
    let temp_path_str = temp_file_path.to_string_lossy().to_string();
    
    // Parse editor command - it might contain arguments (e.g., "code --wait")
    let editor_parts: Vec<&str> = editor.split_whitespace().collect();
    let (editor_cmd, editor_args) = if editor_parts.is_empty() {
        ("vi", Vec::new())
    } else {
        (editor_parts[0], editor_parts[1..].to_vec())
    };
    
    let mut cmd = std::process::Command::new(editor_cmd);
    for arg in editor_args {
        cmd.arg(arg);
    }
    cmd.arg(&temp_path_str);
    
    let editor_status = cmd
        .status()
        .map_err(|e| format!("Failed to open editor '{}': {}", editor, e))?;
    
    if !editor_status.success() {
        return Err(format!("Editor exited with non-zero status"));
    }
    
    // Step 4: Apply the edited resource
    let apply_args = vec![
        "apply".to_string(),
        "-f".to_string(),
        temp_path_str,
        "--context".to_string(),
        context,
    ];
    
    let apply_output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&apply_args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl apply timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl apply: {}", e))?;
    
    // temp_dir will be cleaned up automatically when dropped
    
    if !apply_output.status.success() {
        let stderr = String::from_utf8_lossy(&apply_output.stderr);
        return Err(format!("Failed to apply changes: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&apply_output.stdout);
    Ok(stdout.trim().to_string())
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
            edit_resource,
            resource_list::get_resources,
            resource_list::get_pod_containers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
