// Generic filter types for resource filtering

/**
 * Filter by label key=value pair
 */
export interface LabelFilter {
  type: 'label';
  key: string;
  value: string;
}

/**
 * Filter by specific resource name (e.g., pod name when viewing containers)
 */
export interface ResourceNameFilter {
  type: 'resourceName';
  /** The type of resource being filtered (e.g., "pod" when viewing containers of a specific pod) */
  resourceType: string;
  name: string;
}

/**
 * Union of all filter types
 */
export type ResourceFilter = LabelFilter | ResourceNameFilter;

/**
 * Type guard for label filters
 */
export function isLabelFilter(filter: ResourceFilter): filter is LabelFilter {
  return filter.type === 'label';
}

/**
 * Type guard for resource name filters
 */
export function isResourceNameFilter(filter: ResourceFilter): filter is ResourceNameFilter {
  return filter.type === 'resourceName';
}

/**
 * Create a label filter
 */
export function createLabelFilter(key: string, value: string): LabelFilter {
  return { type: 'label', key, value };
}

/**
 * Create a resource name filter
 */
export function createResourceNameFilter(resourceType: string, name: string): ResourceNameFilter {
  return { type: 'resourceName', resourceType, name };
}

/**
 * Get label filters from a mixed filter array
 */
export function getLabelFilters(filters: ResourceFilter[]): LabelFilter[] {
  return filters.filter(isLabelFilter);
}

/**
 * Get resource name filters from a mixed filter array
 */
export function getResourceNameFilters(filters: ResourceFilter[]): ResourceNameFilter[] {
  return filters.filter(isResourceNameFilter);
}

/**
 * Get the first resource name filter for a specific resource type
 */
export function getResourceNameFilter(filters: ResourceFilter[], resourceType: string): ResourceNameFilter | undefined {
  return filters.find((f): f is ResourceNameFilter => 
    f.type === 'resourceName' && f.resourceType === resourceType
  );
}

/**
 * Convert legacy LabelSelector array to ResourceFilter array
 */
export function fromLabelSelectors(labelSelectors: { key: string; value: string }[]): LabelFilter[] {
  return labelSelectors.map(ls => createLabelFilter(ls.key, ls.value));
}

/**
 * Convert LabelFilter array to legacy LabelSelector format
 */
export function toLabelSelectors(filters: ResourceFilter[]): { key: string; value: string }[] {
  return getLabelFilters(filters).map(f => ({ key: f.key, value: f.value }));
}
