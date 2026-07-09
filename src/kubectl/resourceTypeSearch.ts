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

// Search helpers for the resource-type combobox: short-name aliases and
// usage-based ranking so the most-used types surface first.

/**
 * Well-known kubectl short names, keyed by the canonical plural resource type
 * (the form returned by `kubectl api-resources -o name`, stripped of its group).
 * Searching for any alias matches the resource type.
 */
export const RESOURCE_ALIASES: Record<string, string[]> = {
  pods: ['po'],
  deployments: ['deploy'],
  services: ['svc'],
  namespaces: ['ns'],
  configmaps: ['cm'],
  secrets: [],
  horizontalpodautoscalers: ['hpa'],
  persistentvolumeclaims: ['pvc'],
  persistentvolumes: ['pv'],
  statefulsets: ['sts'],
  daemonsets: ['ds'],
  replicasets: ['rs'],
  replicationcontrollers: ['rc'],
  ingresses: ['ing'],
  networkpolicies: ['netpol'],
  serviceaccounts: ['sa'],
  poddisruptionbudgets: ['pdb'],
  customresourcedefinitions: ['crd', 'crds'],
  endpoints: ['ep'],
  events: ['ev'],
  nodes: ['no'],
  cronjobs: ['cj'],
  storageclasses: ['sc'],
  priorityclasses: ['pc'],
  resourcequotas: ['quota'],
  limitranges: ['limits'],
  certificatesigningrequests: ['csr'],
  componentstatuses: ['cs'],
}

/** localStorage key for resource-type usage counts (follows the kubby-* pattern). */
export const USAGE_STORAGE_KEY = 'kubby-resource-type-usage'

/** Aliases for a resource type (empty array if none). */
export function getResourceTypeAliases(type: string): string[] {
  return RESOURCE_ALIASES[type.toLowerCase()] ?? []
}

/** Load persisted usage counts (safe against parse errors). */
export function loadResourceTypeUsage(): Record<string, number> {
  try {
    const stored = localStorage.getItem(USAGE_STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Increment the usage count for a resource type and persist it. */
export function recordResourceTypeUsage(type: string): void {
  if (!type) return
  try {
    const usage = loadResourceTypeUsage()
    usage[type] = (usage[type] ?? 0) + 1
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage))
  } catch {
    // Ignore localStorage errors
  }
}

/** Sort resource types by usage (most used first), then alphabetically. */
export function sortByUsage(items: string[], usage: Record<string, number>): string[] {
  return [...items].sort((a, b) => {
    const diff = (usage[b] ?? 0) - (usage[a] ?? 0)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
}

/**
 * Filter and rank resource types for the given input.
 *
 * Matches by name substring OR alias substring, then ranks by:
 *   tier (exact name/alias > singular/plural > name/alias prefix > substring),
 *   then usage (most used first), then shorter name, then alphabetical.
 *
 * With empty input, returns all items ordered by usage.
 */
export function rankResourceTypes(
  items: string[],
  input: string,
  usage: Record<string, number>,
): string[] {
  const q = input.trim().toLowerCase()
  if (!q) return sortByUsage(items, usage)

  const scored: { item: string; tier: number }[] = []

  for (const item of items) {
    const name = item.toLowerCase()
    const aliases = getResourceTypeAliases(item)

    const exact = name === q || aliases.includes(q)
    const singularPlural = name === `${q}s` || `${name}s` === q
    const prefix = name.startsWith(q) || aliases.some(a => a.startsWith(q))
    const contains = name.includes(q) || aliases.some(a => a.includes(q))

    let tier: number
    if (exact) tier = 0
    else if (singularPlural) tier = 1
    else if (prefix) tier = 2
    else if (contains) tier = 3
    else continue // no match

    scored.push({ item, tier })
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    const usageDiff = (usage[b.item] ?? 0) - (usage[a.item] ?? 0)
    if (usageDiff !== 0) return usageDiff
    if (a.item.length !== b.item.length) return a.item.length - b.item.length
    return a.item.localeCompare(b.item)
  })

  return scored.map(s => s.item)
}
