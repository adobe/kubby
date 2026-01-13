use std::env;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::types::KUBECTL_TIMEOUT_SECS;

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

/// Open a file in the default editor
#[tauri::command]
pub fn open_file_in_editor(path: String) -> Result<(), String> {
    let editor = get_editor();
    
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
    cmd.arg(&path);
    
    cmd.spawn()
        .map_err(|e| format!("Failed to open editor '{}': {}", editor, e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn edit_resource(
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
