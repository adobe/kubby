// Types for navigation stack with filter awareness

import type { ResourceFilter } from '../kubectl/filterTypes'
import { createLabelFilter, createResourceNameFilter } from '../kubectl/filterTypes'

/** View type for navigation nodes */
export type ViewType = 'list' | 'describe' | 'logs'

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
  
  /** Text filter for filtering resources by name (restored when navigating back) */
  filterText?: string
  
  /** Type of view: 'list' for resource list, 'describe' for single resource detail */
  viewType?: ViewType
  
  /** Name of the specific resource being described (only used when viewType is 'describe' or 'logs') */
  resourceName?: string
  
  /** Container name for logs view (when viewing logs for a specific container) */
  containerName?: string
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

/**
 * Create a navigation node for the logs view (streaming logs for a resource)
 */
export function createLogsNavigationNode(
  context: string,
  namespace: string,
  resourceType: string,
  resourceName: string,
  displayName: string,
  containerName?: string
): NavigationNode {
  return {
    context,
    namespace,
    resourceType,
    displayName,
    viewType: 'logs',
    resourceName,
    containerName,
  }
}

/**
 * Check if a navigation node is a logs view
 */
export function isLogsView(node: NavigationNode): boolean {
  return node.viewType === 'logs'
}
