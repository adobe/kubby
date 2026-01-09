use tokio::process::Command;

use serde_json::Value;

use crate::{ResourceColumnConfig, ResourceItem, ResourceListResponse};
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

fn extract_timestamp(obj: &Value, json_path: &str) -> Option<String> {
    if obj.is_null() {
        return None;
    }
    
    // Remove leading dot
    let path = if json_path.starts_with('.') {
        &json_path[1..]
    } else {
        json_path
    };
    
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = obj;
    
    for part in parts {
        if current.is_null() {
            return None;
        }
        
        current = match current.get(part) {
            Some(val) => val,
            None => return None,
        };
    }
    
    if current.is_null() {
        return None;
    }
    
    // Return the timestamp as a string, preserving RFC3339 format
    if let Some(s) = current.as_str() {
        Some(s.to_string())
    } else {
        None
    }
}

fn extract_value(obj: &Value, json_path: &str) -> String {
    if obj.is_null() {
        return "<none>".to_string();
    }
    
    // Handle special composite paths like ".status.readyReplicas/.spec.replicas"
    if json_path.contains('/') {
        let parts: Vec<&str> = json_path.split('/').collect();
        if parts.len() == 2 {
            let numerator = extract_value(obj, parts[0]);
            let denominator = extract_value(obj, parts[1]);
            return format!("{}/{}", numerator, denominator);
        }
    }
    
    // Remove leading dot
    let path = if json_path.starts_with('.') {
        &json_path[1..]
    } else {
        json_path
    };
    
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = obj;
    
    for part in parts {
        if current.is_null() {
            return "<none>".to_string();
        }
        
        // Handle array access like [0] or [*] or [-1]
        if let Some(bracket_start) = part.find('[') {
            if let Some(bracket_end) = part.find(']') {
                let key = &part[..bracket_start];
                let index_str = &part[bracket_start + 1..bracket_end];
                
                current = match current.get(key) {
                    Some(val) => val,
                    None => return "<none>".to_string(),
                };
                
                if !current.is_array() {
                    return "<none>".to_string();
                }
                
                let arr = current.as_array().unwrap();
                
                if index_str == "*" {
                    // Return all array values joined
                    let values: Vec<String> = arr.iter().map(|item| {
                        if item.is_object() {
                            // For ports, format nicely
                            if let Some(port) = item.get("port") {
                                let port_str = port.as_u64().map(|p| p.to_string())
                                    .unwrap_or_else(|| port.to_string());
                                let target_port = item.get("targetPort")
                                    .map(|tp| format!(":{}", tp))
                                    .unwrap_or_default();
                                let protocol = item.get("protocol")
                                    .and_then(|p| p.as_str())
                                    .map(|p| format!("/{}", p))
                                    .unwrap_or_default();
                                return format!("{}{}{}", port_str, target_port, protocol);
                            }
                            serde_json::to_string(item).unwrap_or_else(|_| "<none>".to_string())
                        } else {
                            item.to_string()
                        }
                    }).collect();
                    return values.join(",");
                } else if index_str == "-1" {
                    current = arr.last().unwrap_or(&Value::Null);
                } else if let Ok(index) = index_str.parse::<usize>() {
                    current = arr.get(index).unwrap_or(&Value::Null);
                } else {
                    return "<none>".to_string();
                }
            } else {
                return "<none>".to_string();
            }
        } else if part.contains("['") && part.contains("']") {
            // Handle label-style access like labels['node-role.kubernetes.io/']
            if let Some(quote_start) = part.find("['") {
                if let Some(quote_end) = part.find("']") {
                    let key = &part[..quote_start];
                    let label_prefix = &part[quote_start + 2..quote_end];
                    
                    current = match current.get(key) {
                        Some(val) => val,
                        None => return "<none>".to_string(),
                    };
                    
                    if let Some(obj) = current.as_object() {
                        let matching_keys: Vec<String> = obj.keys()
                            .filter(|k| k.starts_with(label_prefix))
                            .map(|k| k.replace(label_prefix, ""))
                            .map(|k| if k.is_empty() { "master".to_string() } else { k })
                            .collect();
                        
                        if matching_keys.is_empty() {
                            return "<none>".to_string();
                        } else {
                            return matching_keys.join(",");
                        }
                    } else {
                        return "<none>".to_string();
                    }
                }
            }
        } else {
            current = match current.get(part) {
                Some(val) => val,
                None => return "<none>".to_string(),
            };
        }
    }
    
    if current.is_null() {
        return "<none>".to_string();
    }
    
    // Format different types
    if current.is_array() {
        return current.as_array().unwrap().len().to_string();
    }
    
    if current.is_object() {
        return current.as_object().unwrap().len().to_string();
    }
    
    if let Some(b) = current.as_bool() {
        return if b { "True".to_string() } else { "False".to_string() };
    }
    
    current.to_string()
}

fn parse_kubectl_json(
    stdout: &str,
    config: &ResourceColumnConfig,
    resource_type: &str,
) -> Result<Vec<ResourceItem>, String> {
    let data: Value = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse kubectl JSON output: {}", e))?;
    
    let items: Vec<&Value> = match data.get("items") {
        Some(Value::Array(arr)) => arr.iter().collect(),
        _ => vec![&data],
    };
    
    let mut result = Vec::new();
    
    for item in items {
        let name = item.get("metadata")
            .and_then(|m| m.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("<unknown>")
            .to_string();
        
        let mut columns = std::collections::HashMap::new();
        
        for col in &config.columns {
            let mut value = if col.name == "AGE" || col.name == "LAST SCHEDULE" {
                // Extract timestamp directly for AGE columns to preserve RFC3339 format
                extract_timestamp(item, &col.json_path)
                    .map(|ts| format_age(&ts))
                    .unwrap_or_else(|| "<unknown>".to_string())
            } else {
                extract_value(item, &col.json_path)
            };
            
            // Special handling for READY column in pods
            if col.name == "READY" && resource_type == "pods" {
                if let Some(statuses) = item.get("status")
                    .and_then(|s| s.get("containerStatuses"))
                    .and_then(|cs| cs.as_array())
                {
                    let ready = statuses.iter()
                        .filter(|s| s.get("ready").and_then(|r| r.as_bool()).unwrap_or(false))
                        .count();
                    let total = statuses.len();
                    value = format!("{}/{}", ready, total);
                }
            }
            
            // Special handling for RESTARTS
            if col.name == "RESTARTS" {
                if let Some(statuses) = item.get("status")
                    .and_then(|s| s.get("containerStatuses"))
                    .and_then(|cs| cs.as_array())
                {
                    let restarts: u64 = statuses.iter()
                        .map(|s| s.get("restartCount").and_then(|r| r.as_u64()).unwrap_or(0))
                        .sum();
                    value = restarts.to_string();
                }
            }
            
            // Special handling for PORTS in ingress
            if col.name == "PORTS" && resource_type == "ingresses" {
                let has_tls = item.get("spec")
                    .and_then(|s| s.get("tls"))
                    .and_then(|t| t.as_array())
                    .map(|arr| !arr.is_empty())
                    .unwrap_or(false);
                value = if has_tls { "80, 443".to_string() } else { "80".to_string() };
            }
            
            columns.insert(col.name.clone(), value);
        }
        
        result.push(ResourceItem { name, columns });
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn get_resources(
    resource_type: String,
    context: String,
    namespace: String,
) -> Result<ResourceListResponse, String> {
    // Get column configuration
    let column_config = resource_columns::get_resource_columns(
        resource_type.clone(),
        context.clone(),
        namespace.clone(),
    )?;
    
    // Build kubectl command args
    let args = vec![
        "get".to_string(),
        resource_type.clone(),
        "--context".to_string(),
        context,
        "-n".to_string(),
        namespace,
        "-o".to_string(),
        "json".to_string(),
    ];
    
    // Execute kubectl command asynchronously (non-blocking)
    let output = Command::new("kubectl")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("kubectl failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse and process resources
    let items = parse_kubectl_json(&stdout, &column_config, &resource_type)?;
    
    Ok(ResourceListResponse {
        columns: column_config.columns,
        items,
    })
}

