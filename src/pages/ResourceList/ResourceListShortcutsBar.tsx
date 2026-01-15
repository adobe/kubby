import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import { Button } from '../../components/Button/Button.tsx'
import type { ActionCode } from './resourceActions.ts'

interface ShortcutConfig {
  label: string
  shortcut: string
  code: ActionCode
  tooltip: string
  isModifying?: boolean
}

interface ResourceListShortcutsBarProps {
  resourceType: string
  hasSelection: boolean
  disabled: boolean
  hasRunCommands: boolean
  readOnly: boolean
  onAction: (code: ActionCode) => void
}

// Shortcut configurations by resource type
const DEPLOYMENT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this deployment', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this deployment', isModifying: false },
  { label: 'Rolling Restart...', shortcut: 'R', code: 'rolling_restart', tooltip: 'Perform a rolling restart of the deployment', isModifying: true },
  { label: 'Scale', shortcut: 'S', code: 'scale', tooltip: 'Scale the number of replicas', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const POD_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Containers', shortcut: 'Enter', code: 'containers', tooltip: 'Show containers in this pod', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this pod', isModifying: false },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this pod', isModifying: true },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this pod', isModifying: true },
  { label: 'Delete', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const CONTAINER_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this container', isModifying: false },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this container', isModifying: true },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this container', isModifying: true },
]

const SERVICE_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this service', isModifying: false },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor', isModifying: true },
  { label: 'Port-Forward...', shortcut: 'F', code: 'port_forward', tooltip: 'Configure port-forwards for this service', isModifying: true },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information', isModifying: false },
  { label: 'Delete...', shortcut: 'Del', code: 'delete', tooltip: 'Delete this resource', isModifying: true },
]

function getShortcutsForResourceType(resourceType: string, hasSelection: boolean, hasRunCommands: boolean): ShortcutConfig[] {
  if (!hasSelection) {
    return []
  }
  
  const normalizedType = resourceType.toLowerCase()
  let shortcuts: ShortcutConfig[]
  
  if (normalizedType === 'deployments' || normalizedType === 'deployment') {
    shortcuts = DEPLOYMENT_SHORTCUTS
  } else if (normalizedType === 'pods' || normalizedType === 'pod') {
    shortcuts = POD_SHORTCUTS
  } else if (normalizedType === 'containers' || normalizedType === 'container') {
    shortcuts = CONTAINER_SHORTCUTS
  } else if (normalizedType === 'services' || normalizedType === 'service') {
    shortcuts = SERVICE_SHORTCUTS
  } else {
    shortcuts = DEFAULT_SHORTCUTS
  }
  
  // Add Run command if available
  if (hasRunCommands) {
    return [...shortcuts, { label: 'Run...', shortcut: 'U', code: 'run', tooltip: 'Run a custom command', isModifying: true }]
  }
  
  return shortcuts
}

export function ResourceListShortcutsBar({ 
  resourceType, 
  hasSelection, 
  disabled,
  hasRunCommands,
  readOnly,
  onAction,
}: ResourceListShortcutsBarProps) {
  const shortcuts = getShortcutsForResourceType(resourceType, hasSelection, hasRunCommands)
  
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
          />
        )
      })}
    </ShortcutsBar>
  )
}
