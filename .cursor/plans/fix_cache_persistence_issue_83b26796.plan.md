---
name: Fix cache persistence issue
overview: The release build's localStorage cache for the `tauri://localhost` origin has grown to ~10 MB (497 keys) with no eviction, likely hitting the WKWebView quota limit. Writes silently fail in `saveCachedResources`, causing pods data to never persist while smaller deployments writes (overwriting existing same-size keys) may still succeed.
todos:
  - id: verify-theory
    content: Verify the quota theory by clearing the release localStorage and testing (user can do this immediately)
    status: pending
  - id: add-eviction
    content: Add cache eviction logic to saveCachedResources and saveCachedDetail in resourceCache.ts -- on QuotaExceededError, evict oldest entries and retry
    status: completed
  - id: add-size-limit
    content: Add proactive cache size management to prevent unbounded growth (MAX_CACHE_SIZE_BYTES)
    status: completed
  - id: add-devtools
    content: Add devtools feature to Cargo.toml tauri dependency for release debugging
    status: cancelled
  - id: improve-logging
    content: Upgrade cache error logging from console.warn to console.error with more context
    status: completed
isProject: false
---

# Fix Pod Cache Not Persisting in Release Build

## Root Cause Analysis

The cache uses `localStorage` via `[src/kubectl/resourceCache.ts](src/kubectl/resourceCache.ts)`. Inspecting the actual SQLite backing store on disk confirms the problem:

**Release build** (`~/Library/WebKit/com.adobe.kubby/.../localstorage.sqlite3` for `tauri://localhost`):

- **497 keys, ~10 MB total** -- 53 pods entries (3.4 MB), 281 other resource entries (2.5 MB), 160 detail entries (4.2 MB)

**Dev build** (`~/Library/WebKit/kubby/.../localstorage.sqlite3` for `http://localhost:1420`):

- **489 keys, ~9 MB total** -- similar breakdown

The cache grows **unboundedly** -- every new context/namespace/resourceType combination adds entries that are never removed. The critical issue is in `[saveCachedResources](src/kubectl/resourceCache.ts)` (line 61-75):

```66:74:src/kubectl/resourceCache.ts
  try {
    const cached: CachedResourceData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (e) {
    // If storage is full or unavailable, log warning but don't throw
    console.warn("Failed to write cache:", e);
```

When `localStorage.setItem` throws `QuotaExceededError`, the error is silently swallowed. The user sees data load successfully (in-memory state has `cacheTimestamp: Date.now()`), but on the next navigation (component remount via `key={navigationStack.length}`), the `useState` lazy initializer reads `localStorage.getItem(key)` which returns `null`, so `cacheTimestamp` is `null` and "Loading..." is shown instead of "Data from Xs ago, refreshing".

**Why deployments works but pods doesn't**: Deployments entries are smaller (typically 10-50 KB vs pods at 100-550 KB). Overwriting an existing same-size key may succeed even near quota, while adding a new large pods entry or significantly growing an existing one fails.

**Why dev works**: The `http://localhost` origin (used in dev) and `tauri://localhost` origin (used in release) have **separate localStorage** with potentially different quotas in WKWebView. The dev build may be just below the threshold or have a more generous limit for HTTP origins.

## Debugging (immediate verification)

You can verify this right now without rebuilding:

1. **Inspect the cache directly** -- you can query the SQLite database:

```bash
sqlite3 ~/Library/WebKit/com.adobe.kubby/WebsiteData/Default/zfGeewVicUX1jJkfy7QDKPl7hcewOiLwyWSoddDv_JY/zfGeewVicUX1jJkfy7QDKPl7hcewOiLwyWSoddDv_JY/LocalStorage/localstorage.sqlite3 \
  "SELECT key, length(value) as bytes FROM ItemTable ORDER BY bytes DESC LIMIT 10;"
```

1. **Quick test** -- clear the release localStorage to confirm the issue is quota-related:

```bash
rm ~/Library/WebKit/com.adobe.kubby/WebsiteData/Default/zfGeewVicUX1jJkfy7QDKPl7hcewOiLwyWSoddDv_JY/zfGeewVicUX1jJkfy7QDKPl7hcewOiLwyWSoddDv_JY/LocalStorage/localstorage.sqlite3*
```

Then restart the app. If pods cache works after clearing, the quota theory is confirmed.

1. **Enable DevTools in release** -- add `devtools` to the Tauri features in `[src-tauri/Cargo.toml](src-tauri/Cargo.toml)` to see console errors in release:

```toml
tauri = { version = "2.10.1", features = ["devtools"] }
```

## Fix

### 1. Add cache eviction to `saveCachedResources` in `[src/kubectl/resourceCache.ts](src/kubectl/resourceCache.ts)`

When `localStorage.setItem` throws (likely `QuotaExceededError`), evict the oldest cache entries by timestamp and retry:

- Iterate all `resource_cache:` and `detail_cache:` keys
- Parse each entry's `timestamp`
- Sort by timestamp ascending (oldest first)
- Remove entries until enough space is freed, then retry the write
- Start by evicting detail cache entries (largest at 60+ KB each, and less critical than list caches)

### 2. Add a cache size limit

Add a constant (e.g., `MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024`) and proactively evict oldest entries when the total exceeds this limit. This prevents the cache from growing unboundedly.

### 3. Surface errors better

Change the `console.warn` to `console.error` and optionally add a visible indicator when cache writes fail, so the behavior is not silently degraded.

## Files to modify

- `[src/kubectl/resourceCache.ts](src/kubectl/resourceCache.ts)` -- add eviction logic in `saveCachedResources` and `saveCachedDetail`, add cache size management
- `[src-tauri/Cargo.toml](src-tauri/Cargo.toml)` -- optionally add `devtools` feature for debugging release builds

