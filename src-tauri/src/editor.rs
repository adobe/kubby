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

use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::config;
use crate::kubectl;
use crate::shell_env;
use crate::terminal;

/// GUI editors that can be launched directly without a terminal.
const GUI_EDITORS: &[&str] = &[
    "code", "cursor", "subl", "sublime_text", "atom", "textmate", "mate",
    "gedit", "kate", "mousepad", "xed", "pluma", "notepad", "notepad++",
    "open",
];

/// Get the editor command to use for editing resources.
/// Priority: KUBE_EDITOR > EDITOR > vi
///
/// Note: Uses shell_env to read from user's login shell environment,
/// which properly sources .bashrc/.zshrc etc.
fn get_editor() -> String {
    if let Some(editor) = shell_env::get_env_var("KUBE_EDITOR") {
        return editor;
    }
    
    if let Some(editor) = shell_env::get_env_var("EDITOR") {
        return editor;
    }
    
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
    
    if cmd.starts_with('/') {
        return (cmd.to_string(), args);
    }
    
    if let Some(full_path) = shell_env::find_executable(cmd) {
        return (full_path, args);
    }
    
    (cmd.to_string(), args)
}

/// Check if the editor is a GUI application that doesn't need a terminal.
fn is_gui_editor(cmd: &str) -> bool {
    let basename = std::path::Path::new(cmd)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(cmd);
    GUI_EDITORS.iter().any(|&e| e == basename)
}

/// Shell-quote a string for safe embedding in a shell command.
fn shell_quote(s: &str) -> String {
    if s.chars().all(|c| c.is_alphanumeric() || c == '/' || c == '.' || c == '-' || c == '_') {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

/// Build a shell command string from the editor executable, its args, and the file path.
fn build_editor_shell_command(editor_cmd: &str, editor_args: &[String], file_path: &str) -> String {
    let mut parts = vec![shell_quote(editor_cmd)];
    for arg in editor_args {
        parts.push(shell_quote(arg));
    }
    parts.push(shell_quote(file_path));
    parts.join(" ")
}

/// Open a file in the default editor (fire-and-forget, does not wait for close).
#[tauri::command]
pub async fn open_file_in_editor(path: String) -> Result<(), String> {
    if let Some(override_cmd) = config::get_editor_override() {
        Command::new("sh")
            .args(["-c", override_cmd])
            .output()
            .await
            .map_err(|e| format!("Failed to run editor override: {}", e))?;
        return Ok(());
    }

    let editor = get_editor();
    let (editor_cmd, editor_args) = resolve_editor_path(&editor);
    
    if is_gui_editor(&editor_cmd) {
        let mut cmd = std::process::Command::new(&editor_cmd);
        for arg in &editor_args {
            cmd.arg(arg);
        }
        cmd.arg(&path);
        cmd.spawn()
            .map_err(|e| format!("Failed to open editor '{}': {}", editor, e))?;
    } else {
        let shell_cmd = build_editor_shell_command(&editor_cmd, &editor_args, &path);
        terminal::open_terminal_with_command(shell_cmd).await?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn edit_resource(
    resource_type: String,
    resource_name: String,
    context: String,
    namespace: String,
) -> Result<String, String> {
    if let Some(override_cmd) = config::get_editor_override() {
        Command::new("sh")
            .args(["-c", override_cmd])
            .output()
            .await
            .map_err(|e| format!("Failed to run editor override: {}", e))?;
        return Ok("Edit overridden for testing.".to_string());
    }

    // Step 1: Fetch the resource as YAML
    let get_result = kubectl::run([
        "get", &resource_type, &resource_name,
        "--context", &context,
        "--namespace", &namespace,
        "--output", "yaml",
    ]).await?;
    
    if !get_result.output.status.success() {
        let stderr = String::from_utf8_lossy(&get_result.output.stderr);
        return Err(format!("Failed to get resource: {}\nCommand: {}", stderr.trim(), get_result.command));
    }
    
    let yaml_content = String::from_utf8_lossy(&get_result.output.stdout);
    
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
    drop(temp_file);
    
    // Step 3: Open editor and wait for it to close
    let editor = get_editor();
    let (editor_cmd, editor_args) = resolve_editor_path(&editor);
    let temp_path_str = temp_file_path.to_string_lossy().to_string();
    
    if is_gui_editor(&editor_cmd) {
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
    } else {
        let shell_cmd = build_editor_shell_command(&editor_cmd, &editor_args, &temp_path_str);
        terminal::run_in_terminal_and_wait(shell_cmd).await?;
    }
    
    // Step 4: Read back the edited content and check for changes
    let edited_content = tokio::fs::read_to_string(&temp_file_path)
        .await
        .map_err(|e| format!("Failed to read edited file: {}", e))?;
    
    if edited_content.trim() == yaml_content.trim() {
        return Ok("Edit cancelled, no changes made.".to_string());
    }
    
    // Step 5: Replace the resource (same mechanism as kubectl edit)
    let replace_result = kubectl::run([
        "replace", "-f", &temp_path_str,
        "--context", &context,
        "--namespace", &namespace,
    ]).await?;
    
    if !replace_result.output.status.success() {
        let stderr = String::from_utf8_lossy(&replace_result.output.stderr);
        return Err(format!("Failed to replace resource: {}\nCommand: {}", stderr.trim(), replace_result.command));
    }
    
    let stdout = String::from_utf8_lossy(&replace_result.output.stdout);
    Ok(stdout.trim().to_string())
}
