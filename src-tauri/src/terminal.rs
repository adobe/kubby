use tokio::process::Command;

/// Open a new terminal window with the specified command
/// Uses AppleScript on macOS to open Terminal.app
#[tauri::command]
pub async fn open_terminal_with_command(command: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Escape double quotes and backslashes in the command for AppleScript
        let escaped_command = command
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        
        let script = format!(
            r#"tell application "Terminal"
                activate
                do script "{}"
            end tell"#,
            escaped_command
        );
        
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .await
            .map_err(|e| format!("Failed to execute osascript: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to open terminal: {}", stderr));
        }
        
        Ok(())
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators on Linux
        let terminals = ["gnome-terminal", "konsole", "xterm", "x-terminal-emulator"];
        
        for terminal in &terminals {
            let result = match *terminal {
                "gnome-terminal" => {
                    Command::new(terminal)
                        .args(["--", "bash", "-c", &format!("{}; exec bash", command)])
                        .spawn()
                }
                "konsole" => {
                    Command::new(terminal)
                        .args(["-e", "bash", "-c", &format!("{}; exec bash", command)])
                        .spawn()
                }
                _ => {
                    Command::new(terminal)
                        .args(["-e", &format!("bash -c '{}; exec bash'", command)])
                        .spawn()
                }
            };
            
            if result.is_ok() {
                return Ok(());
            }
        }
        
        Err("Could not find a suitable terminal emulator".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
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
