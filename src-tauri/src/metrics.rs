use std::collections::HashMap;
use std::sync::RwLock;

use serde::Serialize;
use serde_json::Value;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::types::KUBECTL_TIMEOUT_SECS;

/// Container metrics from the Kubernetes Metrics Server
#[derive(Debug, Clone, Serialize)]
pub struct ContainerMetrics {
    pub cpu: String,     // e.g., "125m"
    pub memory: String,  // e.g., "64Mi"
}

/// Response from refresh_metrics_cache command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsCacheStatus {
    pub available: bool,
    pub pod_count: usize,
    pub error: Option<String>,
}

/// Cache structure: context -> namespace -> "podName/containerName" -> metrics
type MetricsCache = HashMap<String, HashMap<String, HashMap<String, ContainerMetrics>>>;

/// Global metrics cache - lazy initialized
static METRICS_CACHE: std::sync::OnceLock<RwLock<MetricsCache>> = std::sync::OnceLock::new();

fn get_cache() -> &'static RwLock<MetricsCache> {
    METRICS_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Refresh metrics cache for a namespace. Called by frontend on interval.
/// 
/// Fetches all pod metrics for the given namespace from the Kubernetes Metrics Server API
/// and stores them in the cache. Returns status indicating if metrics are available.
#[tauri::command]
pub async fn refresh_metrics_cache(
    context: String,
    namespace: String,
) -> Result<MetricsCacheStatus, String> {
    let api_path = format!("/apis/metrics.k8s.io/v1beta1/namespaces/{}/pods", namespace);
    
    let args = vec![
        "get".to_string(),
        "--raw".to_string(),
        api_path,
        "--context".to_string(),
        context.clone(),
    ];
    
    // Execute kubectl with timeout
    let output = timeout(
        Duration::from_secs(KUBECTL_TIMEOUT_SECS),
        Command::new("kubectl")
            .args(&args)
            .output()
    )
    .await
    .map_err(|_| format!("kubectl timed out after {}s", KUBECTL_TIMEOUT_SECS))?
    .map_err(|e| format!("Failed to execute kubectl: {}", e))?;
    
    // Check if metrics server is available
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        // Clear cache for this namespace on error
        if let Ok(mut cache) = get_cache().write() {
            if let Some(ctx_cache) = cache.get_mut(&context) {
                ctx_cache.remove(&namespace);
            }
        }
        
        // Return graceful fallback - metrics unavailable
        return Ok(MetricsCacheStatus {
            available: false,
            pod_count: 0,
            error: Some(stderr.to_string()),
        });
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let metrics_response: Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse metrics JSON: {}", e))?;
    
    // Parse metrics and build cache map
    let mut namespace_metrics: HashMap<String, ContainerMetrics> = HashMap::new();
    let mut pod_count = 0;
    
    if let Some(items) = metrics_response.get("items").and_then(|v| v.as_array()) {
        for pod_metrics in items {
            let pod_name = pod_metrics
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            
            if pod_name.is_empty() {
                continue;
            }
            
            pod_count += 1;
            
            // Extract container metrics
            if let Some(containers) = pod_metrics.get("containers").and_then(|v| v.as_array()) {
                for container in containers {
                    let container_name = container
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    
                    if container_name.is_empty() {
                        continue;
                    }
                    
                    let cpu = container
                        .pointer("/usage/cpu")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-")
                        .to_string();
                    
                    let memory = container
                        .pointer("/usage/memory")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-")
                        .to_string();
                    
                    let key = format!("{}/{}", pod_name, container_name);
                    namespace_metrics.insert(key, ContainerMetrics { cpu, memory });
                }
            }
        }
    }
    
    // Update cache
    if let Ok(mut cache) = get_cache().write() {
        let ctx_cache = cache.entry(context).or_insert_with(HashMap::new);
        ctx_cache.insert(namespace, namespace_metrics);
    }
    
    Ok(MetricsCacheStatus {
        available: true,
        pod_count,
        error: None,
    })
}

/// Lookup metrics for a container from the cache.
/// Returns None if metrics are not available (graceful fallback).
pub fn get_container_metrics(
    context: &str,
    namespace: &str,
    pod_name: &str,
    container_name: &str,
) -> Option<ContainerMetrics> {
    let cache = get_cache().read().ok()?;
    let key = format!("{}/{}", pod_name, container_name);
    cache.get(context)?.get(namespace)?.get(&key).cloned()
}

/// Lookup metrics for an entire pod (sum of all containers).
/// Returns None if metrics are not available.
pub fn get_pod_metrics(
    context: &str,
    namespace: &str,
    pod_name: &str,
) -> Option<ContainerMetrics> {
    let cache = get_cache().read().ok()?;
    let ns_cache = cache.get(context)?.get(namespace)?;
    
    let prefix = format!("{}/", pod_name);
    let mut total_cpu_nano: u64 = 0;
    let mut total_memory_bytes: u64 = 0;
    let mut found = false;
    
    for (key, metrics) in ns_cache.iter() {
        if key.starts_with(&prefix) {
            found = true;
            total_cpu_nano += parse_cpu_to_nanocores(&metrics.cpu);
            total_memory_bytes += parse_memory_to_bytes(&metrics.memory);
        }
    }
    
    if !found {
        return None;
    }
    
    Some(ContainerMetrics {
        cpu: format_nanocores(total_cpu_nano),
        memory: format_bytes(total_memory_bytes),
    })
}

/// Parse CPU string (e.g., "125m", "1", "500n") to nanocores
pub fn parse_cpu_to_nanocores(cpu: &str) -> u64 {
    if cpu == "-" || cpu.is_empty() {
        return 0;
    }
    
    if let Some(stripped) = cpu.strip_suffix('n') {
        stripped.parse().unwrap_or(0)
    } else if let Some(stripped) = cpu.strip_suffix('u') {
        stripped.parse::<u64>().unwrap_or(0) * 1000
    } else if let Some(stripped) = cpu.strip_suffix('m') {
        stripped.parse::<u64>().unwrap_or(0) * 1_000_000
    } else {
        // Whole cores
        cpu.parse::<u64>().unwrap_or(0) * 1_000_000_000
    }
}

/// Parse memory string (e.g., "128Mi", "1Gi", "500Ki") to bytes
pub fn parse_memory_to_bytes(memory: &str) -> u64 {
    if memory == "-" || memory.is_empty() {
        return 0;
    }
    
    if let Some(stripped) = memory.strip_suffix("Ki") {
        stripped.parse::<u64>().unwrap_or(0) * 1024
    } else if let Some(stripped) = memory.strip_suffix("Mi") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024
    } else if let Some(stripped) = memory.strip_suffix("Gi") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024 * 1024
    } else if let Some(stripped) = memory.strip_suffix("Ti") {
        stripped.parse::<u64>().unwrap_or(0) * 1024 * 1024 * 1024 * 1024
    } else if let Some(stripped) = memory.strip_suffix('K') {
        stripped.parse::<u64>().unwrap_or(0) * 1000
    } else if let Some(stripped) = memory.strip_suffix('M') {
        stripped.parse::<u64>().unwrap_or(0) * 1000 * 1000
    } else if let Some(stripped) = memory.strip_suffix('G') {
        stripped.parse::<u64>().unwrap_or(0) * 1000 * 1000 * 1000
    } else {
        // Plain bytes
        memory.parse().unwrap_or(0)
    }
}

/// Format nanocores to human-readable string
fn format_nanocores(nanocores: u64) -> String {
    if nanocores >= 1_000_000_000 {
        format!("{}", nanocores / 1_000_000_000)
    } else if nanocores >= 1_000_000 {
        format!("{}m", nanocores / 1_000_000)
    } else if nanocores >= 1000 {
        format!("{}u", nanocores / 1000)
    } else {
        format!("{}n", nanocores)
    }
}

/// Format bytes to human-readable string
fn format_bytes(bytes: u64) -> String {
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
