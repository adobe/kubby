// Shared types for resource data

export type ColumnType = 'text' | 'number' | 'bool' | 'datetime' | 'duration' | 'podstatus';

export type ColumnAlign = 'start' | 'end';

export type ColorState = 
  | 'attention'
  | 'danger'
  | 'default'
  | 'disabled'
  | 'done'
  | 'muted'
  | 'neutral'
  | 'severe'
  | 'sponsors'
  | 'success';

export interface ColorRule {
  expression: string; // JS expression with {0}, {1}, etc. placeholders
  color: ColorState;
}

export interface ColumnConfig {
  name: string;
  jsonPaths: string[];
  format?: string;
  type?: ColumnType;
  colorRules?: ColorRule[];
  align?: ColumnAlign;
}

export interface ResourceItem {
  name: string;
  labels: LabelSelector[];
  rawValues?: Record<string, (string | number)[]>;
  [key: string]: string | number | null | LabelSelector[] | Record<string, (string | number)[]> | undefined;
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
