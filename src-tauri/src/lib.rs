mod dashboard;
mod resource_columns;
mod resource_list;

use std::process::Command;

use serde::Serialize;

// Kubectl types
#[derive(Serialize)]
struct KubectlOutput {
    stdout: String,
    stderr: String,
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
}

#[derive(Debug, Serialize)]
pub struct ResourceListResponse {
    columns: Vec<ColumnConfig>,
    items: Vec<ResourceItem>,
}


#[tauri::command]
fn kubectl(args: Vec<String>) -> Result<KubectlOutput, String> {
    let output = Command::new("kubectl")
        .args(&args)
        .output()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            kubectl,
            dashboard::get_dashboard_config,
            get_resource_columns,
            resource_list::get_resources
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
