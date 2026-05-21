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

import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
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
  evaluationError: string | null;
  resourcesCacheKey: string; // Track which cache key these resources belong to
}

/** Spec filter for backend filtering by JSON path */
export interface SpecFilterParam {
  path: string;
  value: string;
}

interface UseResourceLoaderOptions {
  context: string;
  namespace: string;
  resourceType: string;
  labelSelectors?: LabelSelector[];
  parentResourceName?: string; // For containers view: the pod name
  specFilters?: SpecFilterParam[]; // Spec-based filters for related resources
}

/**
 * Filter resources by label selectors (client-side filtering)
 */
function filterByLabels(items: ResourceItem[], labelSelectors?: LabelSelector[]): ResourceItem[] {
  if (!labelSelectors?.length) return items
  return items.filter(item =>
    labelSelectors.every(selector =>
      item.labels?.some(l => l.key === selector.key && l.value === selector.value)
    )
  )
}

/**
 * Custom hook for loading resources with cache-first strategy.
 * 
 * Flow:
 * 1. Initialize with cached data synchronously (before first render)
 * 2. Start background refresh automatically
 * 3. Update state when fresh data arrives
 * 4. Apply label filtering client-side
 */
export function useResourceLoader({ context, namespace, resourceType, labelSelectors, parentResourceName, specFilters }: UseResourceLoaderOptions) {
  // Build cache key that includes spec filters for uniqueness
  const specFilterKey = specFilters?.length
    ? `:spec:${specFilters.map(f => `${f.path}=${f.value}`).join(',')}`
    : ''
  
  // For containers, include pod name in cache key; otherwise use standard key
  const cacheKey = resourceType === 'containers' && parentResourceName
    ? getCacheKey(context, namespace, `containers:${parentResourceName}`)
    : getCacheKey(context, namespace, resourceType + specFilterKey)
  const isMountedRef = useRef(true)
  const prevCacheKeyRef = useRef(cacheKey)
  const currentCacheKeyRef = useRef(cacheKey) // Track which cacheKey we expect results for
  const fetchInProgressRef = useRef(false) // Guard against concurrent fetches
  
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
        evaluationError: cached.data.evaluationError || null,
        resourcesCacheKey: cacheKey,
      }
    }
    return {
      resources: [],
      columns: [],
      cacheTimestamp: null,
      isRefreshing: true, // Loading state
      error: null,
      evaluationError: null,
      resourcesCacheKey: cacheKey,
    }
  })

  // Handle cacheKey changes after initial mount (e.g., when resource type changes)
  useEffect(() => {
    if (prevCacheKeyRef.current === cacheKey) return
    prevCacheKeyRef.current = cacheKey

    const cached = loadCachedResources(cacheKey)

    // Update state with cached data (or empty) and set refreshing
    setState({
      resources: cached?.data?.items || [],
      columns: cached?.data?.columns || [],
      cacheTimestamp: cached?.timestamp || null,
      isRefreshing: true,
      error: null,
      evaluationError: cached?.data?.evaluationError || null,
      resourcesCacheKey: cacheKey,
    })
  }, [cacheKey])

  // Fetch function - doesn't touch state except at the end
  const fetchResources = useCallback(async () => {
    // Prevent concurrent fetches to avoid race conditions causing UI flickering
    if (fetchInProgressRef.current) return
    fetchInProgressRef.current = true
    
    // Capture the cacheKey at fetch start to detect stale responses
    const fetchCacheKey = cacheKey
    
    try {
      let result: ResourceListResponse
      
      if (resourceType === 'containers' && parentResourceName) {
        // Special case: fetch containers from a specific pod
        result = await invoke<ResourceListResponse>('get_pod_containers', {
          context,
          namespace,
          podName: parentResourceName,
        })
      } else {
        // Standard case: fetch all resources with optional spec filters
        result = await invoke<ResourceListResponse>('get_resources', {
          resourceType,
          context,
          namespace,
          labelSelectors: [],
          specFilters: specFilters?.length ? specFilters : null,
        })
      }

      // Ignore stale results if cacheKey has changed (user navigated away)
      if (currentCacheKeyRef.current !== fetchCacheKey) {
        return
      }

      // Save full (unfiltered) result to cache
      saveCachedResources(cacheKey, result)

      // Update state with fresh data (unfiltered)
      setState(prev => ({
        ...prev,
        resources: result.items,
        columns: result.columns,
        cacheTimestamp: Date.now(),
        isRefreshing: false,
        error: null,
        evaluationError: result.evaluationError || null,
        resourcesCacheKey: fetchCacheKey,
      }))
    } catch (e) {
      // Ignore stale errors if cacheKey has changed (user navigated away)
      if (currentCacheKeyRef.current !== fetchCacheKey) {
        return
      }

      setState(prev => ({
        ...prev,
        isRefreshing: false,
        // Always show the error so user knows there's a connection issue
        // The table will still display cached data if available (handled in ResourceList)
        error: String(e),
      }))
    } finally {
      fetchInProgressRef.current = false
    }
  }, [cacheKey, context, namespace, resourceType, parentResourceName, specFilters])

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

  // Apply client-side filtering based on label selectors
  // Only return resources if they belong to the current cache key to avoid
  // showing stale/unfiltered data during navigation transitions
  const isStale = state.resourcesCacheKey !== cacheKey
  const filteredResources = useMemo(() => {
    if (isStale) {
      return [] // Resources are stale, return empty while loading new data
    }
    return filterByLabels(state.resources, labelSelectors)
  }, [state.resources, isStale, labelSelectors])

  return {
    ...state,
    resources: filteredResources,
    refresh,
    fetchResources, // Expose for silent auto-refresh
    isStale, // True when resources don't match the current cache key (during transitions)
  }
}
