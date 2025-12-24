import {useEffect, useState, useCallback, useRef} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import classes from './ResourceList.module.scss'
import {
  getCacheKey,
  loadCachedResources,
  saveCachedResources,
  getCacheAge, CachedTimestampedResources,
} from './resourceCache'

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
    {name: 'AGE', jsonPath: '.metadata.creationTimestamp'},
  ],
}

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


export function ResourceList({context, namespace, resourceType, onBack}: ResourceListProps) {
  const cacheKey = getCacheKey(context, namespace, resourceType)
  const isMountedRef = useRef(true)

  const [cachedData, setCachedData] = useState<CachedTimestampedResources | null>(null)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [columnConfig, setColumnConfig] = useState<ResourceTypeConfig>(DEFAULT_RESOURCE_CONFIG)
  const [resources, setResources] = useState<ResourceItem[]>([])

  // Async function to fetch and update resources
  const loadResources = useCallback(async () => {
    if (!isMountedRef.current) return
    
    setIsRefreshing(true)
    // Don't clear error here - only clear it on successful fetch
    // This preserves any existing error state until we have new data
    
    // Wait for React to flush state updates and re-render before starting async operation
    // Use requestAnimationFrame twice to ensure UI has updated
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })

    if (!isMountedRef.current) return

    try {
      const result = await invoke<ResourceListResponse>('get_resources', {
        resourceType,
        context,
        namespace,
      })
      
      if (!isMountedRef.current) return
      
      setResources(result.items)
      setColumnConfig({ columns: result.columns })
      saveCachedResources(cacheKey, result)
      setCachedData({ data: result, timestamp: Date.now() })
      setError(null) // Clear error only on successful fetch
    } catch (e) {
      if (!isMountedRef.current) return
      setError(String(e))
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }, [cacheKey, context, namespace, resourceType])

  // Load cached data immediately and trigger background fetch
  useEffect(() => {
    isMountedRef.current = true
    
    const cached = loadCachedResources(cacheKey)
    if (cached && cached.data) {
      // Set all cached data state synchronously
      setCachedData(cached)
      setResources(cached.data.items || [])
      setColumnConfig({ columns: cached.data.columns || [] })
      setError(null) // Clear any previous errors when showing cached data
      // Don't set isRefreshing here - let loadResources() handle it
      // This allows cached data to display immediately
    } else {
      // If no cached data, show loading state immediately
      setIsRefreshing(true)
    }
    
    // Defer background fetch to allow React to flush cached data updates first
    // Use requestAnimationFrame to ensure UI renders before starting fetch
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loadResources()
      })
    })

    return () => {
      isMountedRef.current = false
      cancelAnimationFrame(rafId)
    }
  }, [cacheKey, loadResources])

  const cacheTimestamp = cachedData?.timestamp ?? null

  const handleRefresh = useCallback(() => {
    // Defer to allow UI to update (button state, cursor, etc.) before starting async operation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loadResources()
      })
    })
  }, [loadResources])

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
        <button class={classes.refreshButton} onClick={handleRefresh} disabled={isRefreshing}>
          ↻ Refresh
        </button>
      </header>

      {error && (
        <div class={classes.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!error && (
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
                      {resource[col.name] ?? '<none>'}
                    </td>
                  ))}
                </tr>
              ))
            )}
            </tbody>
          </table>
        </div>
      )}

      {!error && resources.length > 0 && (
        <div class={classes.footer}>
          {resources.length} item{resources.length !== 1 ? 's' : ''}
        </div>
      )}

      {isRefreshing ? (
        <div class={classes.refreshIndicator}>
          {cacheTimestamp ? (
            <>
              <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
            </>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      ) : null}
    </div>
  )
}


