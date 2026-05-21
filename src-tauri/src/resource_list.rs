/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

use serde_json::Value;
use serde_json_path::JsonPath;

use crate::kubectl;
use crate::types::{
    ColumnConfig, ColumnType, LabelSelector, ResourceColumnConfig, ResourceItem,
    ResourceListResponse, SpecFilter,
};
use crate::resource_columns;
use crate::metrics;

/// Context for evaluating columns that may reference metrics
#[derive(Clone)]
pub struct EvalContext<'a> {
    pub context: &'a str,
    pub namespace: &'a str,
    pub pod_name: &'a str,
    pub container_name: Option<&'a str>,
}

/// Check if a spec filter path can be used as a kubectl field selector for a resource type.
/// Currently only events support field selectors for involvedObject.* fields.
fn is_field_selector_supported(resource_type: &str, path: &str) -> bool {
    let rt = resource_type.to_lowercase();
    if rt == "events" || rt == "event" {
        // Events support involvedObject.* field selectors
        path.starts_with("involvedObject.")
    } else {
        // Other resource types don't support custom field selectors
        false
    }
}

/// Convert a spec filter path to a kubectl field selector path.
/// For example, "involvedObject.name" stays as "involvedObject.name".
fn to_field_selector_path(path: &str) -> String {
    path.to_string()
}

/// Check if a JSON value matches a spec filter by evaluating the path.
fn matches_spec_filter(item: &Value, filter: &SpecFilter) -> bool {
    // Convert dot-notation path to JSON pointer format
    let pointer = format!("/{}", filter.path.replace('.', "/"));
    
    // Get the value at the path
    if let Some(value) = item.pointer(&pointer) {
        // Compare the value (handle different types)
        if let Some(s) = value.as_str() {
            s == filter.value
        } else if let Some(n) = value.as_i64() {
            n.to_string() == filter.value
        } else if let Some(n) = value.as_u64() {
            n.to_string() == filter.value
        } else if let Some(n) = value.as_f64() {
            n.to_string() == filter.value
        } else if let Some(b) = value.as_bool() {
            b.to_string() == filter.value
        } else {
            false
        }
    } else {
        false
    }
}

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

/// Normalize CPU value to human-readable format (millicores or cores)
fn format_cpu_value(value: &str) -> String {
    if value == "<none>" || value == "-" || value.is_empty() {
        return value.to_string();
    }
    
    // Parse to nanocores
    let nanocores = if let Some(stripped) = value.strip_suffix('n') {
        stripped.parse::<u64>().unwrap_or(0)
    } else if let Some(stripped) = value.strip_suffix('u') {
        stripped.parse::<u64>().unwrap_or(0) * 1000
    } else if let Some(stripped) = value.strip_suffix('m') {
        stripped.parse::<u64>().unwrap_or(0) * 1_000_000
    } else {
        // Whole cores or decimal cores (e.g., "8" or "0.5")
        (value.parse::<f64>().unwrap_or(0.0) * 1_000_000_000.0) as u64
    };
    
    // Format to most appropriate unit
    if nanocores >= 1_000_000_000 {
        let cores = nanocores / 1_000_000_000;
        format!("{}", cores)
    } else {
        let millicores = nanocores / 1_000_000;
        if millicores > 0 {
            format!("{}m", millicores)
        } else {
            "0m".to_string()
        }
    }
}

/// Normalize memory value to human-readable format (Ki, Mi, Gi)
fn format_memory_value(value: &str) -> String {
    if value == "<none>" || value == "-" || value.is_empty() {
        return value.to_string();
    }
    
    // Parse to bytes
    let bytes = if let Some(stripped) = value.strip_suffix("Ki") {
        stripped.parse::<u64>().unwrap_or(0) * 1024
    } else if let Some(stripped) = value.strip_suffix("Mi") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024
    } else if let Some(stripped) = value.strip_suffix("Gi") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024 * 1024
    } else if let Some(stripped) = value.strip_suffix("Ti") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024 * 1024 * 1024
    } else if let Some(stripped) = value.strip_suffix('K') {
        stripped.parse::<u64>().unwrap_or(0) * 1000
    } else if let Some(stripped) = value.strip_suffix('M') {
        stripped.parse::<u64>().unwrap_or(0) * 1000 * 1000
    } else if let Some(stripped) = value.strip_suffix('G') {
        stripped.parse::<u64>().unwrap_or(0) * 1000 * 1000 * 1000
    } else {
        // Plain bytes
        value.parse::<u64>().unwrap_or(0)
    };
    
    // Format to most appropriate binary unit
    if bytes >= 1024 * 1024 * 1024 {
        format!("{}Gi", bytes / (1024 * 1024 * 1024))
    } else if bytes >= 1024 * 1024 {
        format!("{}Mi", bytes / (1024 * 1024))
    } else if bytes >= 1024 {
        format!("{}Ki", bytes / 1024)
    } else {
        format!("{}B", bytes)
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
        ColumnType::PodStatus => {
            // This should not be called for PodStatus - handled separately
            "<error>".to_string()
        }
        ColumnType::ContainerState => {
            // This should not be called for ContainerState - handled separately
            "<error>".to_string()
        }
        ColumnType::CpuValue => {
            if let Some(s) = value.as_str() {
                format_cpu_value(s)
            } else {
                "<none>".to_string()
            }
        }
        ColumnType::MemoryValue => {
            if let Some(s) = value.as_str() {
                format_memory_value(s)
            } else {
                "<none>".to_string()
            }
        }
    }
}

// Smart pod status evaluation with prioritized condition checking
fn evaluate_pod_status(item: &Value) -> String {
    // 0. Check if pod is being deleted (highest priority)
    // When a pod is deleted, Kubernetes sets metadata.deletionTimestamp
    if item.pointer("/metadata/deletionTimestamp").is_some() {
        return "Terminating".to_string();
    }
    
    let phase = item
        .pointer("/status/phase")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");
    
    // 1. Check for scheduling issues (highest priority for Pending)
    if let Some(conditions) = item.pointer("/status/conditions").and_then(|v| v.as_array()) {
        for condition in conditions {
            if condition.get("type").and_then(|v| v.as_str()) == Some("PodScheduled")
                && condition.get("status").and_then(|v| v.as_str()) == Some("False") {
                if let Some(reason) = condition.get("reason").and_then(|v| v.as_str()) {
                    return reason.to_string();
                }
            }
        }
    }
    
    // 2. Check init containers (second priority)
    if let Some(init_containers) = item.pointer("/status/initContainerStatuses").and_then(|v| v.as_array()) {
        if let Some(first_waiting) = init_containers.iter().find(|c| {
            c.pointer("/state/waiting").is_some()
        }) {
            if let Some(reason) = first_waiting.pointer("/state/waiting/reason").and_then(|v| v.as_str()) {
                return format!("Init:{}", reason);
            }
        }
    }
    
    // 3. Check main containers
    if let Some(containers) = item.pointer("/status/containerStatuses").and_then(|v| v.as_array()) {
        // Collect unique waiting reasons
        let mut waiting_reasons: Vec<&str> = containers
            .iter()
            .filter_map(|c| c.pointer("/state/waiting/reason").and_then(|v| v.as_str()))
            .collect();
        waiting_reasons.sort();
        waiting_reasons.dedup();  // Remove duplicates!
        
        if !waiting_reasons.is_empty() {
            return waiting_reasons.join(", ");
        }
        
        // Check for terminated containers
        let mut terminated_reasons: Vec<&str> = containers
            .iter()
            .filter_map(|c| c.pointer("/state/terminated/reason").and_then(|v| v.as_str()))
            .collect();
        terminated_reasons.sort();
        terminated_reasons.dedup();
        
        if !terminated_reasons.is_empty() {
            return terminated_reasons.join(", ");
        }
    }
    
    // 4. Check for other condition issues (only for Running/non-Pending phases)
    if phase != "Pending" {
        if let Some(conditions) = item.pointer("/status/conditions").and_then(|v| v.as_array()) {
            let mut false_conditions: Vec<&str> = conditions
                .iter()
                .filter(|c| {
                    c.get("status").and_then(|v| v.as_str()) == Some("False")
                    && c.get("type").and_then(|v| v.as_str()) != Some("PodScheduled")  // Skip already checked
                })
                .filter_map(|c| c.get("reason").and_then(|v| v.as_str()))
                .collect();
            false_conditions.sort();
            false_conditions.dedup();
            
            if !false_conditions.is_empty() {
                return false_conditions.join(", ");
            }
        }
    }
    
    // Default: just show phase
    phase.to_string()
}

/// Evaluate metrics percentage fields (e.g., cpu_percent_requests, memory_percent_limits)
/// Returns percentage as integer string (e.g., "85" for 85%)
fn evaluate_metrics_percentage(item: &Value, field: &str, ctx: Option<&EvalContext>) -> Result<String, String> {
    let ctx = match ctx {
        Some(c) => c,
        None => return Ok("-".to_string()),
    };
    
    // Parse field: {resource}_percent_{target} (e.g., cpu_percent_requests)
    let parts: Vec<&str> = field.split("_percent_").collect();
    if parts.len() != 2 {
        return Ok("-".to_string());
    }
    
    let resource = parts[0]; // "cpu" or "memory"
    let target = parts[1];   // "requests" or "limits"
    
    // Get current metrics
    let metrics = if let Some(container_name) = ctx.container_name {
        metrics::get_container_metrics(ctx.context, ctx.namespace, ctx.pod_name, container_name)
    } else {
        metrics::get_pod_metrics(ctx.context, ctx.namespace, ctx.pod_name)
    };
    
    let metrics = match metrics {
        Some(m) => m,
        None => return Ok("-".to_string()),
    };
    
    // Get the spec value - different paths for containers vs pods
    let spec_total: u64 = if ctx.container_name.is_some() {
        // For containers: single value at /resources/{target}/{resource}
        let spec_path = format!("/resources/{}/{}", target, resource);
        let spec_value = item.pointer(&spec_path)
            .and_then(|v| v.as_str())
            .unwrap_or("");
        
        if spec_value.is_empty() || spec_value == "<none>" {
            return Ok("-".to_string());
        }
        
        match resource {
            "cpu" => metrics::parse_cpu_to_nanocores(spec_value),
            "memory" => metrics::parse_memory_to_bytes(spec_value),
            _ => return Ok("-".to_string()),
        }
    } else {
        // For pods: sum all container specs at /spec/containers[*]/resources/{target}/{resource}
        let containers = item.pointer("/spec/containers")
            .and_then(|v| v.as_array());
        
        let containers = match containers {
            Some(c) => c,
            None => return Ok("-".to_string()),
        };
        
        let mut total: u64 = 0;
        let mut found_any = false;
        
        for container in containers {
            let spec_path = format!("/resources/{}/{}", target, resource);
            if let Some(spec_value) = container.pointer(&spec_path).and_then(|v| v.as_str()) {
                if !spec_value.is_empty() && spec_value != "<none>" {
                    found_any = true;
                    total += match resource {
                        "cpu" => metrics::parse_cpu_to_nanocores(spec_value),
                        "memory" => metrics::parse_memory_to_bytes(spec_value),
                        _ => 0,
                    };
                }
            }
        }
        
        if !found_any {
            return Ok("-".to_string());
        }
        
        total
    };
    
    if spec_total == 0 {
        return Ok("-".to_string());
    }
    
    // Calculate percentage based on resource type
    let current = match resource {
        "cpu" => metrics::parse_cpu_to_nanocores(&metrics.cpu),
        "memory" => metrics::parse_memory_to_bytes(&metrics.memory),
        _ => return Ok("-".to_string()),
    };
    
    let percentage = (current * 100) / spec_total;
    
    Ok(percentage.to_string())
}

/// Evaluate aggregated spec fields for pods (e.g., cpu_requests, memory_limits)
/// Sums values across all containers and returns formatted string
fn evaluate_spec_aggregate(item: &Value, field: &str, column_type: &ColumnType, ctx: Option<&EvalContext>) -> Result<String, String> {
    // Parse field: {resource}_{target} (e.g., cpu_requests, memory_limits)
    let parts: Vec<&str> = field.split('_').collect();
    if parts.len() != 2 {
        return Ok("-".to_string());
    }
    
    let resource = parts[0]; // "cpu" or "memory"
    let target = parts[1];   // "requests" or "limits"
    
    // For containers, get single value from /resources/{target}/{resource}
    if let Some(ctx) = ctx {
        if ctx.container_name.is_some() {
            let spec_path = format!("/resources/{}/{}", target, resource);
            let spec_value = item.pointer(&spec_path)
                .and_then(|v| v.as_str())
                .unwrap_or("-");
            return Ok(spec_value.to_string());
        }
    }
    
    // For pods, sum all container specs
    let containers = item.pointer("/spec/containers")
        .and_then(|v| v.as_array());
    
    let containers = match containers {
        Some(c) => c,
        None => return Ok("-".to_string()),
    };
    
    let mut total: u64 = 0;
    let mut found_any = false;
    
    for container in containers {
        let spec_path = format!("/resources/{}/{}", target, resource);
        if let Some(spec_value) = container.pointer(&spec_path).and_then(|v| v.as_str()) {
            if !spec_value.is_empty() && spec_value != "<none>" {
                found_any = true;
                total += match resource {
                    "cpu" => metrics::parse_cpu_to_nanocores(spec_value),
                    "memory" => metrics::parse_memory_to_bytes(spec_value),
                    _ => 0,
                };
            }
        }
    }
    
    if !found_any {
        return Ok("-".to_string());
    }
    
    // Format the aggregated value
    let formatted = match resource {
        "cpu" => {
            let raw = metrics::format_nanocores(total);
            match column_type {
                ColumnType::CpuValue => format_cpu_value(&raw),
                _ => raw,
            }
        }
        "memory" => {
            let raw = metrics::format_bytes(total);
            match column_type {
                ColumnType::MemoryValue => format_memory_value(&raw),
                _ => raw,
            }
        }
        _ => "-".to_string(),
    };
    
    Ok(formatted)
}

/// Convert traditional JSONPath syntax to RFC 9535 syntax used by serde_json_path.
/// CRD additionalPrinterColumns use traditional syntax like:
///   .status.conditions[?(@.type=="Ready")].status
/// RFC 9535 expects:
///   $.status.conditions[? @.type == 'Ready'].status
fn normalize_jsonpath(path: &str) -> String {
    let mut result = path.to_string();
    
    // Prepend $ if path starts with .
    if result.starts_with('.') && !result.starts_with("$.") {
        result = format!("${}", result);
    }
    
    // Convert filter expressions from [?(@...)] to [? @...]
    // Also convert double quotes to single quotes in filter expressions
    let mut output = String::with_capacity(result.len());
    let chars: Vec<char> = result.chars().collect();
    let mut i = 0;
    
    while i < chars.len() {
        // Look for [?( pattern
        if i + 2 < chars.len() && chars[i] == '[' && chars[i + 1] == '?' && chars[i + 2] == '(' {
            output.push('[');
            output.push('?');
            output.push(' ');
            i += 3; // Skip [?(
            
            // Process filter content until we find )]
            let mut paren_depth = 1;
            while i < chars.len() && paren_depth > 0 {
                if chars[i] == '(' {
                    paren_depth += 1;
                    output.push(chars[i]);
                } else if chars[i] == ')' {
                    paren_depth -= 1;
                    if paren_depth == 0 {
                        // Skip the closing ) - it will be followed by ]
                        i += 1;
                        continue;
                    }
                    output.push(chars[i]);
                } else if chars[i] == '"' {
                    // Convert double quotes to single quotes in filter
                    output.push('\'');
                } else if chars[i] == '=' && i + 1 < chars.len() && chars[i + 1] == '=' {
                    // Add spaces around == if not already present
                    if !output.ends_with(' ') {
                        output.push(' ');
                    }
                    output.push('=');
                    output.push('=');
                    i += 1;
                    if i + 1 < chars.len() && chars[i + 1] != ' ' {
                        output.push(' ');
                    }
                } else {
                    output.push(chars[i]);
                }
                i += 1;
            }
        } else {
            output.push(chars[i]);
            i += 1;
        }
    }
    
    output
}

// Evaluate a single JSONPath expression with optional metrics context
fn evaluate_jsonpath_with_context(
    item: &Value,
    json_path: &str,
    column_type: &ColumnType,
    ctx: Option<&EvalContext>,
) -> Result<String, String> {
    // Handle $spec.* paths - aggregated spec values for pods
    if json_path.starts_with("$spec.") {
        let field = &json_path["$spec.".len()..];
        return evaluate_spec_aggregate(item, field, column_type, ctx);
    }
    
    // Handle $metrics.* paths - lookup from metrics cache
    if json_path.starts_with("$metrics.") {
        let field = &json_path["$metrics.".len()..];
        
        // Handle percentage fields (e.g., cpu_percent_requests, memory_percent_limits)
        if field.contains("_percent_") {
            return evaluate_metrics_percentage(item, field, ctx);
        }
        
        if let Some(ctx) = ctx {
            // For containers, use container-level metrics
            if let Some(container_name) = ctx.container_name {
                if let Some(m) = metrics::get_container_metrics(
                    ctx.context,
                    ctx.namespace,
                    ctx.pod_name,
                    container_name,
                ) {
                    let raw_value = match field {
                        "cpu" => m.cpu,
                        "memory" => m.memory,
                        _ => "-".to_string(),
                    };
                    // Apply formatting based on column type
                    return Ok(match column_type {
                        ColumnType::CpuValue => format_cpu_value(&raw_value),
                        ColumnType::MemoryValue => format_memory_value(&raw_value),
                        _ => raw_value,
                    });
                }
            } else {
                // For pods, use aggregated pod-level metrics
                if let Some(m) = metrics::get_pod_metrics(
                    ctx.context,
                    ctx.namespace,
                    ctx.pod_name,
                ) {
                    let raw_value = match field {
                        "cpu" => m.cpu,
                        "memory" => m.memory,
                        _ => "-".to_string(),
                    };
                    // Apply formatting based on column type
                    return Ok(match column_type {
                        ColumnType::CpuValue => format_cpu_value(&raw_value),
                        ColumnType::MemoryValue => format_memory_value(&raw_value),
                        _ => raw_value,
                    });
                }
            }
        }
        // Graceful fallback: metrics not available
        return Ok("-".to_string());
    }
    
    // Normalize and parse the JSONPath expression
    let normalized = normalize_jsonpath(json_path);
    let path = JsonPath::parse(&normalized)
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

// Evaluate column config with optional metrics context
// Returns (formatted_value, raw_values)
fn evaluate_column_with_context(
    item: &Value,
    config: &ColumnConfig,
    ctx: Option<&EvalContext>,
) -> Result<(String, Vec<String>), String> {
    let column_type = config.column_type.as_ref().unwrap_or(&ColumnType::Text);
    
    // Handle custom pod status evaluation
    if matches!(column_type, ColumnType::PodStatus) {
        let status = evaluate_pod_status(item);
        return Ok((status.clone(), vec![status]));
    }
    
    // Handle custom container state evaluation
    if matches!(column_type, ColumnType::ContainerState) {
        let state = evaluate_container_state(item);
        return Ok((state.clone(), vec![state]));
    }
    
    // Evaluate each JSONPath
    let mut results: Vec<String> = Vec::new();
    for json_path in &config.json_paths {
        let result = evaluate_jsonpath_with_context(item, json_path, column_type, ctx)?;
        results.push(result);
    }
    
    // Store raw values for color evaluation
    let raw_values = results.clone();
    
    // Apply format if present
    let formatted = if let Some(format_str) = &config.format {
        // Simple placeholder substitution: {0}, {1}, etc.
        let mut formatted = format_str.clone();
        for (i, result) in results.iter().enumerate() {
            formatted = formatted.replace(&format!("{{{}}}", i), result);
        }
        
        // Check if any placeholders remain (out of bounds)
        if formatted.contains('{') && formatted.contains('}') {
            return Err(format!("Format string references missing index"));
        }
        
        formatted
    } else {
        // No format: join with space
        results.join(" ")
    };
    
    Ok((formatted, raw_values))
}

// Evaluate container state from merged container object (spec + status)
fn evaluate_container_state(item: &Value) -> String {
    item.get("status")
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
        .unwrap_or_else(|| "Unknown".to_string())
}

fn parse_kubectl_json(
    stdout: &str,
    config: &ResourceColumnConfig,
    resource_type: &str,
    context: &str,
    namespace: &str,
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
        // Validate each JSONPath can be parsed (skip $metrics.* and $spec.* paths which are handled specially)
        for json_path in &col.json_paths {
            if json_path.starts_with("$metrics.") || json_path.starts_with("$spec.") {
                continue;
            }
            let normalized = normalize_jsonpath(json_path);
            if let Err(e) = JsonPath::parse(&normalized) {
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
        let mut raw_values = std::collections::HashMap::new();
        
        // For pods, create an EvalContext to enable metrics lookup
        let eval_ctx = if resource_type.to_lowercase() == "pods" {
            Some(EvalContext {
                context,
                namespace,
                pod_name: &name,
                container_name: None,
            })
        } else {
            None
        };
        
        for col in &config.columns {
            let (value, raw_vals) = if validation_error.is_some() {
                // If there's a validation error, show <error> in cells
                ("<error>".to_string(), vec!["<error>".to_string()])
            } else {
                // Evaluate the column using JSONPath (with context for pods)
                match evaluate_column_with_context(item, col, eval_ctx.as_ref()) {
                    Ok((v, r)) => (v, r),
                    Err(e) => {
                        // Set error on first occurrence
                        if validation_error.is_none() {
                            validation_error = Some(format!("Column '{}': {}", col.name, e));
                        }
                        ("<error>".to_string(), vec!["<error>".to_string()])
                    }
                }
            };
            
            columns.insert(col.name.clone(), value);
            raw_values.insert(col.name.clone(), raw_vals);
        }
        
        result.push(ResourceItem { name, columns, labels, raw_values });
    }
    
    Ok((result, validation_error))
}

#[tauri::command]
pub async fn get_resources(
    resource_type: String,
    context: String,
    namespace: String,
    label_selectors: Vec<LabelSelector>,
    spec_filters: Option<Vec<SpecFilter>>,
) -> Result<ResourceListResponse, String> {
    // Get column configuration
    let column_config = resource_columns::get_resource_columns(
        resource_type.clone(),
        context.clone(),
        namespace.clone(),
    )?;
    
    // Separate spec filters into those we can use as field selectors vs post-fetch filters
    let spec_filters = spec_filters.unwrap_or_default();
    let (field_selector_filters, post_fetch_filters): (Vec<_>, Vec<_>) = spec_filters
        .into_iter()
        .partition(|f| is_field_selector_supported(&resource_type, &f.path));
    
    // Build kubectl command args
    let mut args = vec![
        "get".to_string(),
        resource_type.clone(),
        "--context".to_string(),
        context.clone(),
        "--namespace".to_string(),
        namespace.clone(),
    ];
    
    // Add label selector if provided
    if !label_selectors.is_empty() {
        let selector_string = label_selectors
            .iter()
            .map(|ls| format!("{}={}", ls.key, ls.value))
            .collect::<Vec<String>>()
            .join(",");
        args.push("--selector".to_string());
        args.push(selector_string);
    }
    
    // Add field selector if we have any filters that can use it
    if !field_selector_filters.is_empty() {
        let selector_string = field_selector_filters
            .iter()
            .map(|f| format!("{}={}", to_field_selector_path(&f.path), f.value))
            .collect::<Vec<String>>()
            .join(",");
        args.push("--field-selector".to_string());
        args.push(selector_string);
    }
    
    args.push("--output".to_string());
    args.push("json".to_string());
    
    let result = kubectl::run(&args).await?;
    
    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }
    
    let stdout = String::from_utf8_lossy(&result.output.stdout);
    
    // Parse and process resources
    let (mut items, evaluation_error) = parse_kubectl_json(&stdout, &column_config, &resource_type, &context, &namespace)?;
    
    // Apply post-fetch filtering for spec filters that couldn't use field selectors
    if !post_fetch_filters.is_empty() {
        // We need to filter based on the raw JSON, so re-parse it
        let data: Value = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse kubectl JSON output: {}", e))?;
        
        let raw_items: Vec<&Value> = match data.get("items") {
            Some(Value::Array(arr)) => arr.iter().collect(),
            _ => vec![&data],
        };
        
        // Filter items based on spec filters
        // We need to match by name since ResourceItem doesn't contain raw JSON
        let matching_names: std::collections::HashSet<String> = raw_items
            .iter()
            .filter(|item| {
                post_fetch_filters.iter().all(|f| matches_spec_filter(item, f))
            })
            .filter_map(|item| {
                item.get("metadata")
                    .and_then(|m| m.get("name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        
        items.retain(|item| matching_names.contains(&item.name));
    }
    
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
    let result = kubectl::run([
        "get", "pod", &pod_name,
        "--context", &context,
        "--namespace", &namespace,
        "--output", "json",
    ]).await?;
    
    if !result.output.status.success() {
        let stderr = String::from_utf8_lossy(&result.output.stderr);
        return Err(format!("kubectl failed: {}\nCommand: {}", stderr.trim(), result.command));
    }
    
    let stdout = String::from_utf8_lossy(&result.output.stdout);
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
    let status_map: std::collections::HashMap<String, Value> = container_statuses
        .iter()
        .filter_map(|status| {
            status.get("name")
                .and_then(|n| n.as_str())
                .map(|name| (name.to_string(), status.clone()))
        })
        .collect();
    
    // Get columns for containers
    let column_config = crate::resource_columns::get_builtin_resource_columns("containers")
        .unwrap_or_else(|| crate::ResourceColumnConfig { columns: vec![] });
    let columns = column_config.columns.clone();
    
    // Build container items using column evaluation
    let mut items = Vec::new();
    let mut evaluation_error: Option<String> = None;
    
    for container in &spec_containers {
        let name = container.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("<unknown>")
            .to_string();
        
        // Merge container spec with its status into a single object
        let mut merged = container.clone();
        if let Some(status) = status_map.get(&name) {
            if let Some(obj) = merged.as_object_mut() {
                obj.insert("status".to_string(), status.clone());
            }
        }
        
        // Build evaluation context for metrics lookup
        let ctx = EvalContext {
            context: &context,
            namespace: &namespace,
            pod_name: &pod_name,
            container_name: Some(&name),
        };
        
        // Evaluate each column using the merged object
        let mut column_values = std::collections::HashMap::new();
        let mut raw_values = std::collections::HashMap::new();
        
        for col in &column_config.columns {
            let (value, raw) = match evaluate_column_with_context(&merged, col, Some(&ctx)) {
                Ok((v, r)) => (v, r),
                Err(e) => {
                    if evaluation_error.is_none() {
                        evaluation_error = Some(format!("Column '{}': {}", col.name, e));
                    }
                    ("<error>".to_string(), vec!["<error>".to_string()])
                }
            };
            column_values.insert(col.name.clone(), value);
            raw_values.insert(col.name.clone(), raw);
        }
        
        items.push(ResourceItem {
            name,
            columns: column_values,
            labels: vec![], // Containers don't have labels
            raw_values,
        });
    }
    
    Ok(ResourceListResponse {
        columns,
        items,
        evaluation_error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_jsonpath_prepends_dollar() {
        assert_eq!(normalize_jsonpath(".status.phase"), "$.status.phase");
        assert_eq!(normalize_jsonpath("$.status.phase"), "$.status.phase");
    }

    #[test]
    fn test_normalize_jsonpath_filter_expression() {
        // Traditional syntax: [?(@.type=="Ready")]
        // RFC 9535 syntax: [? @.type == 'Ready']
        assert_eq!(
            normalize_jsonpath(".status.conditions[?(@.type==\"Ready\")].status"),
            "$.status.conditions[? @.type == 'Ready'].status"
        );
        assert_eq!(
            normalize_jsonpath(".status.conditions[?(@.type==\"SecretCreated\")].status"),
            "$.status.conditions[? @.type == 'SecretCreated'].status"
        );
    }

    #[test]
    fn test_normalize_jsonpath_no_filter() {
        // Paths without filters should remain unchanged (except $ prefix)
        assert_eq!(
            normalize_jsonpath(".metadata.name"),
            "$.metadata.name"
        );
        assert_eq!(
            normalize_jsonpath("$.spec.containers[*].name"),
            "$.spec.containers[*].name"
        );
    }

    #[test]
    fn test_normalize_jsonpath_parses_successfully() {
        // The normalized path should parse with serde_json_path
        let test_paths = [
            ".status.conditions[?(@.type==\"Ready\")].status",
            ".status.conditions[?(@.type==\"SecretCreated\")].status",
            ".metadata.name",
            "$.spec.replicas",
        ];
        
        for path in test_paths {
            let normalized = normalize_jsonpath(path);
            assert!(
                JsonPath::parse(&normalized).is_ok(),
                "Failed to parse normalized path '{}' (from '{}')",
                normalized,
                path
            );
        }
    }
}
