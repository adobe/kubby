use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// Dashboard config types
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardConfig {
    pub dashboard: Dashboard,
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
pub struct NormalizedDashboardConfig {
    pub groups: Vec<NormalizedDashboardGroup>,
}

#[derive(Debug, Serialize)]
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
                .dashboard
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
        }
    }
}

#[tauri::command]
pub fn get_dashboard_config() -> Result<NormalizedDashboardConfig, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not get HOME directory")?;
    let config_path: PathBuf = [&home, ".config", "kubby", "kubby_config.yaml"].iter().collect();

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file at {:?}: {}", config_path, e))?;

    let config: DashboardConfig = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse config YAML: {}", e))?;

    Ok(config.normalize())
}

