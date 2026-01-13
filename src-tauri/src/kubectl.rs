use serde::Serialize;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::types::KUBECTL_TIMEOUT_SECS;

/// Output from a kubectl command
#[derive(Serialize)]
pub struct KubectlOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Execute a kubectl command with the configured timeout
#[tauri::command]
pub async fn kubectl(args: Vec<String>) -> Result<KubectlOutput, String> {
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
