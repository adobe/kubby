import { ResourceListResponse, ResourceDetailResponse } from "./resourceTypes";

interface CachedResourceData {
  data: ResourceListResponse;
  timestamp: number;
}

interface CachedDetailData {
  data: ResourceDetailResponse;
  timestamp: number;
}

const CACHE_PREFIX = "resource_cache:";
const DETAIL_CACHE_PREFIX = "detail_cache:";

/**
 * Generate a cache key from context, namespace, and resource type
 */
export function getCacheKey(
  context: string,
  namespace: string,
  resourceType: string
): string {
  const sanitize = (str: string) => str.replace(/[:]/g, "_");
  return `${CACHE_PREFIX}${sanitize(context)}:${sanitize(namespace)}:${sanitize(resourceType)}`;
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

/**
 * Generate a cache key for resource detail (single resource)
 */
export function getDetailCacheKey(
  context: string,
  namespace: string,
  resourceType: string,
  resourceName: string
): string {
  const sanitize = (str: string) => str.replace(/[:]/g, "_");
  return `${DETAIL_CACHE_PREFIX}${sanitize(context)}:${sanitize(namespace)}:${sanitize(resourceType)}:${sanitize(resourceName)}`;
}

export type CachedTimestampedDetail = { data: ResourceDetailResponse; timestamp: number }

/**
 * Get cached resource detail with timestamp
 */
export function loadCachedDetail(
  key: string
): CachedTimestampedDetail | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) {
      return null;
    }

    const parsed: CachedDetailData = JSON.parse(cached);
    if (!parsed.data || !parsed.timestamp) {
      return null;
    }

    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
    };
  } catch (e) {
    // If cache is corrupted, return null
    console.warn("Failed to read detail cache:", e);
    return null;
  }
}

/**
 * Store resource detail in cache with current timestamp
 */
export function saveCachedDetail(
  key: string,
  data: ResourceDetailResponse
): void {
  try {
    const cached: CachedDetailData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    // If storage is full or unavailable, log warning but don't throw
    console.warn("Failed to write detail cache:", e);
  }
}
