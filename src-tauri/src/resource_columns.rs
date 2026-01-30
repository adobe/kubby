use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::kubectl;
use crate::types::{ColorRule, ColorState, ColumnAlign, ColumnConfig, ColumnType, ResourceColumnConfig};

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
            ColumnConfig {
                name: "IMAGE".to_string(),
                json_paths: vec!["$.image".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.ready".to_string()],
                format: None,
                column_type: None,
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === true || {0} === 'true'".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "{0} === false || {0} === 'false' || {0} === '<none>'".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "STATE".to_string(),
                json_paths: vec![],
                format: None,
                column_type: Some(ColumnType::ContainerState),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === 'Running'".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "['Waiting', 'ContainerCreating', 'PodInitializing'].includes({0})".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "['Error', 'CrashLoopBackOff', 'Terminated', 'OOMKilled'].includes({0})".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "RESTARTS".to_string(),
                json_paths: vec!["$.status.restartCount".to_string()],
                format: None,
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "0 < {0}".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "CPU".to_string(),
                json_paths: vec!["$metrics.cpu".to_string()],
                format: None,
                column_type: Some(ColumnType::CpuValue),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%CPU / REQ".to_string(),
                json_paths: vec![
                    "$metrics.cpu_percent_requests".to_string(),
                    "$spec.cpu_requests".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::CpuValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%CPU / LIM".to_string(),
                json_paths: vec![
                    "$metrics.cpu_percent_limits".to_string(),
                    "$spec.cpu_limits".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::CpuValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "MEM".to_string(),
                json_paths: vec!["$metrics.memory".to_string()],
                format: None,
                column_type: Some(ColumnType::MemoryValue),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%MEM / REQ".to_string(),
                json_paths: vec![
                    "$metrics.memory_percent_requests".to_string(),
                    "$spec.memory_requests".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::MemoryValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%MEM / LIM".to_string(),
                json_paths: vec![
                    "$metrics.memory_percent_limits".to_string(),
                    "$spec.memory_limits".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::MemoryValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_paths: vec!["$.ports[*].containerPort".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
        ],
        "pods" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec![
                    "$.status.containerStatuses[?(@.ready==true)]".to_string(),
                    "$.status.containerStatuses[*]".to_string(),
                ],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec![],
                format: None,
                column_type: Some(ColumnType::PodStatus),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === 'Terminating'".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "['Running', 'Succeeded'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "['Unknown', 'Pending', 'PodScheduled', 'PodReadyToStartContainers', 'ContainersReady', 'ContainersNotReady', 'ContainerCreating', 'ContainerStatusUnknown', 'Completed', 'Initialized', 'Ready', 'DisruptionTarget', 'PodResizePending', 'PodResizeInProgress', 'ImagePullBackOff', 'ErrImagePull'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "['Error', 'Failed', 'CrashLoopBackOff'].some(status => {0}.includes(status))".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "RESTARTS".to_string(),
                json_paths: vec!["$.status.containerStatuses[*].restartCount".to_string()],
                format: None,
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "0 < {0}".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_paths: vec!["$.spec.containers[*].ports[*].containerPort".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CPU".to_string(),
                json_paths: vec!["$metrics.cpu".to_string()],
                format: None,
                column_type: Some(ColumnType::CpuValue),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%CPU / REQ".to_string(),
                json_paths: vec![
                    "$metrics.cpu_percent_requests".to_string(),
                    "$spec.cpu_requests".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::CpuValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%CPU / LIM".to_string(),
                json_paths: vec![
                    "$metrics.cpu_percent_limits".to_string(),
                    "$spec.cpu_limits".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::CpuValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "MEM".to_string(),
                json_paths: vec!["$metrics.memory".to_string()],
                format: None,
                column_type: Some(ColumnType::MemoryValue),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%MEM / REQ".to_string(),
                json_paths: vec![
                    "$metrics.memory_percent_requests".to_string(),
                    "$spec.memory_requests".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::MemoryValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "%MEM / LIM".to_string(),
                json_paths: vec![
                    "$metrics.memory_percent_limits".to_string(),
                    "$spec.memory_limits".to_string(),
                ],
                format: Some("{0}% / {1}".to_string()),
                column_type: Some(ColumnType::MemoryValue),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "deployments" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec![
                    "$.status.readyReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}/{1}".to_string()),
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_paths: vec![
                    "$.status.updatedReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{1} !== 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_paths: vec![
                    "$.status.availableReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === '<none>' && {1} === 0".to_string(),
                        color: ColorState::Muted,
                    },
                    ColorRule {
                        expression: "{1} !== 0 && {0} < {1}".to_string(),
                        color: ColorState::Attention,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "services" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.spec.type".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CLUSTER-IP".to_string(),
                json_paths: vec!["$.spec.clusterIP".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "EXTERNAL-IP".to_string(),
                json_paths: vec!["$.status.loadBalancer.ingress[*].ip".to_string()],
                format: None,
                column_type: None,
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_paths: vec!["$.spec.ports[*].port".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "configmaps" => vec![
            ColumnConfig {
                name: "DATA".to_string(),
                json_paths: vec!["$.data".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "secrets" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.type".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "DATA".to_string(),
                json_paths: vec!["$.data".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "nodes" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.conditions[-1:].type".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "ROLES".to_string(),
                json_paths: vec!["$.metadata.labels".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "VERSION".to_string(),
                json_paths: vec!["$.status.nodeInfo.kubeletVersion".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
        ],
        "namespaces" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "persistentvolumeclaims" => vec![
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "VOLUME".to_string(),
                json_paths: vec!["$.spec.volumeName".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_paths: vec!["$.status.capacity.storage".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_paths: vec!["$.status.accessModes[*]".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_paths: vec!["$.spec.storageClassName".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "persistentvolumes" => vec![
            ColumnConfig {
                name: "CAPACITY".to_string(),
                json_paths: vec!["$.spec.capacity.storage".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "ACCESS MODES".to_string(),
                json_paths: vec!["$.spec.accessModes[*]".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "RECLAIM POLICY".to_string(),
                json_paths: vec!["$.spec.persistentVolumeReclaimPolicy".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "STATUS".to_string(),
                json_paths: vec!["$.status.phase".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CLAIM".to_string(),
                json_paths: vec!["$.spec.claimRef.name".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "STORAGECLASS".to_string(),
                json_paths: vec!["$.spec.storageClassName".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "ingresses" => vec![
            ColumnConfig {
                name: "CLASS".to_string(),
                json_paths: vec!["$.spec.ingressClassName".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "HOSTS".to_string(),
                json_paths: vec!["$.spec.rules[*].host".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "ADDRESS".to_string(),
                json_paths: vec!["$.status.loadBalancer.ingress[*].ip".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "PORTS".to_string(),
                json_paths: vec!["$.spec.rules[*].http.paths[*].backend.service.port.number".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "statefulsets" => vec![
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec![
                    "$.status.readyReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "daemonsets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_paths: vec!["$.status.desiredNumberScheduled".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_paths: vec!["$.status.currentNumberScheduled".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec!["$.status.numberReady".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "UP-TO-DATE".to_string(),
                json_paths: vec!["$.status.updatedNumberScheduled".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AVAILABLE".to_string(),
                json_paths: vec!["$.status.numberAvailable".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "NODE SELECTOR".to_string(),
                json_paths: vec!["$.spec.template.spec.nodeSelector".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "replicasets" => vec![
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_paths: vec!["$.spec.replicas".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_paths: vec![
                    "$.status.replicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: None,
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "READY".to_string(),
                json_paths: vec![
                    "$.status.readyReplicas".to_string(),
                    "$.spec.replicas".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: None,
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "jobs" => vec![
            ColumnConfig {
                name: "COMPLETIONS".to_string(),
                json_paths: vec![
                    "$.status.succeeded".to_string(),
                    "$.spec.completions".to_string(),
                ],
                format: Some("{0}/{1}".to_string()),
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "DURATION".to_string(),
                json_paths: vec!["$.status.completionTime".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "cronjobs" => vec![
            ColumnConfig {
                name: "SCHEDULE".to_string(),
                json_paths: vec!["$.spec.schedule".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "SUSPEND".to_string(),
                json_paths: vec!["$.spec.suspend".to_string()],
                format: None,
                column_type: Some(ColumnType::Bool),
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "ACTIVE".to_string(),
                json_paths: vec!["$.status.active".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "LAST SCHEDULE".to_string(),
                json_paths: vec!["$.status.lastScheduleTime".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "events" => vec![
            ColumnConfig {
                name: "TYPE".to_string(),
                json_paths: vec!["$.type".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "REASON".to_string(),
                json_paths: vec!["$.reason".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "OBJECT".to_string(),
                json_paths: vec!["$.involvedObject.name".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "MESSAGE".to_string(),
                json_paths: vec!["$.message".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
        ],
        "serviceaccounts" => vec![
            ColumnConfig {
                name: "SECRETS".to_string(),
                json_paths: vec!["$.secrets".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "roles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "rolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_paths: vec!["$.roleRef.name".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "clusterroles" => vec![
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "clusterrolebindings" => vec![
            ColumnConfig {
                name: "ROLE".to_string(),
                json_paths: vec!["$.roleRef.name".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "horizontalpodautoscalers" => vec![
            ColumnConfig {
                name: "REFERENCE".to_string(),
                json_paths: vec!["$.spec.scaleTargetRef.name".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "TARGETS".to_string(),
                json_paths: vec!["$.status.currentMetrics".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "MINPODS".to_string(),
                json_paths: vec!["$.spec.minReplicas".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "MAXPODS".to_string(),
                json_paths: vec!["$.spec.maxReplicas".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "REPLICAS".to_string(),
                json_paths: vec![
                    "$.status.currentReplicas".to_string(),
                    "$.spec.minReplicas".to_string(),
                    "$.spec.maxReplicas".to_string(),
                    "$.status.desiredReplicas".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: None,
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "poddisruptionbudgets" => vec![
            ColumnConfig {
                name: "MIN AVAILABLE".to_string(),
                json_paths: vec!["$.spec.minAvailable".to_string()],
                format: None,
                column_type: None,
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "MAX UNAVAILABLE".to_string(),
                json_paths: vec!["$.spec.maxUnavailable".to_string()],
                format: None,
                column_type: None,
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === '<none>'".to_string(),
                        color: ColorState::Muted,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "ALLOWED DISRUPTIONS".to_string(),
                json_paths: vec![
                    "$.status.disruptionsAllowed".to_string(),
                    "$.status.expectedPods".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === 0 && {1} > 0".to_string(),
                        color: ColorState::Attention,
                    },
                    ColorRule {
                        expression: "{0} > 0".to_string(),
                        color: ColorState::Success,
                    },
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "CURRENT".to_string(),
                json_paths: vec![
                    "$.status.currentHealthy".to_string(),
                    "$.status.desiredHealthy".to_string(),
                ],
                format: Some("{0}".to_string()),
                column_type: Some(ColumnType::Number),
                color_rules: Some(vec![
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
                ]),
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "DESIRED".to_string(),
                json_paths: vec!["$.status.desiredHealthy".to_string()],
                format: None,
                column_type: Some(ColumnType::Number),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "EXPECTED".to_string(),
                json_paths: vec!["$.status.expectedPods".to_string()],
                format: None,
                column_type: Some(ColumnType::Number),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "networkpolicies" => vec![
            ColumnConfig {
                name: "POD-SELECTOR".to_string(),
                json_paths: vec!["$.spec.podSelector.matchLabels".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
        ],
        "vaultsecrets" => vec![
            ColumnConfig {
                name: "SUCCEEDED".to_string(),
                json_paths: vec!["$.status.conditions[0].status".to_string()],
                format: None,
                column_type: None,
                color_rules: Some(vec![
                    ColorRule {
                        expression: "{0} === true || {0} === 'true' || {0} === 'True'".to_string(),
                        color: ColorState::Success,
                    },
                    ColorRule {
                        expression: "{0} === false || {0} === 'false' || {0} === 'False'".to_string(),
                        color: ColorState::Danger,
                    },
                ]),
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "REASON".to_string(),
                json_paths: vec!["$.status.conditions[0].reason".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "MESSAGE".to_string(),
                json_paths: vec!["$.status.conditions[0].message".to_string()],
                format: None,
                column_type: None,
                color_rules: None,
                align: ColumnAlign::Start,
            },
            ColumnConfig {
                name: "LAST TRANSITION".to_string(),
                json_paths: vec!["$.status.conditions[0].lastTransitionTime".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
            },
            ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::End,
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

    let output = kubectl::sync_command()
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
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::Start,
            }],
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
        columns: vec![ColumnConfig {
            name: "AGE".to_string(),
            json_paths: vec!["$.metadata.creationTimestamp".to_string()],
            format: None,
            column_type: Some(ColumnType::Duration),
            color_rules: None,
            align: ColumnAlign::Start,
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

    let output = kubectl::sync_command()
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if !output.status.success() {
        return Ok(ResourceColumnConfig {
            columns: vec![ColumnConfig {
                name: "AGE".to_string(),
                json_paths: vec!["$.metadata.creationTimestamp".to_string()],
                format: None,
                column_type: Some(ColumnType::Duration),
                color_rules: None,
                align: ColumnAlign::Start,
            }],
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
                            .map(|col| ColumnConfig {
                                name: col.name.clone(),
                                json_paths: vec![col.json_path.clone()],
                                format: None,
                                column_type: None,
                                color_rules: None,
                                align: ColumnAlign::Start,
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
            column_type: Some(ColumnType::Duration),
            color_rules: None,
            align: ColumnAlign::Start,
        }],
    })
}
