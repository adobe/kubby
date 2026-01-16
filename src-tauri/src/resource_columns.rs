use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::{ColorRule, ColorState, ColumnConfig, ResourceColumnConfig};

// Macro to create a ColumnConfig with optional color rules
macro_rules! col {
    ($name:expr, $json_paths:expr) => {
        ColumnConfig {
            name: $name,
            json_paths: $json_paths,
            format: None,
            column_type: None,
            color_rules: None,
        }
    };
    ($name:expr, $json_paths:expr, $format:expr, $column_type:expr) => {
        ColumnConfig {
            name: $name,
            json_paths: $json_paths,
            format: $format,
            column_type: $column_type,
            color_rules: None,
        }
    };
    ($name:expr, $json_paths:expr, $format:expr, $column_type:expr, $color_rules:expr) => {
        ColumnConfig {
            name: $name,
            json_paths: $json_paths,
            format: $format,
            column_type: $column_type,
            color_rules: Some($color_rules),
        }
    };
}

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
        "containers" => vec![
            col!(
                "IMAGE".to_string(),
                vec!["$.image".to_string()]
            ),
            col!(
                "READY".to_string(),
                vec!["$.status.ready".to_string()],
                None,
                None,
                vec![
                    ColorRule {
                        expression: "{0} === true || {0} === 'true'".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "{0} === false || {0} === 'false' || {0} === '<none>'".to_string(),
                        color: ColorState::Danger,
                    },
                ]
            ),
            col!(
                "STATE".to_string(),
                vec![],
                None,
                Some(crate::ColumnType::ContainerState),
                vec![
                    ColorRule {
                        expression: "{0} === 'Running'".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "['Waiting', 'ContainerCreating', 'PodInitializing'].includes({0})"
                            .to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "['Error', 'CrashLoopBackOff', 'Terminated', 'OOMKilled'].includes({0})"
                            .to_string(),
                        color: ColorState::Danger,
                    },
                ]
            ),
            col!(
                "RESTARTS".to_string(),
                vec!["$.status.restartCount".to_string()],
                None,
                Some(crate::ColumnType::Number),
                vec![ColorRule {
                    expression: "0 < {0}".to_string(),
                    color: ColorState::Danger,
                }]
            ),
            col!(
                "CPU".to_string(),
                vec!["$metrics.cpu".to_string()],
                None,
                Some(crate::ColumnType::CpuValue)
            ),
            col!(
                "%CPU / REQ".to_string(),
                vec![
                    "$metrics.cpu_percent_requests".to_string(),
                    "$spec.cpu_requests".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::CpuValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "%CPU / LIM".to_string(),
                vec![
                    "$metrics.cpu_percent_limits".to_string(),
                    "$spec.cpu_limits".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::CpuValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "MEM".to_string(),
                vec!["$metrics.memory".to_string()],
                None,
                Some(crate::ColumnType::MemoryValue)
            ),
            col!(
                "%MEM / REQ".to_string(),
                vec![
                    "$metrics.memory_percent_requests".to_string(),
                    "$spec.memory_requests".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::MemoryValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "%MEM / LIM".to_string(),
                vec![
                    "$metrics.memory_percent_limits".to_string(),
                    "$spec.memory_limits".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::MemoryValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "PORTS".to_string(),
                vec!["$.ports[*].containerPort".to_string()]
            ),
        ],
        "pods" => vec![
            col!(
                "READY".to_string(),
                vec![
                    "$.status.containerStatuses[?(@.ready==true)]".to_string(),
                    "$.status.containerStatuses[*]".to_string(),
                ],
                Some("{0}/{1}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && ({1} === 0 || {1} === '<none>')".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "({0} === '<none>' || {0} === 0) && 0 < {1}".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} > 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} === {1} && {1} > 0".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "STATUS".to_string(),
                vec![],
                None,
                Some(crate::ColumnType::PodStatus),
                vec![
                    ColorRule {
                        expression: "['Running', 'Succeeded'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "['Unknown', 'Pending', 'PodScheduled', 'PodReadyToStartContainers', 'ContainersReady', 'ContainersNotReady', 'ContainerCreating', 'ContainerStatusUnknown', 'Completed', 'Initialized', 'Ready', 'DisruptionTarget', 'PodResizePending', 'PodResizeInProgress'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "['Error', 'Failed', 'CrashLoopBackOff'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Danger,
                    },
                ]
            ),
            col!(
                "RESTARTS".to_string(),
                vec!["$.status.containerStatuses[*].restartCount".to_string()],
                None,
                Some(crate::ColumnType::Number),
                vec![
                    ColorRule {
                        expression: "0 < {0}".to_string(),
                        color: ColorState::Danger,
                    },
                ]
            ),
            col!(
                "PORTS".to_string(),
                vec!["$.spec.containers[*].ports[*].containerPort".to_string()]
            ),
            col!(
                "CPU".to_string(),
                vec!["$metrics.cpu".to_string()],
                None,
                Some(crate::ColumnType::CpuValue)
            ),
            col!(
                "%CPU / REQ".to_string(),
                vec![
                    "$metrics.cpu_percent_requests".to_string(),
                    "$spec.cpu_requests".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::CpuValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "%CPU / LIM".to_string(),
                vec![
                    "$metrics.cpu_percent_limits".to_string(),
                    "$spec.cpu_limits".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::CpuValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "MEM".to_string(),
                vec!["$metrics.memory".to_string()],
                None,
                Some(crate::ColumnType::MemoryValue)
            ),
            col!(
                "%MEM / REQ".to_string(),
                vec![
                    "$metrics.memory_percent_requests".to_string(),
                    "$spec.memory_requests".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::MemoryValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "%MEM / LIM".to_string(),
                vec![
                    "$metrics.memory_percent_limits".to_string(),
                    "$spec.memory_limits".to_string(),
                ],
                Some("{0}% / {1}".to_string()),
                Some(crate::ColumnType::MemoryValue),
                vec![
                    ColorRule {
                        expression: "{0} >= 90".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= 70".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} < 70".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "deployments" => vec![
            col!(
                "READY".to_string(),
                vec!["$.status.readyReplicas".to_string(), "$.spec.replicas".to_string()],
                Some("{0}/{1}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{0} === 0 && {1} > 0".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} === {1}".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "UP-TO-DATE".to_string(),
                vec![
                    "$.status.updatedReplicas".to_string(),
                    "$.spec.replicas".to_string(), // only used in color conditions
                ],
                Some("{0}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{1} !== 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                ]
            ),
            col!(
                "AVAILABLE".to_string(),
                vec![
                    "$.status.availableReplicas".to_string(),
                    "$.spec.replicas".to_string(), // only used in color conditions
                ],
                Some("{0}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{1} !== 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                ]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "services" => vec![
            col!(
                "TYPE".to_string(),
                vec!["$.spec.type".to_string()]
            ),
            col!(
                "CLUSTER-IP".to_string(),
                vec!["$.spec.clusterIP".to_string()]
            ),
            col!(
                "EXTERNAL-IP".to_string(),
                vec!["$.status.loadBalancer.ingress[*].ip".to_string()],
                None,
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]
            ),
            col!(
                "PORTS".to_string(),
                vec!["$.spec.ports[*].port".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "configmaps" => vec![
            col!(
                "DATA".to_string(),
                vec!["$.data".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "secrets" => vec![
            col!(
                "TYPE".to_string(),
                vec!["$.type".to_string()]
            ),
            col!(
                "DATA".to_string(),
                vec!["$.data".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "nodes" => vec![
            col!(
                "STATUS".to_string(),
                vec!["$.status.conditions[-1:].type".to_string()]
            ),
            col!(
                "ROLES".to_string(),
                vec!["$.metadata.labels".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
            col!(
                "VERSION".to_string(),
                vec!["$.status.nodeInfo.kubeletVersion".to_string()]
            ),
        ],
        "namespaces" => vec![
            col!(
                "STATUS".to_string(),
                vec!["$.status.phase".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "persistentvolumeclaims" => vec![
            col!(
                "STATUS".to_string(),
                vec!["$.status.phase".to_string()]
            ),
            col!(
                "VOLUME".to_string(),
                vec!["$.spec.volumeName".to_string()]
            ),
            col!(
                "CAPACITY".to_string(),
                vec!["$.status.capacity.storage".to_string()]
            ),
            col!(
                "ACCESS MODES".to_string(),
                vec!["$.status.accessModes[*]".to_string()]
            ),
            col!(
                "STORAGECLASS".to_string(),
                vec!["$.spec.storageClassName".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "persistentvolumes" => vec![
            col!(
                "CAPACITY".to_string(),
                vec!["$.spec.capacity.storage".to_string()]
            ),
            col!(
                "ACCESS MODES".to_string(),
                vec!["$.spec.accessModes[*]".to_string()]
            ),
            col!(
                "RECLAIM POLICY".to_string(),
                vec!["$.spec.persistentVolumeReclaimPolicy".to_string()]
            ),
            col!(
                "STATUS".to_string(),
                vec!["$.status.phase".to_string()]
            ),
            col!(
                "CLAIM".to_string(),
                vec!["$.spec.claimRef.name".to_string()]
            ),
            col!(
                "STORAGECLASS".to_string(),
                vec!["$.spec.storageClassName".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "ingresses" => vec![
            col!(
                "CLASS".to_string(),
                vec!["$.spec.ingressClassName".to_string()]
            ),
            col!(
                "HOSTS".to_string(),
                vec!["$.spec.rules[*].host".to_string()]
            ),
            col!(
                "ADDRESS".to_string(),
                vec!["$.status.loadBalancer.ingress[*].ip".to_string()]
            ),
            col!(
                "PORTS".to_string(),
                vec!["$.spec.rules[*].http.paths[*].backend.service.port.number".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "statefulsets" => vec![
            col!(
                "READY".to_string(),
                vec!["$.status.readyReplicas".to_string(), "$.spec.replicas".to_string()],
                Some("{0}/{1}".to_string()),
                None
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "daemonsets" => vec![
            col!(
                "DESIRED".to_string(),
                vec!["$.status.desiredNumberScheduled".to_string()]
            ),
            col!(
                "CURRENT".to_string(),
                vec!["$.status.currentNumberScheduled".to_string()]
            ),
            col!(
                "READY".to_string(),
                vec!["$.status.numberReady".to_string()]
            ),
            col!(
                "UP-TO-DATE".to_string(),
                vec!["$.status.updatedNumberScheduled".to_string()]
            ),
            col!(
                "AVAILABLE".to_string(),
                vec!["$.status.numberAvailable".to_string()]
            ),
            col!(
                "NODE SELECTOR".to_string(),
                vec!["$.spec.template.spec.nodeSelector".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "replicasets" => vec![
            col!(
                "DESIRED".to_string(),
                vec!["$.spec.replicas".to_string()]
            ),
            col!(
                "CURRENT".to_string(),
                vec![
                    "$.status.replicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                Some("{0}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{0} === 0 && {1} > 0".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                ]
            ),
            col!(
                "READY".to_string(),
                vec![
                    "$.status.readyReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                Some("{0}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "({0} === '<none>' || {0} === 0) && {1} > 0".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} > 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} === {1} && {1} > 0".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "jobs" => vec![
            col!(
                "COMPLETIONS".to_string(),
                vec!["$.status.succeeded".to_string(), "$.spec.completions".to_string()],
                Some("{0}/{1}".to_string()),
                None
            ),
            col!(
                "DURATION".to_string(),
                vec!["$.status.completionTime".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "cronjobs" => vec![
            col!(
                "SCHEDULE".to_string(),
                vec!["$.spec.schedule".to_string()]
            ),
            col!(
                "SUSPEND".to_string(),
                vec!["$.spec.suspend".to_string()],
                None,
                Some(crate::ColumnType::Bool)
            ),
            col!(
                "ACTIVE".to_string(),
                vec!["$.status.active".to_string()]
            ),
            col!(
                "LAST SCHEDULE".to_string(),
                vec!["$.status.lastScheduleTime".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "events" => vec![
            col!(
                "TYPE".to_string(),
                vec!["$.type".to_string()]
            ),
            col!(
                "REASON".to_string(),
                vec!["$.reason".to_string()]
            ),
            col!(
                "OBJECT".to_string(),
                vec!["$.involvedObject.name".to_string()]
            ),
            col!(
                "MESSAGE".to_string(),
                vec!["$.message".to_string()]
            ),
        ],
        "serviceaccounts" => vec![
            col!(
                "SECRETS".to_string(),
                vec!["$.secrets".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "roles" => vec![
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "rolebindings" => vec![
            col!(
                "ROLE".to_string(),
                vec!["$.roleRef.name".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "clusterroles" => vec![
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "clusterrolebindings" => vec![
            col!(
                "ROLE".to_string(),
                vec!["$.roleRef.name".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "horizontalpodautoscalers" => vec![
            col!(
                "REFERENCE".to_string(),
                vec!["$.spec.scaleTargetRef.name".to_string()]
            ),
            col!(
                "TARGETS".to_string(),
                vec!["$.status.currentMetrics".to_string()]
            ),
            col!(
                "MINPODS".to_string(),
                vec!["$.spec.minReplicas".to_string()]
            ),
            col!(
                "MAXPODS".to_string(),
                vec!["$.spec.maxReplicas".to_string()]
            ),
            col!(
                "REPLICAS".to_string(),
                vec![
                    "$.status.currentReplicas".to_string(),
                    "$.spec.minReplicas".to_string(),
                    "$.spec.maxReplicas".to_string(),
                    "$.status.desiredReplicas".to_string(),
                ],
                Some("{0}".to_string()),
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' || {0} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{0} < {1}".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} === {2}".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} !== {3}".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} === {3} && {0} >= {1} && {0} < {2}".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "poddisruptionbudgets" => vec![
            col!(
                "MIN AVAILABLE".to_string(),
                vec!["$.spec.minAvailable".to_string()],
                None,
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]
            ),
            col!(
                "MAX UNAVAILABLE".to_string(),
                vec!["$.spec.maxUnavailable".to_string()],
                None,
                None,
                vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]
            ),
            col!(
                "ALLOWED DISRUPTIONS".to_string(),
                vec![
                    "$.status.disruptionsAllowed".to_string(),
                    "$.status.expectedPods".to_string(),
                ],
                Some("{0}".to_string()),
                Some(crate::ColumnType::Number),
                vec![
                    ColorRule {
                        expression: "{0} === 0 && {1} > 0".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} > 0".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "CURRENT".to_string(),
                vec![
                    "$.status.currentHealthy".to_string(),
                    "$.status.desiredHealthy".to_string(),
                ],
                Some("{0}".to_string()),
                Some(crate::ColumnType::Number),
                vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{0} < {1}".to_string(),
                        color: ColorState::Danger,
                    },
                    ColorRule {
                        expression: "{0} >= {1} && {1} > 0".to_string(),
                        color: ColorState::Success,
                    },
                ]
            ),
            col!(
                "DESIRED".to_string(),
                vec!["$.status.desiredHealthy".to_string()],
                None,
                Some(crate::ColumnType::Number)
            ),
            col!(
                "EXPECTED".to_string(),
                vec!["$.status.expectedPods".to_string()],
                None,
                Some(crate::ColumnType::Number)
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
        ],
        "networkpolicies" => vec![
            col!(
                "POD-SELECTOR".to_string(),
                vec!["$.spec.podSelector.matchLabels".to_string()]
            ),
            col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            ),
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
            columns: vec![col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            )],
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let crd_list: Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse CRD list: {}", e))?;

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
                            if let Some(crd_name) = crd_item
                                .get("metadata")
                                .and_then(|m| m.get("name"))
                                .and_then(|n| n.as_str())
                            {
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
        columns: vec![col!(
            "AGE".to_string(),
            vec!["$.metadata.creationTimestamp".to_string()],
            None,
            Some(crate::ColumnType::Duration)
        )],
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
            columns: vec![col!(
                "AGE".to_string(),
                vec!["$.metadata.creationTimestamp".to_string()],
                None,
                Some(crate::ColumnType::Duration)
            )],
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let crd: CRDResponse =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse CRD: {}", e))?;

    // Get the latest version's additionalPrinterColumns
    if let Some(spec) = crd.spec {
        if let Some(versions) = spec.versions {
            // Use the latest version (usually the last one)
            if let Some(latest_version) = versions.last() {
                if let Some(columns) = &latest_version.additional_printer_columns {
                    if !columns.is_empty() {
                        let config_columns: Vec<ColumnConfig> = columns
                            .iter()
                            .map(|col| col!(col.name.clone(), vec![col.json_path.clone()]))
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
        columns: vec![col!(
            "AGE".to_string(),
            vec!["$.metadata.creationTimestamp".to_string()],
            None,
            Some(crate::ColumnType::Duration)
        )],
    })
}
