import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import {
  getCacheKey,
  loadCachedResources,
  saveCachedResources,
} from './resourceCache'
import { ResourceListResponse, ColumnConfig, ResourceItem } from './resourceTypes'

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
}

/**
 * Custom hook for loading resources with cache-first strategy.
 * 
 * Flow:
 * 1. Initialize with cached data synchronously (before first render)
 * 2. Start background refresh automatically
 * 3. Update state when fresh data arrives
 */
export function useResourceLoader({ context, namespace, resourceType }: UseResourceLoaderOptions) {
  const cacheKey = getCacheKey(context, namespace, resourceType)
  const isMountedRef = useRef(true)

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

  // Fetch function - doesn't touch state except at the end
  const fetchResources = useCallback(async () => {
    try {
      const result = await invoke<ResourceListResponse>('get_resources', {
        resourceType,
        context,
        namespace,
      })

      if (!isMountedRef.current) return

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
      if (!isMountedRef.current) return

      setState(prev => ({
        ...prev,
        isRefreshing: false,
        error: String(e),
      }))
    }
  }, [cacheKey, context, namespace, resourceType])

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
