use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const KUBECTL_TIMEOUT_SECS: u64 = 10;

// Run command configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunCommand {
    pub name: String,
    pub command: String,
    /// Optional list of resource types this command applies to.
    /// If None or empty, the command applies to all resources.
    #[serde(default)]
    pub resources: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourcesConfig {
    #[serde(default)]
    pub run: Vec<RunCommand>,
}

// Dashboard config types
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardConfig {
    pub contexts: Dashboard,
    #[serde(default)]
    pub resources: Option<ResourcesConfig>,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub live_view_auto_refresh: Option<bool>,
    #[serde(default)]
    pub refresh_rate_seconds: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Dashboard {
    pub groups: Vec<DashboardGroup>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardGroup {
    pub name: String,
    pub contexts: Vec<ContextGroup>,
    pub namespaces: Namespaces,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContextGroup {
    pub group: String,
    pub contexts: Vec<ContextItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContextItem {
    pub name: String,
}

// Namespaces can be either a simple list or grouped namespaces
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Namespaces {
    Grouped(Vec<NamespaceGroup>),
    Simple(Vec<NamespaceItem>),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NamespaceItem {
    pub name: String,
    #[serde(default)]
    pub contexts: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NamespaceGroup {
    #[serde(alias = "group", default)]
    pub name: Option<String>,
    pub namespaces: Vec<NamespaceItem>,
}

// Normalized types for frontend consumption
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedDashboardConfig {
    pub groups: Vec<NormalizedDashboardGroup>,
    pub run_commands: Vec<RunCommand>,
    pub read_only: bool,
    pub live_view_auto_refresh: bool,
    pub refresh_rate_seconds: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedDashboardGroup {
    pub name: String,
    pub context_groups: Vec<NormalizedContextGroup>,
    pub namespace_groups: Vec<NormalizedNamespaceGroup>,
}

#[derive(Debug, Serialize)]
pub struct NormalizedContextGroup {
    pub name: String,
    pub contexts: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct NormalizedNamespaceGroup {
    pub name: Option<String>,
    pub namespaces: Vec<NormalizedNamespaceItem>,
}

#[derive(Debug, Serialize)]
pub struct NormalizedNamespaceItem {
    pub name: String,
    /// If None, namespace is available in all contexts. If Some, only in listed contexts.
    pub contexts: Option<Vec<String>>,
}

impl DashboardConfig {
    pub fn normalize(&self) -> NormalizedDashboardConfig {
        NormalizedDashboardConfig {
            groups: self
                .contexts
                .groups
                .iter()
                .map(|g| NormalizedDashboardGroup {
                    name: g.name.clone(),
                    context_groups: g
                        .contexts
                        .iter()
                        .map(|cg| NormalizedContextGroup {
                            name: cg.group.clone(),
                            contexts: cg.contexts.iter().map(|c| c.name.clone()).collect(),
                        })
                        .collect(),
                    namespace_groups: match &g.namespaces {
                        Namespaces::Simple(list) => {
                            vec![NormalizedNamespaceGroup {
                                name: None,
                                namespaces: list
                                    .iter()
                                    .map(|n| NormalizedNamespaceItem {
                                        name: n.name.clone(),
                                        contexts: n.contexts.clone(),
                                    })
                                    .collect(),
                            }]
                        }
                        Namespaces::Grouped(groups) => groups
                            .iter()
                            .map(|ng| NormalizedNamespaceGroup {
                                name: ng.name.clone(),
                                namespaces: ng
                                    .namespaces
                                    .iter()
                                    .map(|n| NormalizedNamespaceItem {
                                        name: n.name.clone(),
                                        contexts: n.contexts.clone(),
                                    })
                                    .collect(),
                            })
                            .collect(),
                    },
                })
                .collect(),
            run_commands: self
                .resources
                .as_ref()
                .map(|r| r.run.clone())
                .unwrap_or_default(),
            read_only: self.read_only,
            live_view_auto_refresh: self.live_view_auto_refresh.unwrap_or(true),
            refresh_rate_seconds: self.refresh_rate_seconds.unwrap_or(2),
        }
    }
}

/// Get the path to the kubby config file
fn get_config_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not get HOME directory")?;
    Ok([&home, ".config", "kubby", "kubby_config.yaml"].iter().collect())
}

#[tauri::command]
pub fn get_dashboard_config() -> Result<NormalizedDashboardConfig, String> {
    let config_path = get_config_path()?;

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file at {:?}: {}", config_path, e))?;

    let config: DashboardConfig = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse config YAML: {}", e))?;

    Ok(config.normalize())
}

/// Check if the kubby config file exists
#[tauri::command]
pub fn check_config_exists() -> bool {
    match get_config_path() {
        Ok(path) => path.exists(),
        Err(_) => false,
    }
}

/// Response type for discovered kube context
#[derive(Debug, Serialize)]
pub struct KubeContext {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub is_current: bool,
}

/// Response type for get_kube_contexts command
#[derive(Debug, Serialize)]
pub struct KubeContextsResult {
    pub contexts: Vec<KubeContext>,
    pub kubeconfig_path: String,
}

/// Get all contexts from the user's kubeconfig
#[tauri::command]
pub async fn get_kube_contexts() -> Result<KubeContextsResult, String> {
    // Get the kubeconfig path (from KUBECONFIG env or default)
    let kubeconfig_path = std::env::var("KUBECONFIG")
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_default();
            format!("{}/.kube/config", home)
        });

    // Run kubectl config get-contexts
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(["config", "get-contexts", "-o", "name"])
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your connection", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let context_names: Vec<String> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    // Get the current context
    let current_output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(["config", "current-context"])
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your connection", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    let current_context = if current_output.status.success() {
        String::from_utf8_lossy(&current_output.stdout).trim().to_string()
    } else {
        String::new()
    };

    // Build context list with details
    let contexts: Vec<KubeContext> = context_names
        .into_iter()
        .map(|name| KubeContext {
            is_current: name == current_context,
            name,
            cluster: String::new(),
            user: String::new(),
        })
        .collect();

    Ok(KubeContextsResult {
        contexts,
        kubeconfig_path,
    })
}

/// Get namespaces for a specific context
#[tauri::command]
pub async fn get_namespaces_for_context(context: String) -> Result<Vec<String>, String> {
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args([
                "get", "namespaces",
                "--context", &context,
                "-o", "jsonpath={.items[*].metadata.name}"
            ])
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your connection", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get namespaces: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let namespaces: Vec<String> = stdout
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    Ok(namespaces)
}

/// Get the kubby config file path
#[tauri::command]
pub fn get_kubby_config_path() -> Result<String, String> {
    let path = get_config_path()?;
    Ok(path.to_string_lossy().to_string())
}

/// Input for creating the config - namespaces per context
#[derive(Debug, Deserialize)]
pub struct ContextNamespaces {
    #[allow(dead_code)]
    pub context: String,
    pub namespaces: Option<Vec<String>>,
}

/// Create the kubby config file
#[tauri::command]
pub fn create_kubby_config(
    contexts: Vec<String>,
    context_namespaces: Vec<ContextNamespaces>,
) -> Result<String, String> {
    let config_path = get_config_path()?;
    
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let mut all_namespaces: Vec<String> = context_namespaces
        .iter()
        .filter_map(|cn| cn.namespaces.as_ref())
        .flatten()
        .cloned()
        .collect();
    all_namespaces.sort();
    all_namespaces.dedup();

    let has_namespace_errors = context_namespaces.iter().any(|cn| cn.namespaces.is_none());

    let mut yaml = String::new();
    
    yaml.push_str("# Kubby Dashboard Configuration\n");
    yaml.push_str("\n");
    yaml.push_str("\n");
    yaml.push_str("# readOnly: true # default is false\n");
    yaml.push_str("# liveViewAutoRefresh: false # default is true\n");
    yaml.push_str("# refreshRateSeconds: 5 # default is 2\n");
    yaml.push_str("contexts:\n");
    yaml.push_str("  # Groups organize contexts and namespaces into logical sections on the dashboard.\n");
    yaml.push_str("  # You can have multiple groups (e.g., \"Production\", \"Staging\", \"Development\").\n");
    yaml.push_str("  groups:\n");
    yaml.push_str("    - name: \"Kubernetes\"  # Display name shown as the group header\n");
    yaml.push_str("\n");
    yaml.push_str("      # Contexts define which Kubernetes clusters/contexts to show.\n");
    yaml.push_str("      # Each context group creates a column section in the dashboard matrix.\n");
    yaml.push_str("      contexts:\n");
    yaml.push_str("        - group: \"All Contexts\"  # Label for this column group\n");
    yaml.push_str("          contexts:\n");
    
    for (i, ctx) in contexts.iter().enumerate() {
        if i == 0 {
            yaml.push_str(&format!("            - name: \"{}\"  # Must match a context name from your kubeconfig\n", ctx));
        } else {
            yaml.push_str(&format!("            - name: \"{}\"\n", ctx));
        }
    }
    
    yaml.push_str("\n");
    yaml.push_str("      # Namespaces define the rows in the dashboard matrix.\n");
    yaml.push_str("      # Each namespace creates a row that intersects with context columns.\n");
    yaml.push_str("      namespaces:\n");
    
    if all_namespaces.is_empty() || has_namespace_errors {
        yaml.push_str("        # NOTE: Namespaces could not be automatically discovered for some contexts.\n");
        yaml.push_str("        # Please add your namespaces manually below.\n");
        if !all_namespaces.is_empty() {
            yaml.push_str("        # The following namespaces were discovered from accessible contexts:\n");
            for ns in &all_namespaces {
                yaml.push_str(&format!("        - name: \"{}\"\n", ns));
            }
        } else {
            yaml.push_str("        # - name: \"default\"\n");
            yaml.push_str("        # - name: \"kube-system\"\n");
        }
    } else {
        for ns in &all_namespaces {
            yaml.push_str(&format!("        - name: \"{}\"\n", ns));
        }
    }
    
    yaml.push_str("        # Add more namespaces as needed.\n");
    yaml.push_str("        # Optional: restrict a namespace to specific contexts:\n");
    yaml.push_str("        # - name: \"dev-only-ns\"\n");
    yaml.push_str("        #   contexts: [\"dev-context\"]  # Only shows for these contexts\n");
    yaml.push_str("\n");
    yaml.push_str("# Resource commands configuration\n");
    yaml.push_str("# These commands can be run from the resource list using the Run... [U] shortcut.\n");
    yaml.push_str("# Placeholders: $context, $namespace, $name (resource name), $labels (formatted as key=value,key=value)\n");
    yaml.push_str("resources:\n");
    yaml.push_str("  run:\n");
    yaml.push_str("    - name: \"Test Network Multitool\"\n");
    yaml.push_str("      command: \"kubectl run test-network-multitool --context $context --namespace $namespace --image=praqma/network-multitool --labels=$labels --restart=Never --command -- sleep infinity\"\n");
    yaml.push_str("      resources: [\"pod\"]  # Only show this command when viewing pods\n");
    yaml.push_str("    - name: \"Debug Selected Pod\"\n");
    yaml.push_str("      command: \"kubectl debug --context $context --namespace $namespace $name -it --image=busybox -- sh\"\n");
    yaml.push_str("      resources: [\"pod\"]  # Uses $name to reference the selected pod\n");
    yaml.push_str("    - name: \"Port Forward\"\n");
    yaml.push_str("      command: \"kubectl port-forward --context $context --namespace $namespace $name 8080:80\"\n");
    yaml.push_str("      # Uses $name to forward ports from the selected resource\n");

    fs::write(&config_path, &yaml)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(config_path.to_string_lossy().to_string())
}
