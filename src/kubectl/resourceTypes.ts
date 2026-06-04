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
  /** Pod selector string from `status.selector` (e.g. Argo Rollouts) */
  podSelector?: string;
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
