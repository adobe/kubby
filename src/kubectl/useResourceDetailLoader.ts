import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import {
  getDetailCacheKey,
  loadCachedDetail,
  saveCachedDetail,
} from './resourceCache'
import { ResourceDetailResponse } from './resourceTypes'

export interface ResourceDetailState {
  detail: ResourceDetailResponse | null;
  cacheTimestamp: number | null;
  isRefreshing: boolean;
  error: string | null;
  detailCacheKey: string; // Track which cache key this detail belongs to
}

interface UseResourceDetailLoaderOptions {
  context: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
}

/**
 * Custom hook for loading resource details with cache-first strategy.
 * 
 * Flow:
 * 1. Initialize with cached data synchronously (before first render)
 * 2. Start background refresh automatically
 * 3. Update state when fresh data arrives
 */
export function useResourceDetailLoader({ context, namespace, resourceType, resourceName }: UseResourceDetailLoaderOptions) {
  const cacheKey = getDetailCacheKey(context, namespace, resourceType, resourceName)
  const isMountedRef = useRef(true)
  const prevCacheKeyRef = useRef(cacheKey)
  const currentCacheKeyRef = useRef(cacheKey) // Track which cacheKey we expect results for
  
  // Keep currentCacheKeyRef in sync with cacheKey
  currentCacheKeyRef.current = cacheKey

  // Initialize state lazily with cached data (runs synchronously before first render)
  const [state, setState] = useState<ResourceDetailState>(() => {
    const cached = loadCachedDetail(cacheKey)
    if (cached?.data) {
      return {
        detail: cached.data,
        cacheTimestamp: cached.timestamp,
        isRefreshing: true, // Will start refreshing immediately
        error: null,
        detailCacheKey: cacheKey,
      }
    }
    return {
      detail: null,
      cacheTimestamp: null,
      isRefreshing: true, // Loading state
      error: null,
      detailCacheKey: cacheKey,
    }
  })

  // Handle cacheKey changes after initial mount (e.g., when resource changes)
  useEffect(() => {
    if (prevCacheKeyRef.current === cacheKey) return
    prevCacheKeyRef.current = cacheKey

    const cached = loadCachedDetail(cacheKey)

    // Update state with cached data (or null) and set refreshing
    setState({
      detail: cached?.data || null,
      cacheTimestamp: cached?.timestamp || null,
      isRefreshing: true,
      error: null,
      detailCacheKey: cacheKey,
    })
  }, [cacheKey])

  // Fetch function - doesn't touch state except at the end
  const fetchDetail = useCallback(async () => {
    // Capture the cacheKey at fetch start to detect stale responses
    const fetchCacheKey = cacheKey
    
    try {
      const result = await invoke<ResourceDetailResponse>('get_resource_detail', {
        resourceType,
        resourceName,
        context,
        namespace,
      })

      // Ignore stale results if cacheKey has changed (user navigated away)
      if (currentCacheKeyRef.current !== fetchCacheKey) return

      // Save result to cache
      saveCachedDetail(cacheKey, result)

      // Update state with fresh data
      setState(prev => ({
        ...prev,
        detail: result,
        cacheTimestamp: Date.now(),
        isRefreshing: false,
        error: null,
        detailCacheKey: fetchCacheKey,
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
  }, [cacheKey, context, namespace, resourceType, resourceName])

  // Start background fetch after mount
  useEffect(() => {
    isMountedRef.current = true

    // Use requestAnimationFrame to ensure UI renders before starting fetch
    const rafId = requestAnimationFrame(() => {
      if (isMountedRef.current) {
        fetchDetail()
      }
    })

    return () => {
      isMountedRef.current = false
      cancelAnimationFrame(rafId)
    }
  }, [fetchDetail])

  // Manual refresh function
  const refresh = useCallback(() => {
    setState(prev => ({ ...prev, isRefreshing: true }))
    fetchDetail()
  }, [fetchDetail])

  // Check if the current detail is stale (doesn't match current cache key)
  const isStale = state.detailCacheKey !== cacheKey

  return {
    ...state,
    detail: isStale ? null : state.detail, // Return null if stale to avoid showing wrong data
    refresh,
    isStale,
  }
}
