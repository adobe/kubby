use std::collections::HashMap;
use std::sync::OnceLock;

/// Cached shell environment - loaded once from user's login shell
static SHELL_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Load environment variables from the user's login shell.
/// This spawns an interactive login shell to properly source all config files.
fn load_shell_env() -> HashMap<String, String> {
    let mut env_map = HashMap::new();
    
    // Get the user's default shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    
    // Try interactive login shell first (-i -l)
    // This sources both login files (.zprofile) AND interactive files (.zshrc)
    // which is where most users set their environment variables
    let output = std::process::Command::new(&shell)
        .args(["-i", "-l", "-c", "env"])
        .stderr(std::process::Stdio::null()) // Suppress shell startup messages
        .output();
    
    if let Ok(output) = &output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some((key, value)) = line.split_once('=') {
                    env_map.insert(key.to_string(), value.to_string());
                }
            }
        }
    }
    
    // If interactive shell didn't work or returned empty, try login shell only
    if env_map.is_empty() {
        let output = std::process::Command::new(&shell)
            .args(["-l", "-c", "env"])
            .output();
        
        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Some((key, value)) = line.split_once('=') {
                        env_map.insert(key.to_string(), value.to_string());
                    }
                }
            }
        }
    }
    
    // On macOS, also try launchctl for environment variables
    // This catches variables set via launchctl setenv
    #[cfg(target_os = "macos")]
    {
        for key in ["KUBECONFIG", "PATH", "HOME", "EDITOR", "KUBE_EDITOR", "TERMINAL"] {
            if !env_map.contains_key(key) || env_map.get(key).map(|v| v.is_empty()).unwrap_or(true) {
                if let Ok(output) = std::process::Command::new("launchctl")
                    .args(["getenv", key])
                    .output()
                {
                    if output.status.success() {
                        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !value.is_empty() {
                            env_map.insert(key.to_string(), value);
                        }
                    }
                }
            }
        }
    }
    
    env_map
}

/// Get the cached shell environment
fn get_shell_env() -> &'static HashMap<String, String> {
    SHELL_ENV.get_or_init(load_shell_env)
}

/// Get an environment variable from the user's shell environment.
/// Falls back to std::env::var if not found in shell env.
pub fn get_env_var(key: &str) -> Option<String> {
    // First try the shell environment (from login shell)
    if let Some(value) = get_shell_env().get(key) {
        if !value.is_empty() {
            return Some(value.clone());
        }
    }
    
    // Fall back to current process environment
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

/// Get the PATH from the user's shell environment.
/// This is useful for finding executables that aren't in standard paths.
pub fn get_shell_path() -> Option<String> {
    get_env_var("PATH")
}

/// Find an executable by name, searching the user's shell PATH.
/// Returns the full path if found, or None if not found.
pub fn find_executable(name: &str) -> Option<String> {
    // If it's already an absolute path, check if it exists
    if name.starts_with('/') {
        if std::path::Path::new(name).exists() {
            return Some(name.to_string());
        }
        return None;
    }
    
    // Get PATH from shell environment
    let path = get_shell_path()?;
    
    // Search each directory in PATH
    for dir in path.split(':') {
        let full_path = format!("{}/{}", dir, name);
        if std::path::Path::new(&full_path).exists() {
            return Some(full_path);
        }
    }
    
    None
}
