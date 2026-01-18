use tokio::io::AsyncWriteExt;
use tokio::time::{timeout, Duration};

use crate::kubectl;
use crate::shell_env;
use crate::types::KUBECTL_TIMEOUT_SECS;

/// Get the editor command to use for editing resources.
/// Priority: KUBE_EDITOR > EDITOR > platform default (vi on Unix, notepad on Windows)
/// 
/// Note: Uses shell_env to read from user's login shell environment,
/// which properly sources .bashrc/.zshrc etc.
fn get_editor() -> String {
    // Try KUBE_EDITOR first (from user's shell environment)
    if let Some(editor) = shell_env::get_env_var("KUBE_EDITOR") {
        return editor;
    }
    
    // Then try EDITOR
    if let Some(editor) = shell_env::get_env_var("EDITOR") {
        return editor;
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

/// Resolve an editor command to a full path if needed.
/// Handles commands like "code --wait" by resolving just the executable part.
fn resolve_editor_path(editor: &str) -> (String, Vec<String>) {
    let parts: Vec<&str> = editor.split_whitespace().collect();
    if parts.is_empty() {
        return ("vi".to_string(), vec![]);
    }
    
    let cmd = parts[0];
    let args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
    
    // If it's already an absolute path, use it directly
    if cmd.starts_with('/') {
        return (cmd.to_string(), args);
    }
    
    // Try to find the executable in the shell's PATH
    if let Some(full_path) = shell_env::find_executable(cmd) {
        return (full_path, args);
    }
    
    // Fall back to the original command (let the OS try to find it)
    (cmd.to_string(), args)
}

/// Open a file in the default editor
#[tauri::command]
pub fn open_file_in_editor(path: String) -> Result<(), String> {
    let editor = get_editor();
    let (editor_cmd, editor_args) = resolve_editor_path(&editor);
    
    let mut cmd = std::process::Command::new(&editor_cmd);
    for arg in &editor_args {
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
        kubectl::async_command()
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
    let (editor_cmd, editor_args) = resolve_editor_path(&editor);
    let temp_path_str = temp_file_path.to_string_lossy().to_string();
    
    let mut cmd = std::process::Command::new(&editor_cmd);
    for arg in &editor_args {
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
        kubectl::async_command()
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
