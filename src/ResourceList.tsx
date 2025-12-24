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

interface ResourceListResponse {
  columns: ColumnConfig[];
  items: ResourceItem[];
}

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  onBack: () => void;
}


export function ResourceList({ context, namespace, resourceType, onBack }: ResourceListProps) {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnConfig, setColumnConfig] = useState<ResourceTypeConfig>(DEFAULT_RESOURCE_CONFIG);
  
  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await invoke<ResourceListResponse>("get_resources", {
        resourceType,
        context,
        namespace,
      });
      
      setColumnConfig({ columns: response.columns });
      setResources(response.items);
    } catch (e) {
      setError(String(e));
      // Fall back to default config on error
      setColumnConfig(DEFAULT_RESOURCE_CONFIG);
    } finally {
      setLoading(false);
    }
  }, [context, namespace, resourceType]);
  
  // Refresh handler
  const handleRefresh = useCallback(async () => {
    await fetchResources();
  }, [fetchResources]);
  
  // Fetch resources on mount and when dependencies change
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
        <button class={classes.refreshButton} onClick={handleRefresh} disabled={loading}>
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
                {columnConfig.columns.map((col) => (
                <th key={col.name}>
                  {col.name}
                </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.length === 0 ? (
                <tr>
                  <td colSpan={columnConfig.columns.length + 1} class={classes.emptyRow}>
                    No resources found
                  </td>
                </tr>
              ) : (
                resources.map((resource) => (
                  <tr key={resource.name} class={classes.resourceRow}>
                    <td class={classes.nameCell}>{resource.name}</td>
                    {columnConfig.columns.map((col) => (
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


