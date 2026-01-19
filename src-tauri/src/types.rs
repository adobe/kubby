use serde::{Deserialize, Serialize};

/// Label selector for filtering resources
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelSelector {
    pub key: String,
    pub value: String,
}

/// Spec filter for filtering by JSON path (e.g., involvedObject.name for events)
/// The backend decides whether to use field selectors or post-fetch filtering
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpecFilter {
    /// JSON path to filter by (e.g., "involvedObject.name", "spec.scaleTargetRef.name")
    pub path: String,
    /// Value to match
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
    PodStatus,
    ContainerState,
    CpuValue,      // Normalizes CPU values to readable format (millicores/cores)
    MemoryValue,   // Normalizes memory values to readable format (Ki/Mi/Gi)
}

impl Default for ColumnType {
    fn default() -> Self {
        ColumnType::Text
    }
}

/// Color state for column highlighting (maps to theme CSS variables)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ColorState {
    Attention,  // Maps to --fgColor-attention (#d29922)
    Danger,     // Maps to --fgColor-danger (#f85149)
    Default,    // Maps to --fgColor-default (#f0f6fc)
    Disabled,   // Maps to --fgColor-disabled (#656c76)
    Done,       // Maps to --fgColor-done (#ab7df8)
    Muted,      // Maps to --fgColor-muted (#9198a1)
    Neutral,    // Maps to --fgColor-neutral (#9198a1)
    Severe,     // Maps to --fgColor-severe (#db6d28)
    Success,    // Maps to --fgColor-success (#3fb950)
}

/// Color rule: if expression evaluates to true, apply color state
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColorRule {
    /// JavaScript expression using placeholders {0}, {1}, etc.
    /// Example: "{0} === 0 && {1} > 0"
    pub expression: String,
    /// Color state to apply
    pub color: ColorState,
}

/// Frontend-facing column config
#[derive(Debug, Serialize, Clone)]
pub struct ColumnConfig {
    pub name: String,
    #[serde(rename = "jsonPaths")]
    pub json_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub column_type: Option<ColumnType>,
    #[serde(rename = "colorRules", skip_serializing_if = "Option::is_none", default)]
    pub color_rules: Option<Vec<ColorRule>>,
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
    /// Raw values for each column (before formatting) for color evaluation
    #[serde(rename = "rawValues")]
    pub raw_values: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct ResourceListResponse {
    pub columns: Vec<ColumnConfig>,
    pub items: Vec<ResourceItem>,
    #[serde(rename = "evaluationError", skip_serializing_if = "Option::is_none")]
    pub evaluation_error: Option<String>,
}
