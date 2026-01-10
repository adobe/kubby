import { ResourceListResponse, LabelSelector } from "./resourceTypes";

interface CachedResourceData {
  data: ResourceListResponse;
  timestamp: number;
}

const CACHE_PREFIX = "resource_cache:";

/**
 * Generate a cache key from context, namespace, resource type, and optional label selectors
 */
export function getCacheKey(
  context: string,
  namespace: string,
  resourceType: string,
  labelSelectors?: LabelSelector[]
): string {
  // Sanitize the key components to avoid issues with special characters
  const sanitize = (str: string) => str.replace(/[:]/g, "_");
  
  let key = `${CACHE_PREFIX}${sanitize(context)}:${sanitize(namespace)}:${sanitize(resourceType)}`;
  
  // Include label selectors in cache key if provided
  if (labelSelectors && labelSelectors.length > 0) {
    const selectorString = labelSelectors
      .map(ls => `${sanitize(ls.key)}=${sanitize(ls.value)}`)
      .join(",");
    key += `:labels:${selectorString}`;
  }
  
  return key;
}

export type CachedTimestampedResources = { data: ResourceListResponse; timestamp: number }

/**
 * Get cached resource data with timestamp
 */
export function loadCachedResources(
  key: string
): CachedTimestampedResources | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) {
      return null;
    }

    const parsed: CachedResourceData = JSON.parse(cached);
    if (!parsed.data || !parsed.timestamp) {
      return null;
    }

    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
    };
  } catch (e) {
    // If cache is corrupted, return null
    console.warn("Failed to read cache:", e);
    return null;
  }
}

/**
 * Store resource data in cache with current timestamp
 */
export function saveCachedResources(
  key: string,
  data: ResourceListResponse
): void {
  try {
    const cached: CachedResourceData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    // If storage is full or unavailable, log warning but don't throw
    console.warn("Failed to write cache:", e);
  }
}

/**
 * Format cache age as a human-readable string
 */
export function getCacheAge(timestamp: number | null): string {
  if (timestamp === null) {
    return "∞";
  }
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds <= 1 ? "just now" : `${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

