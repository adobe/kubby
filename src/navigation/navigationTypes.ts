// Types for navigation stack with filter awareness

import type { ResourceFilter } from '../kubectl/filterTypes'
import { createLabelFilter, createResourceNameFilter } from '../kubectl/filterTypes'

/** View type for navigation nodes */
export type ViewType = 'list' | 'describe'

/**
 * Represents a single node in the navigation stack.
 * Each node captures the state needed to render a specific resource view.
 */
export interface NavigationNode {
  /** The resource type being viewed (e.g., "deployments", "pods", "containers") */
  resourceType: string
  
  /** All filters applied to this view */
  filters?: ResourceFilter[]
  
  /** Display name for the back button when returning to this node (e.g., "Dashboard", "Deployments") */
  displayName: string
  
  /** Kubernetes context */
  context: string
  
  /** Kubernetes namespace */
  namespace: string
  
  /** Selected row index to restore when navigating back (-1 or undefined means no selection) */
  selectedIndex?: number
  
  /** Type of view: 'list' for resource list, 'describe' for single resource detail */
  viewType?: ViewType
  
  /** Name of the specific resource being described (only used when viewType is 'describe') */
  resourceName?: string
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
  filters?: ResourceFilter[],
  selectedIndex?: number
): NavigationNode {
  return {
    context,
    namespace,
    resourceType,
    displayName,
    filters,
    selectedIndex,
  }
}

/**
 * Create a navigation node with label filters (convenience function)
 */
export function createNavigationNodeWithLabels(
  context: string,
  namespace: string,
  resourceType: string,
  displayName: string,
  labelFilters: { key: string; value: string }[],
  selectedIndex?: number
): NavigationNode {
  const filters = labelFilters.map(lf => createLabelFilter(lf.key, lf.value))
  return createNavigationNode(context, namespace, resourceType, displayName, filters, selectedIndex)
}

/**
 * Create a navigation node with a resource name filter (e.g., for containers view)
 */
export function createNavigationNodeWithResourceName(
  context: string,
  namespace: string,
  resourceType: string,
  displayName: string,
  filterResourceType: string,
  resourceName: string,
  selectedIndex?: number
): NavigationNode {
  const filters = [createResourceNameFilter(filterResourceType, resourceName)]
  return createNavigationNode(context, namespace, resourceType, displayName, filters, selectedIndex)
}

/**
 * Create a navigation node for the describe view (single resource detail)
 */
export function createDescribeNavigationNode(
  context: string,
  namespace: string,
  resourceType: string,
  resourceName: string,
  displayName: string
): NavigationNode {
  return {
    context,
    namespace,
    resourceType,
    displayName,
    viewType: 'describe',
    resourceName,
  }
}

/**
 * Check if a navigation node is a describe view
 */
export function isDescribeView(node: NavigationNode): boolean {
  return node.viewType === 'describe'
}
