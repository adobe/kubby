import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import {
  getCacheKey,
  loadCachedResources,
  saveCachedResources,
} from './resourceCache'
import { ResourceListResponse, ColumnConfig, ResourceItem, LabelSelector } from './resourceTypes'

export interface ResourceState {
  resources: ResourceItem[];
  columns: ColumnConfig[];
  cacheTimestamp: number | null;
  isRefreshing: boolean;
  error: string | null;
}

interface UseResourceLoaderOptions {
  context: string;
  namespace: string;
  resourceType: string;
  labelSelectors?: LabelSelector[];
}

/**
 * Custom hook for loading resources with cache-first strategy.
 * 
 * Flow:
 * 1. Initialize with cached data synchronously (before first render)
 * 2. Start background refresh automatically
 * 3. Update state when fresh data arrives
 */
export function useResourceLoader({ context, namespace, resourceType, labelSelectors }: UseResourceLoaderOptions) {
  const cacheKey = getCacheKey(context, namespace, resourceType, labelSelectors)
  const baseCacheKey = getCacheKey(context, namespace, resourceType) // no labelSelectors
  const isMountedRef = useRef(true)
  const prevCacheKeyRef = useRef(cacheKey)
  const currentCacheKeyRef = useRef(cacheKey) // Track which cacheKey we expect results for
  
  // Keep currentCacheKeyRef in sync with cacheKey
  currentCacheKeyRef.current = cacheKey

  // Initialize state lazily with cached data (runs synchronously before first render)
  const [state, setState] = useState<ResourceState>(() => {
    const cached = loadCachedResources(cacheKey)
    if (cached?.data) {
      return {
        resources: cached.data.items || [],
        columns: cached.data.columns || [],
        cacheTimestamp: cached.timestamp,
        isRefreshing: true, // Will start refreshing immediately
        error: null,
      }
    }
    return {
      resources: [],
      columns: [],
      cacheTimestamp: null,
      isRefreshing: true, // Loading state
      error: null,
    }
  })

  // Handle cacheKey changes after initial mount (e.g., when filters change)
  useEffect(() => {
    if (prevCacheKeyRef.current === cacheKey) return
    prevCacheKeyRef.current = cacheKey

    // Try loading from exact cache key first
    let cached = loadCachedResources(cacheKey)

    // If no cache for filtered key, try base (unfiltered) cache
    if (!cached?.data && labelSelectors?.length) {
      const baseCache = loadCachedResources(baseCacheKey)
      if (baseCache?.data) {
        // Filter items client-side
        const filteredItems = baseCache.data.items.filter(item =>
          labelSelectors.every(selector =>
            item.labels?.some(l => l.key === selector.key && l.value === selector.value)
          )
        )
        cached = {
          data: { ...baseCache.data, items: filteredItems },
          timestamp: baseCache.timestamp,
        }
      }
    }

    // Update state with cached data (or empty) and set refreshing
    setState({
      resources: cached?.data?.items || [],
      columns: cached?.data?.columns || [],
      cacheTimestamp: cached?.timestamp || null,
      isRefreshing: true,
      error: null,
    })
  }, [cacheKey, baseCacheKey, labelSelectors])

  // Fetch function - doesn't touch state except at the end
  const fetchResources = useCallback(async () => {
    // Capture the cacheKey at fetch start to detect stale responses
    const fetchCacheKey = cacheKey
    
    try {
      const result = await invoke<ResourceListResponse>('get_resources', {
        resourceType,
        context,
        namespace,
        labelSelectors: labelSelectors || [],
      })

      // Ignore stale results if cacheKey has changed (user navigated away)
      if (currentCacheKeyRef.current !== fetchCacheKey) return

      // Save to cache
      saveCachedResources(cacheKey, result)

      // Update state with fresh data
      setState(prev => ({
        ...prev,
        resources: result.items,
        columns: result.columns,
        cacheTimestamp: Date.now(),
        isRefreshing: false,
        error: null,
      }))
    } catch (e) {
      // Ignore stale errors if cacheKey has changed (user navigated away)
      if (currentCacheKeyRef.current !== fetchCacheKey) return

      setState(prev => ({
        ...prev,
        isRefreshing: false,
        error: String(e),
      }))
    }
  }, [cacheKey, context, namespace, resourceType, labelSelectors])

  // Start background fetch after mount
  useEffect(() => {
    isMountedRef.current = true

    // Use requestAnimationFrame to ensure UI renders before starting fetch
    const rafId = requestAnimationFrame(() => {
      if (isMountedRef.current) {
        fetchResources()
      }
    })

    return () => {
      isMountedRef.current = false
      cancelAnimationFrame(rafId)
    }
  }, [fetchResources])

  // Manual refresh function
  const refresh = useCallback(() => {
    setState(prev => ({ ...prev, isRefreshing: true }))
    fetchResources()
  }, [fetchResources])

  return {
    ...state,
    refresh,
  }
}
