// Types for navigation stack with filter awareness

import type { LabelSelector } from '../kubectl/resourceTypes'

/**
 * Represents a single node in the navigation stack.
 * Each node captures the state needed to render a specific resource view.
 */
export interface NavigationNode {
  /** The resource type being viewed (e.g., "deployments", "pods") */
  resourceType: string
  
  /** Label filters applied to the resource list */
  labelSelectors?: LabelSelector[]
  
  /** Display name for the back button when returning to this node (e.g., "Dashboard", "Deployments") */
  displayName: string
  
  /** Kubernetes context */
  context: string
  
  /** Kubernetes namespace */
  namespace: string
  
  /** Selected row index to restore when navigating back (-1 or undefined means no selection) */
  selectedIndex?: number
}

/**
 * Capitalizes and formats a resource type for display.
 * Examples:
 * - "deployments" -> "Deployments"
 * - "pods" -> "Pods"
 * - "configmaps" -> "ConfigMaps"
 */
export function formatResourceTypeForDisplay(resourceType: string): string {
  // Handle special cases with camelCase
  const specialCases: Record<string, string> = {
    'configmaps': 'ConfigMaps',
    'replicasets': 'ReplicaSets',
    'daemonsets': 'DaemonSets',
    'statefulsets': 'StatefulSets',
  }
  
  const lower = resourceType.toLowerCase()
  if (specialCases[lower]) {
    return specialCases[lower]
  }
  
  // Default: capitalize first letter
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
}

/**
 * Factory function to create a navigation node
 */
export function createNavigationNode(
  context: string,
  namespace: string,
  resourceType: string,
  displayName: string,
  labelSelectors?: LabelSelector[],
  selectedIndex?: number
): NavigationNode {
  return {
    context,
    namespace,
    resourceType,
    displayName,
    labelSelectors,
    selectedIndex,
  }
}
