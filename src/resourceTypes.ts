// Shared types for resource data

export interface ColumnConfig {
  name: string;
  jsonPath: string;
}

export interface ResourceItem {
  name: string;
  [key: string]: string | number | null;
}

export interface ResourceListResponse {
  columns: ColumnConfig[];
  items: ResourceItem[];
}
