import { useEffect, useState, useCallback } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./ResourceList.module.scss";

// Column configuration for each resource type
interface ColumnConfig {
  name: string;
  jsonPath: string;
}

interface ResourceTypeConfig {
  columns: ColumnConfig[];
}

// Static configuration for resource types matching kubectl defaults
const RESOURCE_CONFIGS: Record<string, ResourceTypeConfig> = {
  pods: {
    columns: [
      { name: "READY", jsonPath: ".status.containerStatuses[*].ready" },
      { name: "STATUS", jsonPath: ".status.phase" },
      { name: "RESTARTS", jsonPath: ".status.containerStatuses[0].restartCount" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  deployments: {
    columns: [
      { name: "READY", jsonPath: ".status.readyReplicas/.spec.replicas" },
      { name: "UP-TO-DATE", jsonPath: ".status.updatedReplicas" },
      { name: "AVAILABLE", jsonPath: ".status.availableReplicas" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  services: {
    columns: [
      { name: "TYPE", jsonPath: ".spec.type" },
      { name: "CLUSTER-IP", jsonPath: ".spec.clusterIP" },
      { name: "EXTERNAL-IP", jsonPath: ".status.loadBalancer.ingress[0].ip" },
      { name: "PORT(S)", jsonPath: ".spec.ports[*]" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  configmaps: {
    columns: [
      { name: "DATA", jsonPath: ".data" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  secrets: {
    columns: [
      { name: "TYPE", jsonPath: ".type" },
      { name: "DATA", jsonPath: ".data" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  nodes: {
    columns: [
      { name: "STATUS", jsonPath: ".status.conditions[-1].type" },
      { name: "ROLES", jsonPath: ".metadata.labels['node-role.kubernetes.io/']" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
      { name: "VERSION", jsonPath: ".status.nodeInfo.kubeletVersion" },
    ],
  },
  namespaces: {
    columns: [
      { name: "STATUS", jsonPath: ".status.phase" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  persistentvolumeclaims: {
    columns: [
      { name: "STATUS", jsonPath: ".status.phase" },
      { name: "VOLUME", jsonPath: ".spec.volumeName" },
      { name: "CAPACITY", jsonPath: ".status.capacity.storage" },
      { name: "ACCESS MODES", jsonPath: ".status.accessModes[*]" },
      { name: "STORAGECLASS", jsonPath: ".spec.storageClassName" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  persistentvolumes: {
    columns: [
      { name: "CAPACITY", jsonPath: ".spec.capacity.storage" },
      { name: "ACCESS MODES", jsonPath: ".spec.accessModes[*]" },
      { name: "RECLAIM POLICY", jsonPath: ".spec.persistentVolumeReclaimPolicy" },
      { name: "STATUS", jsonPath: ".status.phase" },
      { name: "CLAIM", jsonPath: ".spec.claimRef.name" },
      { name: "STORAGECLASS", jsonPath: ".spec.storageClassName" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  ingresses: {
    columns: [
      { name: "CLASS", jsonPath: ".spec.ingressClassName" },
      { name: "HOSTS", jsonPath: ".spec.rules[*].host" },
      { name: "ADDRESS", jsonPath: ".status.loadBalancer.ingress[0].ip" },
      { name: "PORTS", jsonPath: ".spec.tls" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  statefulsets: {
    columns: [
      { name: "READY", jsonPath: ".status.readyReplicas/.spec.replicas" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  daemonsets: {
    columns: [
      { name: "DESIRED", jsonPath: ".status.desiredNumberScheduled" },
      { name: "CURRENT", jsonPath: ".status.currentNumberScheduled" },
      { name: "READY", jsonPath: ".status.numberReady" },
      { name: "UP-TO-DATE", jsonPath: ".status.updatedNumberScheduled" },
      { name: "AVAILABLE", jsonPath: ".status.numberAvailable" },
      { name: "NODE SELECTOR", jsonPath: ".spec.template.spec.nodeSelector" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  replicasets: {
    columns: [
      { name: "DESIRED", jsonPath: ".spec.replicas" },
      { name: "CURRENT", jsonPath: ".status.replicas" },
      { name: "READY", jsonPath: ".status.readyReplicas" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  jobs: {
    columns: [
      { name: "COMPLETIONS", jsonPath: ".status.succeeded/.spec.completions" },
      { name: "DURATION", jsonPath: ".status.completionTime" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  cronjobs: {
    columns: [
      { name: "SCHEDULE", jsonPath: ".spec.schedule" },
      { name: "SUSPEND", jsonPath: ".spec.suspend" },
      { name: "ACTIVE", jsonPath: ".status.active" },
      { name: "LAST SCHEDULE", jsonPath: ".status.lastScheduleTime" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  events: {
    columns: [
      { name: "TYPE", jsonPath: ".type" },
      { name: "REASON", jsonPath: ".reason" },
      { name: "OBJECT", jsonPath: ".involvedObject.name" },
      { name: "MESSAGE", jsonPath: ".message" },
    ],
  },
  serviceaccounts: {
    columns: [
      { name: "SECRETS", jsonPath: ".secrets" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  roles: {
    columns: [
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  rolebindings: {
    columns: [
      { name: "ROLE", jsonPath: ".roleRef.name" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  clusterroles: {
    columns: [
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  clusterrolebindings: {
    columns: [
      { name: "ROLE", jsonPath: ".roleRef.name" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  horizontalpodautoscalers: {
    columns: [
      { name: "REFERENCE", jsonPath: ".spec.scaleTargetRef.name" },
      { name: "TARGETS", jsonPath: ".status.currentMetrics" },
      { name: "MINPODS", jsonPath: ".spec.minReplicas" },
      { name: "MAXPODS", jsonPath: ".spec.maxReplicas" },
      { name: "REPLICAS", jsonPath: ".status.currentReplicas" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
  networkpolicies: {
    columns: [
      { name: "POD-SELECTOR", jsonPath: ".spec.podSelector.matchLabels" },
      { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
    ],
  },
};

// Default config for unknown resource types
const DEFAULT_RESOURCE_CONFIG: ResourceTypeConfig = {
  columns: [
    { name: "AGE", jsonPath: ".metadata.creationTimestamp" },
  ],
};

interface ResourceItem {
  name: string;
  [key: string]: string | number | null;
}

interface KubectlOutput {
  stdout: string;
  stderr: string;
}

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  onBack: () => void;
}

function formatAge(timestamp: string): string {
  if (!timestamp) return "<unknown>";
  
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function extractValue(obj: any, jsonPath: string): string {
  if (!obj) return "<none>";
  
  // Handle special composite paths like ".status.readyReplicas/.spec.replicas"
  if (jsonPath.includes("/")) {
    const [numeratorPath, denominatorPath] = jsonPath.split("/");
    const numerator = extractValue(obj, numeratorPath);
    const denominator = extractValue(obj, denominatorPath);
    return `${numerator}/${denominator}`;
  }
  
  // Remove leading dot
  const path = jsonPath.startsWith(".") ? jsonPath.slice(1) : jsonPath;
  const parts = path.split(".");
  
  let current: any = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return "<none>";
    }
    
    // Handle array access like [0] or [*] or [-1]
    const arrayMatch = part.match(/^(.+?)\[(.+?)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      
      if (!Array.isArray(current)) {
        return "<none>";
      }
      
      if (index === "*") {
        // Return all array values joined
        current = current.map((item: any) => {
          if (typeof item === "object") {
            // For ports, format nicely
            if (item.port !== undefined) {
              const targetPort = item.targetPort ? `:${item.targetPort}` : "";
              const protocol = item.protocol ? `/${item.protocol}` : "";
              return `${item.port}${targetPort}${protocol}`;
            }
            return JSON.stringify(item);
          }
          return String(item);
        }).join(",");
      } else if (index === "-1") {
        current = current[current.length - 1];
      } else {
        current = current[parseInt(index, 10)];
      }
    } else if (part.includes("['") && part.includes("']")) {
      // Handle label-style access like labels['node-role.kubernetes.io/']
      const labelMatch = part.match(/^(.+?)\['(.+?)'\]$/);
      if (labelMatch) {
        const [, key, labelPrefix] = labelMatch;
        current = current[key];
        if (current && typeof current === "object") {
          // Find keys that start with the prefix
          const matchingKeys = Object.keys(current).filter(k => k.startsWith(labelPrefix));
          if (matchingKeys.length > 0) {
            current = matchingKeys.map(k => k.replace(labelPrefix, "") || "master").join(",");
          } else {
            current = "<none>";
          }
        }
      }
    } else {
      current = current[part];
    }
  }
  
  if (current === null || current === undefined) {
    return "<none>";
  }
  
  // Format different types
  if (Array.isArray(current)) {
    return current.length.toString();
  }
  
  if (typeof current === "object") {
    const keys = Object.keys(current);
    return keys.length.toString();
  }
  
  if (typeof current === "boolean") {
    return current ? "True" : "False";
  }
  
  return String(current);
}

function parseKubectlJson(stdout: string, resourceType: string): ResourceItem[] {
  try {
    const data = JSON.parse(stdout);
    const config = RESOURCE_CONFIGS[resourceType] || DEFAULT_RESOURCE_CONFIG;
    
    const items = data.items || [data];
    
    return items.map((item: any) => {
      const result: ResourceItem = {
        name: item.metadata?.name || "<unknown>",
      };
      
      for (const col of config.columns) {
        let value = extractValue(item, col.jsonPath);
        
        // Special handling for AGE column
        if (col.name === "AGE" || col.name === "LAST SCHEDULE") {
          value = formatAge(value);
        }
        
        // Special handling for READY column in pods
        if (col.name === "READY" && resourceType === "pods") {
          const statuses = item.status?.containerStatuses || [];
          const ready = statuses.filter((s: any) => s.ready).length;
          const total = statuses.length;
          value = `${ready}/${total}`;
        }
        
        // Special handling for RESTARTS
        if (col.name === "RESTARTS") {
          const statuses = item.status?.containerStatuses || [];
          const restarts = statuses.reduce((sum: number, s: any) => sum + (s.restartCount || 0), 0);
          value = String(restarts);
        }
        
        // Special handling for PORTS in ingress
        if (col.name === "PORTS" && resourceType === "ingresses") {
          value = item.spec?.tls ? "80, 443" : "80";
        }
        
        result[col.name] = value;
      }
      
      return result;
    });
  } catch (e) {
    console.error("Failed to parse kubectl output:", e);
    return [];
  }
}

export function ResourceList({ context, namespace, resourceType, onBack }: ResourceListProps) {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const config = RESOURCE_CONFIGS[resourceType] || DEFAULT_RESOURCE_CONFIG;
  
  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const args = [
        "get",
        resourceType,
        "--context",
        context,
        "-n",
        namespace,
        "-o",
        "json",
      ];
      
      const result = await invoke<KubectlOutput>("kubectl", { args });
      const items = parseKubectlJson(result.stdout, resourceType);
      setResources(items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [context, namespace, resourceType]);
  
  useEffect(() => {
    fetchResources();
  }, [fetchResources]);
  
  return (
    <div class={classes.resourceList}>
      <header class={classes.header}>
        <button class={classes.backButton} onClick={onBack}>
          ← Back
        </button>
        <div class={classes.headerInfo}>
          <h1 class={classes.title}>{resourceType}</h1>
          <span class={classes.context}>{context}</span>
          <span class={classes.separator}>•</span>
          <span class={classes.namespace}>{namespace}</span>
        </div>
        <button class={classes.refreshButton} onClick={fetchResources} disabled={loading}>
          ↻ Refresh
        </button>
      </header>
      
      {loading && (
        <div class={classes.loading}>
          <span class={classes.spinner}>⟳</span>
          Loading {resourceType}...
        </div>
      )}
      
      {error && (
        <div class={classes.error}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {!loading && !error && (
        <div class={classes.tableWrapper}>
          <table class={classes.table}>
            <thead>
              <tr>
                <th class={classes.nameColumn}>NAME</th>
                {config.columns.map((col) => (
                <th key={col.name}>
                  {col.name}
                </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} class={classes.emptyRow}>
                    No resources found
                  </td>
                </tr>
              ) : (
                resources.map((resource) => (
                  <tr key={resource.name} class={classes.resourceRow}>
                    <td class={classes.nameCell}>{resource.name}</td>
                    {config.columns.map((col) => (
                      <td key={col.name} class={classes.dataCell}>
                        {resource[col.name] ?? "<none>"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {!loading && !error && resources.length > 0 && (
        <div class={classes.footer}>
          {resources.length} item{resources.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// Export the available resource types for use in other components
export const AVAILABLE_RESOURCE_TYPES = Object.keys(RESOURCE_CONFIGS);

