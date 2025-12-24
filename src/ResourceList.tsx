import { useEffect, useState, useCallback, useRef } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./ResourceList.module.scss";
import {
  getCacheKey,
  getCachedResources,
  setCachedResources,
  getCacheAge,
} from "./resourceCache";

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

export interface ResourceListResponse {
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
  const cacheKey = getCacheKey(context, namespace, resourceType);
  
  // Initialize state from cache synchronously if available
  const cachedData = getCachedResources(cacheKey);
  const initialResources = cachedData?.data.items || [];
  const initialColumnConfig = cachedData?.data.columns 
    ? { columns: cachedData.data.columns }
    : DEFAULT_RESOURCE_CONFIG;
  const initialLoading = cachedData === null;
  const initialCacheTimestamp = cachedData?.timestamp || null;
  
  const [resources, setResources] = useState<ResourceItem[]>(initialResources);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);
  const [columnConfig, setColumnConfig] = useState<ResourceTypeConfig>(initialColumnConfig);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(initialCacheTimestamp);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const fetchResources = useCallback(async (skipCache: boolean = false, isBackground: boolean = false) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Check if we have cached data
    const cached = getCachedResources(cacheKey);
    const hasCachedData = !skipCache && cached !== null;
    
    // Set loading state only if this is NOT a background refresh AND we don't have cache
    // NEVER set loading to true if we have cached data or if this is a background refresh
    if (!isBackground && !hasCachedData) {
      setLoading(true);
    } else if (hasCachedData || isBackground) {
      // Ensure loading is false when we have cache or doing background refresh
      setLoading(false);
    }
    
    // Always show refresh indicator for background refreshes or manual refreshes
    if (isBackground || skipCache) {
      setIsRefreshing(true);
    }
    // Clear error when starting a new fetch (only if we have cached data, otherwise keep error for initial load)
    if (hasCachedData) {
      setError(null);
    }
    
    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const response = await invoke<ResourceListResponse>("get_resources", {
        resourceType,
        context,
        namespace,
      });
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        if (isBackground || skipCache) {
          setIsRefreshing(false);
        }
        return;
      }
      
      // Update cache and UI
      setCachedResources(cacheKey, response);
      setColumnConfig({ columns: response.columns });
      setResources(response.items);
      setCacheTimestamp(Date.now());
      setError(null);
      setLoading(false);
    } catch (e) {
      // Check if request was aborted
      if (abortController.signal.aborted) {
        if (isBackground || skipCache) {
          setIsRefreshing(false);
        }
        return;
      }
      
      // If we have cached data, show error but keep cached data visible
      if (hasCachedData) {
        setError(String(e));
        setLoading(false);
      } else {
        // No cache, show error normally
        setError(String(e));
        setColumnConfig(DEFAULT_RESOURCE_CONFIG);
        setLoading(false);
      }
    } finally {
      if (!abortController.signal.aborted && (isBackground || skipCache)) {
        setIsRefreshing(false);
      }
    }
  }, [context, namespace, resourceType, cacheKey]);
  
  // Refresh handler - force refresh
  const handleRefresh = useCallback(async () => {
    setError(null);
    setIsRefreshing(true);
    await fetchResources(true, false);
  }, [fetchResources]);

  // Fetch resources on mount and when dependencies change
  useEffect(() => {
    const cached = getCachedResources(cacheKey);
    
    if (cached) {
      // We already have cached data loaded in initial state
      // Use requestAnimationFrame to ensure initial render completes first
      // Then start background refresh
      const rafId = requestAnimationFrame(() => {
        setIsRefreshing(true);
        // Start the background fetch in the next frame
        requestAnimationFrame(() => {
          fetchResources(false, true);
        });
      });
      
      // Cleanup
      return () => {
        cancelAnimationFrame(rafId);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    } else {
      // No cache, do a normal fetch (will show loading)
      fetchResources(false, false);
      
      // Cleanup
      return () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
  }, [cacheKey, fetchResources]);
  
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
        <button class={classes.refreshButton} onClick={handleRefresh} disabled={isRefreshing || loading}>
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
      
      {isRefreshing && cacheTimestamp ? (
        <div class={classes.refreshIndicator}>
          <span class={classes.refreshSpinner}>😎</span>
          <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
        </div>
      ) : null}
    </div>
  );
}


