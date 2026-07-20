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

// Pure helpers for reading contexts and namespaces out of the dashboard config.

import type { DashboardConfig } from './Dashboard.tsx'

/**
 * Get all namespaces available for a given context from the dashboard config.
 * Returns namespaces where contexts is null (available everywhere) or includes the context.
 */
export function getNamespacesForContext(config: DashboardConfig, context: string): string[] {
  const namespaces: string[] = []

  for (const group of config.groups) {
    // Check if context exists in this group
    const contextInGroup = group.contextGroups.some(cg => cg.contexts.includes(context))
    if (!contextInGroup) continue

    for (const ng of group.namespaceGroups) {
      for (const ns of ng.namespaces) {
        // Namespace is available if contexts is null or includes this context
        if (ns.contexts === null || ns.contexts.includes(context)) {
          if (!namespaces.includes(ns.name)) {
            namespaces.push(ns.name)
          }
        }
      }
    }
  }

  return namespaces
}

/** Extract all contexts from the dashboard config (flattened across groups). */
export function getAllContexts(config: DashboardConfig): string[] {
  const contexts: string[] = []
  for (const group of config.groups) {
    for (const cg of group.contextGroups) {
      for (const ctx of cg.contexts) {
        if (!contexts.includes(ctx)) {
          contexts.push(ctx)
        }
      }
    }
  }
  return contexts
}

/** Build a lookup of namespace name -> configured label across all groups. */
export function getNamespaceLabels(config: DashboardConfig): Map<string, string> {
  const labels = new Map<string, string>()
  for (const group of config.groups) {
    for (const ng of group.namespaceGroups) {
      for (const ns of ng.namespaces) {
        if (ns.label && !labels.has(ns.name)) {
          labels.set(ns.name, ns.label)
        }
      }
    }
  }
  return labels
}
