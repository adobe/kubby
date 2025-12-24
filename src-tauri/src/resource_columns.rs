use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ColumnConfig, ResourceColumnConfig};

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
                json_path: ".status.containerStatuses[*].ready".to_string(),
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_path: ".status.phase".to_string(),
            },
            ColumnConfig {
                name: "RESTARTS".to_string(),
                json_path: ".status.containerStatuses[0].restartCount".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "deployments" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_path: ".status.readyReplicas/.spec.replicas".to_string(),
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_path: ".status.updatedReplicas".to_string(),
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_path: ".status.availableReplicas".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "services" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_path: ".spec.type".to_string(),
            },
            ColumnConfig {
                name: "CLUSTER-IP".to_string(),
                json_path: ".spec.clusterIP".to_string(),
            },
            ColumnConfig {
                name: "EXTERNAL-IP".to_string(),
                json_path: ".status.loadBalancer.ingress[0].ip".to_string(),
            },
            ColumnConfig {
                name: "PORT(S)".to_string(),
                json_path: ".spec.ports[*]".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "configmaps" => vec![
            ColumnConfig {
                name: "DATA".to_string(),
                json_path: ".data".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "secrets" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_path: ".type".to_string(),
            },
            ColumnConfig {
                name: "DATA".to_string(),
                json_path: ".data".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "nodes" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_path: ".status.conditions[-1].type".to_string(),
            },
            ColumnConfig {
                name: "ROLES".to_string(),
                json_path: ".metadata.labels['node-role.kubernetes.io/']".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
            ColumnConfig {
                name: "VERSION".to_string(),
                json_path: ".status.nodeInfo.kubeletVersion".to_string(),
            },
        ],
        "namespaces" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_path: ".status.phase".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "persistentvolumeclaims" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_path: ".status.phase".to_string(),
            },
            ColumnConfig {
                name: "VOLUME".to_string(),
                json_path: ".spec.volumeName".to_string(),
            },
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_path: ".status.capacity.storage".to_string(),
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_path: ".status.accessModes[*]".to_string(),
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_path: ".spec.storageClassName".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "persistentvolumes" => vec![
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_path: ".spec.capacity.storage".to_string(),
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_path: ".spec.accessModes[*]".to_string(),
            },
            ColumnConfig {
                name: "RECLAIM POLICY".to_string(),
                json_path: ".spec.persistentVolumeReclaimPolicy".to_string(),
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_path: ".status.phase".to_string(),
            },
            ColumnConfig {
                name: "CLAIM".to_string(),
                json_path: ".spec.claimRef.name".to_string(),
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_path: ".spec.storageClassName".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "ingresses" => vec![
            ColumnConfig {
                name: "CLASS".to_string(),
                json_path: ".spec.ingressClassName".to_string(),
            },
            ColumnConfig {
                name: "HOSTS".to_string(),
                json_path: ".spec.rules[*].host".to_string(),
            },
            ColumnConfig {
                name: "ADDRESS".to_string(),
                json_path: ".status.loadBalancer.ingress[0].ip".to_string(),
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_path: ".spec.tls".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "statefulsets" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_path: ".status.readyReplicas/.spec.replicas".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "daemonsets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_path: ".status.desiredNumberScheduled".to_string(),
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_path: ".status.currentNumberScheduled".to_string(),
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_path: ".status.numberReady".to_string(),
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_path: ".status.updatedNumberScheduled".to_string(),
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_path: ".status.numberAvailable".to_string(),
            },
            ColumnConfig {
                name: "NODE SELECTOR".to_string(),
                json_path: ".spec.template.spec.nodeSelector".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "replicasets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_path: ".spec.replicas".to_string(),
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_path: ".status.replicas".to_string(),
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_path: ".status.readyReplicas".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "jobs" => vec![
            ColumnConfig {
                name: "COMPLETIONS".to_string(),
                json_path: ".status.succeeded/.spec.completions".to_string(),
            },
            ColumnConfig {
                name: "DURATION".to_string(),
                json_path: ".status.completionTime".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "cronjobs" => vec![
            ColumnConfig {
                name: "SCHEDULE".to_string(),
                json_path: ".spec.schedule".to_string(),
            },
            ColumnConfig {
                name: "SUSPEND".to_string(),
                json_path: ".spec.suspend".to_string(),
            },
            ColumnConfig {
                name: "ACTIVE".to_string(),
                json_path: ".status.active".to_string(),
            },
            ColumnConfig {
                name: "LAST SCHEDULE".to_string(),
                json_path: ".status.lastScheduleTime".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "events" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_path: ".type".to_string(),
            },
            ColumnConfig {
                name: "REASON".to_string(),
                json_path: ".reason".to_string(),
            },
            ColumnConfig {
                name: "OBJECT".to_string(),
                json_path: ".involvedObject.name".to_string(),
            },
            ColumnConfig {
                name: "MESSAGE".to_string(),
                json_path: ".message".to_string(),
            },
        ],
        "serviceaccounts" => vec![
            ColumnConfig {
                name: "SECRETS".to_string(),
                json_path: ".secrets".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "roles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "rolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_path: ".roleRef.name".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "clusterroles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "clusterrolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_path: ".roleRef.name".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "horizontalpodautoscalers" => vec![
            ColumnConfig {
                name: "REFERENCE".to_string(),
                json_path: ".spec.scaleTargetRef.name".to_string(),
            },
            ColumnConfig {
                name: "TARGETS".to_string(),
                json_path: ".status.currentMetrics".to_string(),
            },
            ColumnConfig {
                name: "MINPODS".to_string(),
                json_path: ".spec.minReplicas".to_string(),
            },
            ColumnConfig {
                name: "MAXPODS".to_string(),
                json_path: ".spec.maxReplicas".to_string(),
            },
            ColumnConfig {
                name: "REPLICAS".to_string(),
                json_path: ".status.currentReplicas".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        "networkpolicies" => vec![
            ColumnConfig {
                name: "POD-SELECTOR".to_string(),
                json_path: ".spec.podSelector.matchLabels".to_string(),
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_path: ".metadata.creationTimestamp".to_string(),
            },
        ],
        _ => return None,
    };

    Some(ResourceColumnConfig { columns })
}

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
                json_path: ".metadata.creationTimestamp".to_string(),
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
            json_path: ".metadata.creationTimestamp".to_string(),
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
                json_path: ".metadata.creationTimestamp".to_string(),
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
                                json_path: col.json_path.clone(),
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
            json_path: ".metadata.creationTimestamp".to_string(),
        }],
    })
}

