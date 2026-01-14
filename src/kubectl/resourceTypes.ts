// Shared types for resource data

export type ColumnType = 'text' | 'number' | 'bool' | 'datetime' | 'duration' | 'podstatus';

export interface ColumnConfig {
  name: string;
  jsonPaths: string[];
  format?: string;
  type?: ColumnType;
}

export interface ResourceItem {
  name: string;
  labels: LabelSelector[];
  [key: string]: string | number | null | LabelSelector[];
}

export interface ResourceListResponse {
  columns: ColumnConfig[];
  items: ResourceItem[];
  evaluationError?: string;
}

export interface LabelSelector {
  key: string;
  value: string;
}

// Raw JSON response for resource details (kubectl get <type> <name> -o json)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResourceDetailResponse = Record<string, any>;
