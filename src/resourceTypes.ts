// Shared types for resource data

export interface ColumnConfig {
  name: string;
  jsonPath: string;
}

export interface ResourceItem {
  name: string;
  labels: LabelSelector[];
  [key: string]: string | number | null | LabelSelector[];
}

export interface ResourceListResponse {
  columns: ColumnConfig[];
  items: ResourceItem[];
}

export interface LabelSelector {
  key: string;
  value: string;
}
