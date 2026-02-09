use tokio::process::Command;

use crate::shell_env;

/// Detect which terminal to use on macOS.
/// Priority: TERMINAL env var > iTerm (if installed) > Terminal.app
#[cfg(target_os = "macos")]
fn get_macos_terminal() -> String {
    // Check TERMINAL env var from user's shell
    if let Some(terminal) = shell_env::get_env_var("TERMINAL") {
        // Normalize common names
        let terminal_lower = terminal.to_lowercase();
        if terminal_lower.contains("iterm") {
            return "iTerm".to_string();
        }
        return terminal;
    }
    
    // Check if iTerm is installed
    if std::path::Path::new("/Applications/iTerm.app").exists() {
        return "iTerm".to_string();
    }
    
    // Fall back to Terminal.app
    "Terminal".to_string()
}

/// Build a command string with environment variable exports prepended.
/// This ensures the external terminal inherits key env vars like KUBECONFIG
/// that may have been set when launching the app.
fn build_command_with_env(command: &str) -> String {
    let mut exports = Vec::new();

    if let Some(kubeconfig) = shell_env::get_env_var("KUBECONFIG") {
        exports.push(format!("export KUBECONFIG=\"{}\"", kubeconfig));
    }

    if exports.is_empty() {
        command.to_string()
    } else {
        exports.push(command.to_string());
        exports.join("; ")
    }
}

/// Open a new terminal window with the specified command
#[tauri::command]
pub async fn open_terminal_with_command(command: String) -> Result<(), String> {
    // Prepend env exports so the external terminal uses the same config as the app
    let command = build_command_with_env(&command);

    #[cfg(target_os = "macos")]
    {
        let terminal = get_macos_terminal();
        
        // Escape double quotes and backslashes in the command for AppleScript
        let escaped_command = command
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        
        let script = if terminal == "iTerm" {
            // iTerm2 AppleScript
            format!(
                r#"tell application "iTerm"
                    activate
                    set newWindow to (create window with default profile)
                    tell current session of newWindow
                        write text "{}"
                    end tell
                end tell"#,
                escaped_command
            )
        } else {
            // Terminal.app AppleScript
            format!(
                r#"tell application "{}"
                    activate
                    do script "{}"
                end tell"#,
                terminal,
                escaped_command
            )
        };
        
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute osascript: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to open terminal '{}': {}", terminal, stderr));
        }
        
        Ok(())
    }
    
    #[cfg(target_os = "linux")]
    {
        // Check TERMINAL env var first
        if let Some(terminal) = shell_env::get_env_var("TERMINAL") {
            if let Some(terminal_path) = shell_env::find_executable(&terminal) {
                let result = Command::new(&terminal_path)
                    .args(["-e", "bash", "-c", &format!("{}; exec bash", command)])
                    .spawn();
                
                if result.is_ok() {
                    return Ok(());
                }
            }
        }
        
        // Try common terminal emulators on Linux
        let terminals = ["gnome-terminal", "konsole", "alacritty", "kitty", "xterm", "x-terminal-emulator"];
        
        for terminal in &terminals {
            // Try to find the terminal in PATH
            let terminal_path = shell_env::find_executable(terminal)
                .unwrap_or_else(|| terminal.to_string());
            
            let result = match *terminal {
                "gnome-terminal" => {
                    Command::new(&terminal_path)
                        .args(["--", "bash", "-c", &format!("{}; exec bash", command)])
                        .spawn()
                }
                "konsole" | "alacritty" | "kitty" => {
                    Command::new(&terminal_path)
                        .args(["-e", "bash", "-c", &format!("{}; exec bash", command)])
                        .spawn()
                }
                _ => {
                    Command::new(&terminal_path)
                        .args(["-e", &format!("bash -c '{}; exec bash'", command)])
                        .spawn()
                }
            };
            
            if result.is_ok() {
                return Ok(());
            }
        }
        
        Err("Could not find a suitable terminal emulator. Set TERMINAL env var to specify one.".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        // Check for Windows Terminal first
        let wt_path = shell_env::find_executable("wt");
        if let Some(wt) = wt_path {
            let result = Command::new(wt)
                .args(["cmd", "/k", &command])
                .spawn();
            
            if result.is_ok() {
                return Ok(());
            }
        }
        
        // Fall back to cmd
        Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &command])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
        
        Ok(())
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}
