use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::{ColumnConfig, ResourceColumnConfig};

// Column definition types for resource column discovery
#[derive(Debug, Serialize, Deserialize)]
struct AdditionalPrinterColumn {
    name: String,
    #[serde(rename = "type")]
    column_type: Option<String>,
    description: Option<String>,
    priority: Option<i32>,
    #[serde(rename = "jsonPath")]
    json_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CRDVersion {
    name: String,
    #[serde(rename = "additionalPrinterColumns")]
    additional_printer_columns: Option<Vec<AdditionalPrinterColumn>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CRDSpec {
    versions: Option<Vec<CRDVersion>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CRDResponse {
    spec: Option<CRDSpec>,
}

pub fn get_builtin_resource_columns(resource_type: &str) -> Option<ResourceColumnConfig> {
    let columns: Vec<ColumnConfig> = match resource_type.to_lowercase().as_str() {
        "pods" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec![
                    "$.status.containerStatuses[?(@.ready==true)]".to_string(),
                    "$.status.containerStatuses[*]".to_string(),
                ],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec![],  // Not used for PodStatus type
                format: None,
                column_type: Some(crate::ColumnType::PodStatus),
            },
            ColumnConfig {
                name: "RESTARTS".to_string(),
                json_paths: vec!["$.status.containerStatuses[*].restartCount".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Number),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "deployments" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.readyReplicas".to_string(), "$.spec.replicas".to_string()],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_paths: vec!["$.status.updatedReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_paths: vec!["$.status.availableReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "services" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.spec.type".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "CLUSTER-IP".to_string(),
                json_paths: vec!["$.spec.clusterIP".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "EXTERNAL-IP".to_string(),
                json_paths: vec!["$.status.loadBalancer.ingress[*].ip".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "PORT(S)".to_string(),
                json_paths: vec!["$.spec.ports[*].port".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "configmaps" => vec![
            ColumnConfig {
                name: "DATA".to_string(),
                json_paths: vec!["$.data".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "secrets" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.type".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "DATA".to_string(),
                json_paths: vec!["$.data".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "nodes" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.conditions[-1:].type".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "ROLES".to_string(),
                json_paths: vec!["$.metadata.labels".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
            ColumnConfig {
                name: "VERSION".to_string(),
                json_paths: vec!["$.status.nodeInfo.kubeletVersion".to_string()],
                format: None,
                column_type: None,
            },
        ],
        "namespaces" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "persistentvolumeclaims" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "VOLUME".to_string(),
                json_paths: vec!["$.spec.volumeName".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_paths: vec!["$.status.capacity.storage".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_paths: vec!["$.status.accessModes[*]".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_paths: vec!["$.spec.storageClassName".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "persistentvolumes" => vec![
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_paths: vec!["$.spec.capacity.storage".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_paths: vec!["$.spec.accessModes[*]".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "RECLAIM POLICY".to_string(),
                json_paths: vec!["$.spec.persistentVolumeReclaimPolicy".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "CLAIM".to_string(),
                json_paths: vec!["$.spec.claimRef.name".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_paths: vec!["$.spec.storageClassName".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "ingresses" => vec![
            ColumnConfig {
                name: "CLASS".to_string(),
                json_paths: vec!["$.spec.ingressClassName".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "HOSTS".to_string(),
                json_paths: vec!["$.spec.rules[*].host".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "ADDRESS".to_string(),
                json_paths: vec!["$.status.loadBalancer.ingress[*].ip".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_paths: vec!["$.spec.rules[*].http.paths[*].backend.service.port.number".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "statefulsets" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.readyReplicas".to_string(), "$.spec.replicas".to_string()],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "daemonsets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_paths: vec!["$.status.desiredNumberScheduled".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_paths: vec!["$.status.currentNumberScheduled".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.numberReady".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_paths: vec!["$.status.updatedNumberScheduled".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_paths: vec!["$.status.numberAvailable".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "NODE SELECTOR".to_string(),
                json_paths: vec!["$.spec.template.spec.nodeSelector".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "replicasets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_paths: vec!["$.spec.replicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_paths: vec!["$.status.replicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.readyReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "jobs" => vec![
            ColumnConfig {
                name: "COMPLETIONS".to_string(),
                json_paths: vec!["$.status.succeeded".to_string(), "$.spec.completions".to_string()],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
            },
            ColumnConfig {
                name: "DURATION".to_string(),
                json_paths: vec!["$.status.completionTime".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "cronjobs" => vec![
            ColumnConfig {
                name: "SCHEDULE".to_string(),
                json_paths: vec!["$.spec.schedule".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "SUSPEND".to_string(),
                json_paths: vec!["$.spec.suspend".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Bool),
            },
            ColumnConfig {
                name: "ACTIVE".to_string(),
                json_paths: vec!["$.status.active".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "LAST SCHEDULE".to_string(),
                json_paths: vec!["$.status.lastScheduleTime".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "events" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.type".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "REASON".to_string(),
                json_paths: vec!["$.reason".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "OBJECT".to_string(),
                json_paths: vec!["$.involvedObject.name".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "MESSAGE".to_string(),
                json_paths: vec!["$.message".to_string()],
                format: None,
                column_type: None,
            },
        ],
        "serviceaccounts" => vec![
            ColumnConfig {
                name: "SECRETS".to_string(),
                json_paths: vec!["$.secrets".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "roles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "rolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_paths: vec!["$.roleRef.name".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "clusterroles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "clusterrolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_paths: vec!["$.roleRef.name".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "horizontalpodautoscalers" => vec![
            ColumnConfig {
                name: "REFERENCE".to_string(),
                json_paths: vec!["$.spec.scaleTargetRef.name".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "TARGETS".to_string(),
                json_paths: vec!["$.status.currentMetrics".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "MINPODS".to_string(),
                json_paths: vec!["$.spec.minReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "MAXPODS".to_string(),
                json_paths: vec!["$.spec.maxReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "REPLICAS".to_string(),
                json_paths: vec!["$.status.currentReplicas".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        "networkpolicies" => vec![
            ColumnConfig {
                name: "POD-SELECTOR".to_string(),
                json_paths: vec!["$.spec.podSelector.matchLabels".to_string()],
                format: None,
                column_type: None,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            },
        ],
        _ => return None,
    };

    Some(ResourceColumnConfig { columns })
}

#[tauri::command]
pub fn get_resource_columns(
    resource_type: String,
    context: String,
    _namespace: String,
) -> Result<ResourceColumnConfig, String> {
    // First, check if it's a built-in resource with hardcoded config
    if let Some(config) = get_builtin_resource_columns(&resource_type) {
        return Ok(config);
    }

    // If not found in built-in resources, try CRD lookup (for custom resources)
    get_crd_columns(&resource_type, &context)
}

fn get_crd_columns(resource_type: &str, context: &str) -> Result<ResourceColumnConfig, String> {
    // Try to find the CRD name by querying API resources
    // First, get all CRDs
    let crd_args = vec![
        "get".to_string(),
        "crd".to_string(),
        "--context".to_string(),
        context.to_string(),
        "-o".to_string(),
        "json".to_string(),
    ];

    let output = Command::new("kubectl")
        .args(&crd_args)
        .output()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        // Return default config if we can't query CRDs
        return Ok(ResourceColumnConfig {
            columns: vec![ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            }],
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let crd_list: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse CRD list: {}", e))?;

    // Find CRD that matches the resource type
    if let Some(items) = crd_list.get("items").and_then(|v| v.as_array()) {
        for crd_item in items {
            if let Some(spec) = crd_item.get("spec") {
                if let Some(names) = spec.get("names") {
                    if let Some(kind) = names.get("kind").and_then(|v| v.as_str()) {
                        // Convert resource_type (plural) to kind (singular) for comparison
                        // This is a simple heuristic - might need refinement
                        let resource_kind = resource_type.trim_end_matches('s');
                        if kind.eq_ignore_ascii_case(resource_kind) {
                            // Found matching CRD, get its definition
                            if let Some(crd_name) = crd_item.get("metadata")
                                .and_then(|m| m.get("name"))
                                .and_then(|n| n.as_str()) {
                                return get_crd_definition(crd_name, context);
                            }
                        }
                    }
                }
            }
        }
    }

    // Return default config if no CRD found
    Ok(ResourceColumnConfig {
        columns: vec![ColumnConfig {
            name: "AGE".to_string(),
            json_paths: vec!["$.metadata.creationTimestamp".to_string()],
            format: None,
            column_type: Some(crate::ColumnType::Duration),
        }],
    })
}

fn get_crd_definition(crd_name: &str, context: &str) -> Result<ResourceColumnConfig, String> {
    let args = vec![
        "get".to_string(),
        "crd".to_string(),
        crd_name.to_string(),
        "--context".to_string(),
        context.to_string(),
        "-o".to_string(),
        "json".to_string(),
    ];

    let output = Command::new("kubectl")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        return Ok(ResourceColumnConfig {
            columns: vec![ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(crate::ColumnType::Duration),
            }],
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let crd: CRDResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse CRD: {}", e))?;

    // Get the latest version's additionalPrinterColumns
    if let Some(spec) = crd.spec {
        if let Some(versions) = spec.versions {
            // Use the latest version (usually the last one)
            if let Some(latest_version) = versions.last() {
                if let Some(columns) = &latest_version.additional_printer_columns {
                    if !columns.is_empty() {
                        let config_columns: Vec<ColumnConfig> = columns
                            .iter()
                            .map(|col| ColumnConfig {
                                name: col.name.clone(),
                                json_paths: vec![col.json_path.clone()],
                                format: None,
                                column_type: None,
                            })
                            .collect();
                        
                        return Ok(ResourceColumnConfig {
                            columns: config_columns,
                        });
                    }
                }
            }
        }
    }

    // Return default config
    Ok(ResourceColumnConfig {
        columns: vec![ColumnConfig {
            name: "AGE".to_string(),
            json_paths: vec!["$.metadata.creationTimestamp".to_string()],
            format: None,
            column_type: Some(crate::ColumnType::Duration),
        }],
    })
}

