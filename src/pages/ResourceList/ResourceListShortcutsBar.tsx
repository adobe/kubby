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

import { useCallback, useMemo, useState } from 'preact/hooks'
import type { Ref } from 'preact'
import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import { Button, type SubItem, type ButtonHandle } from '../../components/Button/Button.tsx'
import type { ActionCode } from './resourceActions.ts'
import { getRelatedResources } from './relatedResources.ts'
import type { AiConfig } from '../Dashboard/Dashboard.tsx'
import type { ColumnConfig, ResourceItem } from '../../kubectl/resourceTypes.ts'

export interface ShortcutConfig {
  label: string
  shortcut: string
  code: ActionCode
  tooltip: string
  isModifying?: boolean
  external?: boolean
}

interface ResourceListShortcutsBarProps {
  resourceType: string
  hasSelection: boolean
  disabled: boolean
  hasRunCommands: boolean
  readOnly: boolean
  /** AI assistant configuration (if configured) */
  aiConfig?: AiConfig
  /** Available resource types in the cluster (for filtering Jump options) */
  availableResourceTypes?: string[]
  onAction: (code: ActionCode) => void
  /** Called when user selects a related resource to jump to */
  onJump?: (relationCode: string) => void
  /** Ref for the Jump button (for keyboard shortcut handling) */
  jumpButtonRef?: Ref<ButtonHandle>
  /** Current kubectl context */
  context: string
  /** Current namespace */
  namespace: string
  /** Table columns */
  columns: ColumnConfig[]
  /** Filtered table rows */
  resources: ResourceItem[]
  /** Name of the currently selected resource (null if none) */
  selectedResourceName: string | null
  /** Ref for the Copy button (for keyboard shortcut handling) */
  copyButtonRef?: Ref<ButtonHandle>
}

// Shortcut configurations by resource type
const DEPLOYMENT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this deployment', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true, external: true },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this deployment', isModifying: false },
  { label: 'Rolling Restart...', shortcut: 'R', code: 'rolling_restart', tooltip: 'Perform a rolling restart of the deployment', isModifying: true },
  { label: 'Scale...', shortcut: 'S', code: 'scale', tooltip: 'Scale the number of replicas', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const ROLLOUT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this rollout', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true, external: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const POD_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Containers', shortcut: 'Enter', code: 'containers', tooltip: 'Show containers in this pod', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true, external: true },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this pod', isModifying: false },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this pod', isModifying: true },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this pod', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const CONTAINER_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this container', isModifying: false },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this container', isModifying: true },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this container', isModifying: true, external: true },
]

const SERVICE_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this service', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this service', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const JOB_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this job', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true, external: true },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this job', isModifying: false },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

export function getShortcutsForResourceType(resourceType: string, hasSelection: boolean, hasRunCommands: boolean): ShortcutConfig[] {
  if (!hasSelection) {
    return []
  }
  
  const normalizedType = resourceType.toLowerCase()
  let shortcuts: ShortcutConfig[]
  
  if (normalizedType === 'deployments' || normalizedType === 'deployment') {
    shortcuts = DEPLOYMENT_SHORTCUTS
  } else if (normalizedType === 'rollouts' || normalizedType === 'rollout') {
    shortcuts = ROLLOUT_SHORTCUTS
  } else if (normalizedType === 'pods' || normalizedType === 'pod') {
    shortcuts = POD_SHORTCUTS
  } else if (normalizedType === 'containers' || normalizedType === 'container') {
    shortcuts = CONTAINER_SHORTCUTS
  } else if (normalizedType === 'services' || normalizedType === 'service') {
    shortcuts = SERVICE_SHORTCUTS
  } else if (normalizedType === 'jobs' || normalizedType === 'job') {
    shortcuts = JOB_SHORTCUTS
  } else {
    shortcuts = DEFAULT_SHORTCUTS
  }
  
  // Add Run command if available
  if (hasRunCommands) {
    return [...shortcuts, { label: 'Run...', shortcut: 'U', code: 'run', tooltip: 'Run a custom command', isModifying: true }]
  }
  
  return shortcuts
}

const JUMP_SHORTCUTS: Record<string, string> = {
  replicasets: 'R',
  hpa: 'H',
  pdb: 'B',
  secrets: 'C',
  httpproxies: 'T',
  services: 'S',
  events: 'E',
  deployments: 'D',
  rollouts: 'O',
  endpoints: 'N',
  pods: 'P',
  pvc: 'V',
  jobs: 'J',
}

function buildMarkdownTable(
  columns: ColumnConfig[],
  resources: ResourceItem[],
  includeNameColumn: boolean,
): string {
  const colNames = includeNameColumn ? ['NAME', ...columns.map(c => c.name)] : columns.map(c => c.name)

  const rows = resources.map(r => {
    const cells: string[] = []
    if (includeNameColumn) cells.push(r.name)
    for (const col of columns) cells.push(String(r[col.name] ?? '<none>'))
    return cells
  })

  // Compute max width per column (at least the header width)
  const widths = colNames.map((header, i) => {
    let max = header.length
    for (const row of rows) {
      if (row[i].length > max) max = row[i].length
    }
    return max
  })

  const pad = (val: string, w: number) => val.padEnd(w)
  const formatRow = (cells: string[]) =>
    '| ' + cells.map((c, i) => pad(c, widths[i])).join(' | ') + ' |'

  const headerLine = formatRow(colNames)
  const separatorLine = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |'
  const dataLines = rows.map(formatRow)

  return [headerLine, separatorLine, ...dataLines].join('\n')
}

export function ResourceListShortcutsBar({ 
  resourceType, 
  hasSelection, 
  disabled,
  hasRunCommands,
  readOnly,
  aiConfig,
  availableResourceTypes = [],
  onAction,
  onJump,
  jumpButtonRef,
  context,
  namespace,
  columns,
  resources,
  selectedResourceName,
  copyButtonRef,
}: ResourceListShortcutsBarProps) {
  const [isJumpOpen, setIsJumpOpen] = useState(false)
  const [isCopyOpen, setIsCopyOpen] = useState(false)
  const shortcuts = getShortcutsForResourceType(resourceType, hasSelection, hasRunCommands)

  const copySubItems: SubItem[] = useMemo(() => [
    { code: 'markdown_table', label: 'Markdown Table', shortcut: 'T' },
    { code: 'kubectl_get_all', label: `Kubectl Cmd Get All ${resourceType}`, shortcut: 'A' },
    { code: 'kubectl_get_selection', label: 'Kubectl Cmd Get Selection', shortcut: 'S', available: hasSelection },
    { code: 'kubectl_get_yaml', label: 'Kubectl Cmd Get Selection YAML', shortcut: 'Y', available: hasSelection },
  ], [resourceType, hasSelection])

  const handleCopyAction = useCallback((code: string) => {
    let text = ''
    if (code === 'markdown_table') {
      const includeNameColumn = resourceType.toLowerCase() !== 'events'
      text = buildMarkdownTable(columns, resources, includeNameColumn)
    } else if (code === 'kubectl_get_all') {
      text = `kubectl get ${resourceType} --output wide --context ${context} --namespace ${namespace}`
    } else if (code === 'kubectl_get_selection' && selectedResourceName) {
      text = `kubectl get ${resourceType} ${selectedResourceName} --output wide --context ${context} --namespace ${namespace}`
    } else if (code === 'kubectl_get_yaml' && selectedResourceName) {
      text = `kubectl get ${resourceType} ${selectedResourceName} --output yaml --context ${context} --namespace ${namespace}`
    }
    if (text) navigator.clipboard.writeText(text)
  }, [resourceType, columns, resources, context, namespace, selectedResourceName])
  
  // Get related resources for the current resource type
  const relatedResources = useMemo(() => getRelatedResources(resourceType), [resourceType])
  
  // Build sub-items for the Jump dropdown, marking unavailable ones
  const jumpSubItems: SubItem[] = useMemo(() => {
    if (!hasSelection || relatedResources.length === 0) return []
    
    return relatedResources.map(relation => {
      // Check if the target resource type is available in the cluster
      const available = availableResourceTypes.length === 0 || 
        availableResourceTypes.some(rt => 
          rt.toLowerCase() === relation.targetResourceType.toLowerCase() ||
          rt.toLowerCase() === relation.targetResourceType.toLowerCase() + 's' ||
          rt.toLowerCase() + 's' === relation.targetResourceType.toLowerCase()
        )
      
      return {
        code: relation.code,
        label: relation.label,
        available,
        shortcut: JUMP_SHORTCUTS[relation.code],
      }
    })
  }, [hasSelection, relatedResources, availableResourceTypes])
  
  const hasJumpOptions = jumpSubItems.length > 0 && jumpSubItems.some(item => item.available)
  
  return (
    <ShortcutsBar disabled={disabled}>
      {shortcuts.map((shortcut) => {
        const isDisabled = disabled || (readOnly && shortcut.isModifying)
        const tooltip = readOnly && shortcut.isModifying 
          ? 'Disabled in read-only mode' 
          : shortcut.tooltip
        
        return (
          <Button
            key={shortcut.code}
            label={shortcut.label}
            shortcut={shortcut.shortcut}
            onClick={() => onAction(shortcut.code)}
            tabIndex={0}
            disabled={isDisabled}
            tooltip={tooltip}
            external={shortcut.external}
            shortcutMuted={isJumpOpen || isCopyOpen}
          />
        )
      })}

      {/* Spacer to push remaining buttons to the right */}
      <div style={{ flexGrow: 1 }} />

      {/* Copy dropdown button */}
      <Button
        ref={copyButtonRef}
        label="Copy"
        shortcut="C"
        subItems={copySubItems}
        onSubItemClick={handleCopyAction}
        onOpenChange={setIsCopyOpen}
        dropDirection="up"
        tabIndex={0}
        disabled={disabled}
        tooltip="Copy resource data to clipboard"
      />
      
      {/* Jump dropdown button - only show if there are related resources */}
      {hasJumpOptions && (
        <Button
          ref={jumpButtonRef}
          label="Jump"
          shortcut="J"
          subItems={jumpSubItems}
          onSubItemClick={onJump}
          onOpenChange={setIsJumpOpen}
          dropDirection="up"
          tabIndex={0}
          disabled={disabled || !hasSelection}
          tooltip="Jump to related resources"
        />
      )}
      
      {/* AI assistant button - only show if configured */}
      {aiConfig && (
        <Button
          label={aiConfig.name}
          shortcut="A"
          onClick={() => onAction('ai')}
          tabIndex={0}
          disabled={disabled}
          tooltip={`Open ${aiConfig.toolDisplayName} with current context`}
          external={true}
          shortcutMuted={isJumpOpen || isCopyOpen}
        />
      )}
    </ShortcutsBar>
  )
}
