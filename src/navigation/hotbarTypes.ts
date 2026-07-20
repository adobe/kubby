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

// Types for the Hotbar - saved shortcuts to specific resource screens

/**
 * A saved shortcut to a specific resource screen.
 * Captures the resource type, context and namespace needed to jump straight
 * to a resource list view (the same triple a Dashboard cell click produces).
 */
export interface HotbarEntry {
  /** Stable unique id (used as React key and for removal) */
  id: string

  /** The resource type to open (e.g. "horizontalpodautoscalers", "pods") */
  resourceType: string

  /** Kubernetes context */
  context: string

  /** Kubernetes namespace */
  namespace: string

  /** Optional custom label; when absent the resourceType is shown instead */
  name?: string
}

/** localStorage key for the saved hotbar entries (JSON array) */
export const HOTBAR_ENTRIES_STORAGE_KEY = 'kubby-hotbar-entries'

/** localStorage key for the hotbar open/collapsed state ("true" | "false") */
export const HOTBAR_OPEN_STORAGE_KEY = 'kubby-hotbar-open'

/** localStorage key for the expanded hotbar width in px */
export const HOTBAR_WIDTH_STORAGE_KEY = 'kubby-hotbar-width'

/** Bounds and default for the resizable hotbar width (px) */
export const HOTBAR_MIN_WIDTH = 200
export const HOTBAR_MAX_WIDTH = 520
export const HOTBAR_DEFAULT_WIDTH = 240

/** Two entries point at the same screen when this triple matches. */
export function isSameScreen(
  a: Pick<HotbarEntry, 'resourceType' | 'context' | 'namespace'>,
  b: Pick<HotbarEntry, 'resourceType' | 'context' | 'namespace'>,
): boolean {
  return (
    a.resourceType === b.resourceType &&
    a.context === b.context &&
    a.namespace === b.namespace
  )
}

/** Load persisted hotbar entries from localStorage (safe against parse errors). */
export function loadHotbarEntries(): HotbarEntry[] {
  try {
    const stored = localStorage.getItem(HOTBAR_ENTRIES_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as HotbarEntry[]) : []
  } catch {
    return []
  }
}

/** Load the persisted hotbar open state (defaults to collapsed). */
export function loadHotbarOpen(): boolean {
  try {
    return localStorage.getItem(HOTBAR_OPEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Clamp a width to the allowed hotbar range. */
export function clampHotbarWidth(width: number): number {
  return Math.min(HOTBAR_MAX_WIDTH, Math.max(HOTBAR_MIN_WIDTH, width))
}

/** Load the persisted hotbar width (clamped, defaults to HOTBAR_DEFAULT_WIDTH). */
export function loadHotbarWidth(): number {
  try {
    const stored = localStorage.getItem(HOTBAR_WIDTH_STORAGE_KEY)
    if (!stored) return HOTBAR_DEFAULT_WIDTH
    const parsed = parseInt(stored, 10)
    return Number.isNaN(parsed) ? HOTBAR_DEFAULT_WIDTH : clampHotbarWidth(parsed)
  } catch {
    return HOTBAR_DEFAULT_WIDTH
  }
}

/** Generate a unique id for a new hotbar entry. */
export function createHotbarEntryId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {
    // fall through to timestamp-based id
  }
  return `hb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
