use tokio::process::Command;
use tokio::time::{timeout, Duration};

use serde_json::Value;
use serde_json_path::JsonPath;

const KUBECTL_TIMEOUT_SECS: u64 = 5;

use crate::{ResourceColumnConfig, ResourceItem, ResourceListResponse, LabelSelector, ColumnType, ColumnConfig};
use crate::resource_columns;

fn format_age(timestamp: &str) -> String {
    if timestamp.is_empty() || timestamp == "<none>" || timestamp == "<unknown>" {
        return "<unknown>".to_string();
    }
    
    // Parse the timestamp as RFC3339 (standard Kubernetes format)
    let created = match chrono::DateTime::parse_from_rfc3339(timestamp) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => {
            // If RFC3339 parsing fails, try parsing as ISO8601 without timezone
            // Kubernetes sometimes returns timestamps without timezone info
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%dT%H:%M:%S") {
                chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc)
            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%dT%H:%M:%S%.f") {
                chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc)
            } else {
                return "<unknown>".to_string();
            }
        }
    };
    
    let now = chrono::Utc::now();
    let diff = now.signed_duration_since(created);
    
    let total_seconds = diff.num_seconds();
    if total_seconds < 0 {
        return "<unknown>".to_string();
    }
    
    let days = total_seconds / 86400;
    let hours = (total_seconds % 86400) / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    
    if days > 0 {
        format!("{}d", days)
    } else if hours > 0 {
        format!("{}h", hours)
    } else if minutes > 0 {
        format!("{}m", minutes)
    } else {
        format!("{}s", seconds)
    }
}

// Format a single value according to its type
fn format_value_by_type(value: &Value, column_type: &ColumnType) -> String {
    match column_type {
        ColumnType::Duration => {
            // Parse as datetime and format as relative age
            if let Some(timestamp) = value.as_str() {
                format_age(timestamp)
            } else {
                "<none>".to_string()
            }
        }
        ColumnType::Datetime => {
            // Render as RFC3339 datetime string
            if let Some(s) = value.as_str() {
                s.to_string()
            } else {
                "<none>".to_string()
            }
        }
        ColumnType::Bool => {
            if let Some(b) = value.as_bool() {
                if b { "True".to_string() } else { "False".to_string() }
            } else {
                "<none>".to_string()
            }
        }
        ColumnType::Number => {
            if let Some(n) = value.as_f64() {
                // Format as integer if it's a whole number
                if n.fract() == 0.0 {
                    (n as i64).to_string()
                } else {
                    n.to_string()
                }
            } else if let Some(n) = value.as_i64() {
                n.to_string()
            } else if let Some(n) = value.as_u64() {
                n.to_string()
            } else {
                "<none>".to_string()
            }
        }
        ColumnType::Text => {
            if value.is_null() {
                "<none>".to_string()
            } else if let Some(s) = value.as_str() {
                s.to_string()
            } else if value.is_array() {
                value.as_array().unwrap().len().to_string()
            } else if value.is_object() {
                value.as_object().unwrap().len().to_string()
            } else {
                value.to_string().trim_matches('"').to_string()
            }
        }
    }
}

// Evaluate a single JSONPath expression and return formatted string
fn evaluate_jsonpath(item: &Value, json_path: &str, column_type: &ColumnType) -> Result<String, String> {
    // Parse the JSONPath expression
    let path = JsonPath::parse(json_path)
        .map_err(|e| format!("Invalid JSONPath '{}': {}", json_path, e))?;
    
    // Query the item
    let nodes = path.query(item).all();
    
    // Format based on number of matches
    if nodes.is_empty() {
        Ok("<none>".to_string())
    } else {
        // Check if we're selecting objects/arrays vs primitives
        let first_is_primitive = nodes[0].is_null() 
            || nodes[0].is_boolean() 
            || nodes[0].is_number() 
            || nodes[0].is_string();
        
        if !first_is_primitive {
            // Selecting objects/arrays → COUNT them (e.g., containers, pods)
            // This applies to both single and multiple matches
            Ok(nodes.len().to_string())
        } else if nodes.len() == 1 {
            // Single primitive value - format it
            Ok(format_value_by_type(nodes[0], column_type))
        } else if matches!(column_type, ColumnType::Number) {
            // Selecting primitive numbers → SUM them (e.g., restart counts)
            let sum: f64 = nodes
                .iter()
                .filter_map(|node| node.as_f64())
                .sum();
            // Format as integer if it's a whole number
            if sum.fract() == 0.0 {
                Ok((sum as i64).to_string())
            } else {
                Ok(sum.to_string())
            }
        } else {
            // Selecting other primitives → JOIN them (e.g., ports, IPs, hostnames)
            let formatted: Vec<String> = nodes
                .iter()
                .map(|node| format_value_by_type(node, column_type))
                .collect();
            Ok(formatted.join(","))
        }
    }
}

// Evaluate column config and format the result
fn evaluate_column(item: &Value, config: &ColumnConfig) -> Result<String, String> {
    let column_type = config.column_type.as_ref().unwrap_or(&ColumnType::Text);
    
    // Evaluate each JSONPath
    let mut results: Vec<String> = Vec::new();
    for json_path in &config.json_paths {
        let result = evaluate_jsonpath(item, json_path, column_type)?;
        results.push(result);
    }
    
    // Apply format if present
    if let Some(format_str) = &config.format {
        // Simple placeholder substitution: {0}, {1}, etc.
        let mut formatted = format_str.clone();
        for (i, result) in results.iter().enumerate() {
            formatted = formatted.replace(&format!("{{{}}}", i), result);
        }
        
        // Check if any placeholders remain (out of bounds)
        if formatted.contains('{') && formatted.contains('}') {
            return Err(format!("Format string references missing index"));
        }
        
        Ok(formatted)
    } else {
        // No format: join with space
        Ok(results.join(" "))
    }
}

fn parse_kubectl_json(
    stdout: &str,
    config: &ResourceColumnConfig,
    _resource_type: &str,
) -> Result<(Vec<ResourceItem>, Option<String>), String> {
    let data: Value = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse kubectl JSON output: {}", e))?;
    
    let items: Vec<&Value> = match data.get("items") {
        Some(Value::Array(arr)) => arr.iter().collect(),
        _ => vec![&data],
    };
    
    // Pre-validate all column configs to detect errors early
    let mut validation_error: Option<String> = None;
    for col in &config.columns {
        // Validate each JSONPath can be parsed
        for json_path in &col.json_paths {
            if let Err(e) = JsonPath::parse(json_path) {
                validation_error = Some(format!("Column '{}': invalid JSONPath '{}': {}", col.name, json_path, e));
                break;
            }
        }
        
        // Validate format string if present
        if let Some(format_str) = &col.format {
            // Find max placeholder index
            let mut max_index = 0;
            let mut i = 0;
            let chars: Vec<char> = format_str.chars().collect();
            while i < chars.len() {
                if chars[i] == '{' && i + 1 < chars.len() {
                    let mut j = i + 1;
                    while j < chars.len() && chars[j].is_ascii_digit() {
                        j += 1;
                    }
                    if j < chars.len() && chars[j] == '}' {
                        if let Ok(idx) = chars[i+1..j].iter().collect::<String>().parse::<usize>() {
                            max_index = max_index.max(idx);
                        }
                    }
                    i = j;
                } else {
                    i += 1;
                }
            }
            
            if max_index >= col.json_paths.len() {
                validation_error = Some(format!("Column '{}': format references {{{}}} but only {} jsonPaths provided", 
                    col.name, max_index, col.json_paths.len()));
                break;
            }
        }
        
        if validation_error.is_some() {
            break;
        }
    }
    
    let mut result = Vec::new();
    
    for item in items {
        let name = item.get("metadata")
            .and_then(|m| m.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("<unknown>")
            .to_string();
        
        // Extract labels from metadata
        let labels: Vec<LabelSelector> = item.get("metadata")
            .and_then(|m| m.get("labels"))
            .and_then(|l| l.as_object())
            .map(|obj| {
                obj.iter()
                    .map(|(k, v)| LabelSelector {
                        key: k.clone(),
                        value: v.as_str().unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        let mut columns = std::collections::HashMap::new();
        
        for col in &config.columns {
            let value = if validation_error.is_some() {
                // If there's a validation error, show <error> in cells
                "<error>".to_string()
            } else {
                // Evaluate the column using JSONPath
                match evaluate_column(item, col) {
                    Ok(v) => v,
                    Err(e) => {
                        // Set error on first occurrence
                        if validation_error.is_none() {
                            validation_error = Some(format!("Column '{}': {}", col.name, e));
                        }
                        "<error>".to_string()
                    }
                }
            };
            
            columns.insert(col.name.clone(), value);
        }
        
        result.push(ResourceItem { name, columns, labels });
    }
    
    Ok((result, validation_error))
}

#[tauri::command]
pub async fn get_resources(
    resource_type: String,
    context: String,
    namespace: String,
    label_selectors: Vec<LabelSelector>,
) -> Result<ResourceListResponse, String> {
    // Get column configuration
    let column_config = resource_columns::get_resource_columns(
        resource_type.clone(),
        context.clone(),
        namespace.clone(),
    )?;
    
    // Build kubectl command args
    let mut args = vec![
        "get".to_string(),
        resource_type.clone(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
    ];
    
    // Add label selector if provided
    if !label_selectors.is_empty() {
        let selector_string = label_selectors
            .iter()
            .map(|ls| format!("{}={}", ls.key, ls.value))
            .collect::<Vec<String>>()
            .join(",");
        args.push("-l".to_string());
        args.push(selector_string);
    }
    
    args.push("-o".to_string());
    args.push("json".to_string());
    
    // Execute kubectl command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your network connection then click refresh to retry", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse and process resources
    let (items, evaluation_error) = parse_kubectl_json(&stdout, &column_config, &resource_type)?;
    
    Ok(ResourceListResponse {
        columns: column_config.columns,
        items,
        evaluation_error,
    })
}

#[tauri::command]
pub async fn get_pod_containers(
    context: String,
    namespace: String,
    pod_name: String,
) -> Result<ResourceListResponse, String> {
    // Build kubectl command to get a single pod
    let args = vec![
        "get".to_string(),
        "pod".to_string(),
        pod_name.clone(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "-o".to_string(),
        "json".to_string(),
    ];
    
    // Execute kubectl command asynchronously with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s, check your network connection then click refresh to retry", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let pod: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse kubectl JSON output: {}", e))?;
    
    // Extract containers from spec
    let spec_containers = pod.get("spec")
        .and_then(|s| s.get("containers"))
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();
    
    // Extract container statuses
    let container_statuses = pod.get("status")
        .and_then(|s| s.get("containerStatuses"))
        .and_then(|cs| cs.as_array())
        .cloned()
        .unwrap_or_default();
    
    // Build a map of container name -> status for easy lookup
    let status_map: std::collections::HashMap<String, &Value> = container_statuses
        .iter()
        .filter_map(|status| {
            status.get("name")
                .and_then(|n| n.as_str())
                .map(|name| (name.to_string(), status))
        })
        .collect();
    
    // Define columns for containers
    let columns = vec![
        crate::ColumnConfig {
            name: "IMAGE".to_string(),
            json_paths: vec![".image".to_string()],
            format: None,
            column_type: None,
        },
        crate::ColumnConfig {
            name: "READY".to_string(),
            json_paths: vec![".ready".to_string()],
            format: None,
            column_type: None,
        },
        crate::ColumnConfig {
            name: "STATE".to_string(),
            json_paths: vec![".state".to_string()],
            format: None,
            column_type: None,
        },
        crate::ColumnConfig {
            name: "RESTARTS".to_string(),
            json_paths: vec![".restartCount".to_string()],
            format: None,
            column_type: None,
        },
        crate::ColumnConfig {
            name: "PORTS".to_string(),
            json_paths: vec![".ports".to_string()],
            format: None,
            column_type: None,
        },
    ];
    
    // Build container items
    let mut items = Vec::new();
    for container in &spec_containers {
        let name = container.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("<unknown>")
            .to_string();
        
        let image = container.get("image")
            .and_then(|i| i.as_str())
            .unwrap_or("<none>")
            .to_string();
        
        // Get ports from spec
        let ports = container.get("ports")
            .and_then(|p| p.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|p| p.get("containerPort").and_then(|cp| cp.as_u64()))
                    .map(|p| p.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "<none>".to_string());
        
        // Get status info
        let status = status_map.get(&name);
        
        let ready = status
            .and_then(|s| s.get("ready"))
            .and_then(|r| r.as_bool())
            .map(|r| if r { "True" } else { "False" })
            .unwrap_or("False")
            .to_string();
        
        let restarts = status
            .and_then(|s| s.get("restartCount"))
            .and_then(|r| r.as_u64())
            .unwrap_or(0)
            .to_string();
        
        // Determine state from status.state object
        let state = status
            .and_then(|s| s.get("state"))
            .and_then(|state| {
                if state.get("running").is_some() {
                    Some("Running".to_string())
                } else if let Some(waiting) = state.get("waiting") {
                    let reason = waiting.get("reason")
                        .and_then(|r| r.as_str())
                        .unwrap_or("Waiting");
                    Some(reason.to_string())
                } else if let Some(terminated) = state.get("terminated") {
                    let reason = terminated.get("reason")
                        .and_then(|r| r.as_str())
                        .unwrap_or("Terminated");
                    Some(reason.to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "Unknown".to_string());
        
        let mut column_values = std::collections::HashMap::new();
        column_values.insert("IMAGE".to_string(), image);
        column_values.insert("READY".to_string(), ready);
        column_values.insert("STATE".to_string(), state);
        column_values.insert("RESTARTS".to_string(), restarts);
        column_values.insert("PORTS".to_string(), ports);
        
        items.push(ResourceItem {
            name,
            columns: column_values,
            labels: vec![], // Containers don't have labels
        });
    }
    
    Ok(ResourceListResponse {
        columns,
        items,
        evaluation_error: None,
    })
}
