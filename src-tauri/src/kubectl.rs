use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use tokio::time::{timeout, Duration};

use crate::config::get_kubectl_timeout_secs;
use crate::shell_env;

/// Cached kubectl path - resolved once on first use
static KUBECTL_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Get the path to the kubectl binary.
/// This function searches common installation paths and the user's shell PATH
/// since packaged apps don't inherit the shell environment.
fn get_kubectl_path() -> &'static PathBuf {
    KUBECTL_PATH.get_or_init(|| {
        // Common kubectl installation paths on macOS and Linux
        let common_paths = [
            "/usr/local/bin/kubectl",
            "/opt/homebrew/bin/kubectl",  // Apple Silicon Homebrew
            "/usr/bin/kubectl",
            "/opt/local/bin/kubectl",     // MacPorts
            "/snap/bin/kubectl",          // Snap on Linux
        ];

        // Check common paths first
        for path in &common_paths {
            let path_buf = PathBuf::from(path);
            if path_buf.exists() {
                return path_buf;
            }
        }

        // Check home directory paths
        if let Ok(home) = std::env::var("HOME") {
            let home_paths = [
                format!("{}/.local/bin/kubectl", home),
                format!("{}/bin/kubectl", home),
                format!("{}/.krew/bin/kubectl", home),
            ];
            for path in &home_paths {
                let path_buf = PathBuf::from(path);
                if path_buf.exists() {
                    return path_buf;
                }
            }
        }

        // Try finding kubectl in the user's shell PATH
        // This properly reads PATH from .bashrc/.zshrc etc.
        if let Some(path) = shell_env::find_executable("kubectl") {
            return PathBuf::from(path);
        }

        // Final fallback - just use "kubectl" and let the OS try to find it
        PathBuf::from("kubectl")
    })
}

/// Get the path to kubectl.
/// Useful when you need to pass the path to another command (like stdbuf).
pub fn get_path() -> &'static std::path::PathBuf {
    get_kubectl_path()
}

/// Build a robust PATH for kubectl that includes credential plugin directories.
/// This merges the user's shell PATH with well-known paths where tools like
/// kubelogin, aws-iam-authenticator, etc. are commonly installed.
fn build_kubectl_path() -> String {
    let mut path_dirs: Vec<String> = Vec::new();
    
    // Start with the user's shell PATH
    if let Some(shell_path) = shell_env::get_env_var("PATH") {
        for dir in shell_path.split(':') {
            if !dir.is_empty() && !path_dirs.contains(&dir.to_string()) {
                path_dirs.push(dir.to_string());
            }
        }
    }
    
    // Ensure well-known credential plugin directories are always present.
    // These are where tools like kubelogin, aws-iam-authenticator, gke-gcloud-auth-plugin
    // are commonly installed. Packaged macOS apps often have a minimal PATH that
    // doesn't include these directories.
    let home = std::env::var("HOME").unwrap_or_default();
    let mut extra_dirs = vec![
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];
    
    if !home.is_empty() {
        extra_dirs.push(format!("{}/.asdf/shims", home));
        extra_dirs.push(format!("{}/.local/bin", home));
        extra_dirs.push(format!("{}/.krew/bin", home));
    }
    
    for dir in extra_dirs {
        if !path_dirs.contains(&dir) && std::path::Path::new(&dir).is_dir() {
            path_dirs.push(dir);
        }
    }
    
    path_dirs.join(":")
}

/// Apply kubectl-related environment variables from the user's shell.
/// This ensures KUBECONFIG, PATH, and other settings are properly inherited.
fn apply_kubectl_env(cmd: &mut std::process::Command) {
    // Pass through KUBECONFIG - critical for users with non-standard config locations
    if let Some(kubeconfig) = shell_env::get_env_var("KUBECONFIG") {
        cmd.env("KUBECONFIG", kubeconfig);
    }
    
    // Pass through HOME for ~ expansion in config paths
    if let Some(home) = shell_env::get_env_var("HOME") {
        cmd.env("HOME", home);
    }
    
    // Build a robust PATH that includes credential plugin directories
    // (e.g., kubelogin for Azure AD, aws-iam-authenticator for AWS EKS)
    cmd.env("PATH", build_kubectl_path());
}

/// Apply kubectl-related environment variables to async command.
pub fn apply_env_async(cmd: &mut tokio::process::Command) {
    if let Some(kubeconfig) = shell_env::get_env_var("KUBECONFIG") {
        cmd.env("KUBECONFIG", kubeconfig);
    }
    
    if let Some(home) = shell_env::get_env_var("HOME") {
        cmd.env("HOME", home);
    }
    
    // Build a robust PATH that includes credential plugin directories
    cmd.env("PATH", build_kubectl_path());
}

/// Create a new async (tokio) kubectl command.
/// Use this in async contexts with tokio::process::Command.
/// Automatically inherits KUBECONFIG from user's shell environment.
pub fn async_command() -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(get_kubectl_path());
    apply_env_async(&mut cmd);
    cmd
}

/// Create a new sync (std) kubectl command.
/// Use this in sync contexts with std::process::Command.
/// Automatically inherits KUBECONFIG from user's shell environment.
pub fn sync_command() -> std::process::Command {
    let mut cmd = std::process::Command::new(get_kubectl_path());
    apply_kubectl_env(&mut cmd);
    cmd
}

/// Output from a kubectl command
#[derive(Serialize)]
pub struct KubectlOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Execute kubectl with arguments and configured timeout.
/// Returns the raw process output for callers to handle success/failure.
pub async fn run<I, S>(args: I) -> Result<std::process::Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let timeout_secs = get_kubectl_timeout_secs();
    
    // Spawn the child process with kill_on_drop to ensure cleanup on timeout.
    // When the timeout fires, the future is dropped, which drops the Child,
    // triggering kill_on_drop to terminate the process and close all file descriptors.
    let child = async_command()
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    timeout(Duration::from_secs(timeout_secs), child.wait_with_output())
        .await
        .map_err(|_| {
            format!(
                "kubectl timed out after {}s, check your network connection then click refresh to retry",
                timeout_secs
            )
        })?
        .map_err(|e| format!("Failed to execute kubectl: {}", e))
}

/// Execute a kubectl command with the configured timeout (Tauri command wrapper)
#[tauri::command]
pub async fn kubectl(args: Vec<String>) -> Result<KubectlOutput, String> {
    let output = run(&args).await?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(stderr);
    }

    Ok(KubectlOutput { stdout, stderr })
}
