use serde::{Deserialize, Serialize};

/// Timeout for kubectl commands in seconds
pub const KUBECTL_TIMEOUT_SECS: u64 = 10;

/// Timeout for kubectl delete commands in seconds (longer because delete can take time)
pub const KUBECTL_DELETE_TIMEOUT_SECS: u64 = 30;

/// Label selector for filtering resources
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelSelector {
    pub key: String,
    pub value: String,
}

/// Column type for formatting
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ColumnType {
    Text,
    Number,
    Bool,
    Datetime,
    Duration,
    #[serde(rename = "podstatus")]
    PodStatus,
}

impl Default for ColumnType {
    fn default() -> Self {
        ColumnType::Text
    }
}

/// Frontend-facing column config
#[derive(Debug, Serialize)]
pub struct ColumnConfig {
    pub name: String,
    #[serde(rename = "jsonPaths")]
    pub json_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub column_type: Option<ColumnType>,
}

#[derive(Debug, Serialize)]
pub struct ResourceColumnConfig {
    pub columns: Vec<ColumnConfig>,
}

/// Response type for get_resources command
#[derive(Debug, Serialize)]
pub struct ResourceItem {
    pub name: String,
    #[serde(flatten)]
    pub columns: std::collections::HashMap<String, String>,
    pub labels: Vec<LabelSelector>,
}

#[derive(Debug, Serialize)]
pub struct ResourceListResponse {
    pub columns: Vec<ColumnConfig>,
    pub items: Vec<ResourceItem>,
    #[serde(rename = "evaluationError", skip_serializing_if = "Option::is_none")]
    pub evaluation_error: Option<String>,
}
