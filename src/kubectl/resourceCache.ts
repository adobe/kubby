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
const MAX_CACHE_BYTES = 5 * 1024 * 1024;

interface CacheEntry {
  key: string;
  size: number;
  timestamp: number;
}

function getAllCacheEntries(): CacheEntry[] {
  const entries: CacheEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || (!key.startsWith(CACHE_PREFIX) && !key.startsWith(DETAIL_CACHE_PREFIX))) continue;

    const value = localStorage.getItem(key);
    if (!value) continue;

    let timestamp = 0;
    try {
      const parsed = JSON.parse(value);
      timestamp = parsed.timestamp || 0;
    } catch {
      // Corrupted entry — timestamp 0 ensures it gets evicted first
    }

    entries.push({ key, size: value.length, timestamp });
  }
  return entries;
}

/**
 * Evict oldest cache entries until bytesToFree bytes have been removed.
 * Prefers evicting detail_cache entries before resource_cache entries.
 */
function evictOldestEntries(bytesToFree: number): number {
  const entries = getAllCacheEntries();
  entries.sort((a, b) => {
    const aIsDetail = a.key.startsWith(DETAIL_CACHE_PREFIX) ? 0 : 1;
    const bIsDetail = b.key.startsWith(DETAIL_CACHE_PREFIX) ? 0 : 1;
    if (aIsDetail !== bIsDetail) return aIsDetail - bIsDetail;
    return a.timestamp - b.timestamp;
  });

  let freed = 0;
  for (const entry of entries) {
    if (freed >= bytesToFree) break;
    localStorage.removeItem(entry.key);
    freed += entry.size;
  }
  return freed;
}

/**
 * Write to localStorage with automatic eviction on quota errors.
 * Proactively trims the cache to MAX_CACHE_BYTES before writing,
 * then retries once after eviction if the write still fails.
 */
function saveWithEviction(key: string, json: string): void {
  const entries = getAllCacheEntries();
  const totalExcludingSelf = entries
    .filter(e => e.key !== key)
    .reduce((sum, e) => sum + e.size, 0);

  const overage = totalExcludingSelf + json.length - MAX_CACHE_BYTES;
  if (overage > 0) {
    evictOldestEntries(overage);
  }

  try {
    localStorage.setItem(key, json);
  } catch {
    evictOldestEntries(json.length * 2);
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      console.error(`Cache write failed for ${key} (${(json.length / 1024).toFixed(0)} KB):`, e);
    }
  }
}

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
    console.error("Failed to read cache:", e);
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
  const cached: CachedResourceData = {
    data,
    timestamp: Date.now(),
  };
  saveWithEviction(key, JSON.stringify(cached));
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
    console.error("Failed to read detail cache:", e);
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
  const cached: CachedDetailData = {
    data,
    timestamp: Date.now(),
  };
  saveWithEviction(key, JSON.stringify(cached));
}
