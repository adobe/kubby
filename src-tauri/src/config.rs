use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::kubectl;

/// Default timeout for kubectl commands in seconds
const DEFAULT_KUBECTL_TIMEOUT_SECS: u64 = 10;

/// Global storage for kubectl timeout from config
static KUBECTL_TIMEOUT: OnceLock<u64> = OnceLock::new();

/// Get the kubectl timeout in seconds (from config or default)
pub fn get_kubectl_timeout_secs() -> u64 {
    *KUBECTL_TIMEOUT.get().unwrap_or(&DEFAULT_KUBECTL_TIMEOUT_SECS)
}

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
#[serde(rename_all = "camelCase")]
pub struct ResourcesConfig {
    #[serde(default, alias = "run")]
    pub run_commands: Vec<RunCommand>,
}

// AI assistant configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiTool {
    CursorAgent,  // cursor agent CLI
    Cursor,       // Open Cursor IDE window
    Claude,       // claude CLI
    Augment,      // auggie CLI
    Codex,        // codex CLI
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// Which AI tool to use
    pub tool: Option<AiTool>,
    /// Custom name for the AI button (defaults to "AI")
    #[serde(default)]
    pub name: Option<String>,
    /// Read-only mode for AI kubectl (separate from global readOnly)
    #[serde(default)]
    pub read_only: Option<bool>,
}

impl AiTool {
    /// Get the display name for this tool (used in tooltip)
    pub fn display_name(&self) -> &'static str {
        match self {
            AiTool::CursorAgent => "Cursor Agent",
            AiTool::Cursor => "Cursor IDE",
            AiTool::Claude => "Claude Code",
            AiTool::Augment => "Augment",
            AiTool::Codex => "Codex",
        }
    }
}

/// Normalized AI config for frontend consumption
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedAiConfig {
    pub tool: AiTool,
    /// Custom button name (defaults to "AI")
    pub name: String,
    /// Display name of the tool (for tooltip)
    pub tool_display_name: String,
    pub read_only: bool,
}

// Dashboard config types
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardConfig {
    pub contexts: Dashboard,
    #[serde(default)]
    pub resources: Option<ResourcesConfig>,
    #[serde(default)]
    pub ai: Option<AiConfig>,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub live_view_auto_refresh: Option<bool>,
    #[serde(default)]
    pub refresh_rate_seconds: Option<u32>,
    #[serde(default)]
    pub metrics_refresh_rate_seconds: Option<u32>,
    #[serde(default)]
    pub kubectl_timeout_seconds: Option<u64>,
    /// Accent color for shortcut badges and dashboard bullets.
    /// Options: auburn, blue, brown, coral, cyan, gray, green, indigo, lemon, lime,
    /// olive, orange, pine, pink, plum, purple, red, teal, yellow
    #[serde(default)]
    pub accent_color: Option<String>,
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
    pub ai: Option<NormalizedAiConfig>,
    pub read_only: bool,
    pub live_view_auto_refresh: bool,
    pub refresh_rate_seconds: u32,
    pub metrics_refresh_rate_seconds: u32,
    pub kubectl_timeout_seconds: u64,
    pub accent_color: String,
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
        // Normalize AI config: only include if a tool is specified
        let ai = self.ai.as_ref().and_then(|ai_config| {
            ai_config.tool.as_ref().map(|tool| NormalizedAiConfig {
                name: ai_config.name.clone().unwrap_or_else(|| "AI".to_string()),
                tool_display_name: tool.display_name().to_string(),
                tool: tool.clone(),
                read_only: ai_config.read_only.unwrap_or(true), // Default to read-only for safety
            })
        });

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
                .map(|r| r.run_commands.clone())
                .unwrap_or_default(),
            ai,
            read_only: self.read_only,
            live_view_auto_refresh: self.live_view_auto_refresh.unwrap_or(true),
            refresh_rate_seconds: self.refresh_rate_seconds.unwrap_or(2),
            metrics_refresh_rate_seconds: self.metrics_refresh_rate_seconds.unwrap_or(30),
            kubectl_timeout_seconds: self.kubectl_timeout_seconds.unwrap_or(DEFAULT_KUBECTL_TIMEOUT_SECS),
            accent_color: self.accent_color.clone().unwrap_or_else(|| "orange".to_string()),
        }
    }
}

/// Get the path to the kubby config file
/// Checks KUBBY_CONFIG environment variable first, then falls back to default location
pub fn get_config_path() -> Result<PathBuf, String> {
    // Check for KUBBY_CONFIG environment variable first
    if let Ok(config_path) = std::env::var("KUBBY_CONFIG") {
        return Ok(PathBuf::from(config_path));
    }
    
    // Fall back to default location
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

    let normalized = config.normalize();
    
    // Initialize global kubectl timeout (only sets once, ignores subsequent calls)
    let _ = KUBECTL_TIMEOUT.set(normalized.kubectl_timeout_seconds);

    Ok(normalized)
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

    let result = kubectl::run(["config", "get-contexts", "--output", "name"]).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
    let context_names: Vec<String> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    // Get the current context
    let current_result = kubectl::run(["config", "current-context"]).await?;

    let current_context = if current_result.output.status.success() {
        String::from_utf8_lossy(&current_result.output.stdout).trim().to_string()
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
    let result = kubectl::run([
        "get", "namespaces",
        "--context", &context,
        "--output", "jsonpath={.items[*].metadata.name}"
    ]).await?;

    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("Failed to get namespaces: {}\nCommand: {}", stderr.trim(), result.command));
    }

    let stdout = String::from_utf8_lossy(&result.output.stdout);
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
    yaml.push_str("# metricsRefreshRateSeconds: 60 # default is 30\n");
    yaml.push_str("# kubectlTimeoutSeconds: 30 # default is 10\n");
    yaml.push_str("# accentColor: orange # Accent color for shortcut badges. Default is orange.\n");
    yaml.push_str("#   Options: auburn, blue, brown, coral, cyan, gray, green, indigo, lemon, lime, olive, orange, pine, pink, plum, purple, red, teal, yellow\n");
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
    yaml.push_str("      command: \"kubectl debug --context $context --namespace $namespace $name -it --image=busybox -- sh\" # Uses $name to reference the selected pod\n");
    yaml.push_str("      resources: [\"pod\"]\n");
    yaml.push_str("\n");
    yaml.push_str("# AI Assistant Configuration\n");
    yaml.push_str("# Configure an AI coding assistant to help with Kubernetes operations.\n");
    yaml.push_str("# The AI button [A] will appear in the shortcuts bar when configured.\n");
    yaml.push_str("# ai:\n");
    yaml.push_str("#   # Tool to launch. Options:\n");
    yaml.push_str("#   #   cursor-agent  - Cursor agent CLI (terminal-based)\n");
    yaml.push_str("#   #   cursor        - Open Cursor IDE window\n");
    yaml.push_str("#   #   claude        - Claude Code CLI\n");
    yaml.push_str("#   #   augment       - Augment (auggie) CLI\n");
    yaml.push_str("#   #   codex         - OpenAI Codex CLI\n");
    yaml.push_str("#   tool: cursor-agent\n");
    yaml.push_str("#   # Custom button name (default: \"AI\")\n");
    yaml.push_str("#   name: Agent\n");
    yaml.push_str("#   # Read-only mode restricts kubectl to safe commands (get, describe, logs, etc.)\n");
    yaml.push_str("#   # Default is true for safety.\n");
    yaml.push_str("#   readOnly: true\n");

    fs::write(&config_path, &yaml)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(config_path.to_string_lossy().to_string())
}
