use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use tokio::time::{timeout, Duration};

use crate::config::get_kubectl_timeout_secs;
use crate::shell_env;

/// Cached kubectl path - resolved once on first use
static KUBECTL_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Get the resolved path to the kubectl binary (cached after first lookup).
pub fn get_path() -> &'static PathBuf {
    KUBECTL_PATH.get_or_init(|| {
        // find_executable searches process PATH, shell PATH, and well-known dirs
        shell_env::find_executable("kubectl")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("kubectl"))
    })
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
    
    // Use the full merged PATH that includes credential plugin directories
    // (e.g., kubelogin for Azure AD, aws-iam-authenticator for AWS EKS)
    cmd.env("PATH", shell_env::build_full_path());
}

/// Apply kubectl-related environment variables to async command.
pub fn apply_env_async(cmd: &mut tokio::process::Command) {
    if let Some(kubeconfig) = shell_env::get_env_var("KUBECONFIG") {
        cmd.env("KUBECONFIG", kubeconfig);
    }
    
    if let Some(home) = shell_env::get_env_var("HOME") {
        cmd.env("HOME", home);
    }
    
    // Use the full merged PATH that includes credential plugin directories
    cmd.env("PATH", shell_env::build_full_path());
}

/// Create a new async (tokio) kubectl command.
/// Use this in async contexts with tokio::process::Command.
/// Automatically inherits KUBECONFIG from user's shell environment.
pub fn async_command() -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(get_path());
    apply_env_async(&mut cmd);
    cmd
}

/// Create a new sync (std) kubectl command.
/// Use this in sync contexts with std::process::Command.
/// Automatically inherits KUBECONFIG from user's shell environment.
pub fn sync_command() -> std::process::Command {
    let mut cmd = std::process::Command::new(get_path());
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
