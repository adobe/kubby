import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import { Button } from '../../components/Button/Button.tsx'
import type { ActionCode } from './resourceActions.ts'

interface ShortcutConfig {
  label: string
  shortcut: string
  code: ActionCode
  tooltip: string
}

interface ResourceListShortcutsBarProps {
  resourceType: string
  hasSelection: boolean
  disabled: boolean
  hasRunCommands: boolean
  onAction: (code: ActionCode) => void
}

// Shortcut configurations by resource type
const DEPLOYMENT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter', code: 'pods', tooltip: 'Show the pods for this deployment' },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information' },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor' },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this deployment' },
  { label: 'Replica Sets', shortcut: 'Z', code: 'replica_sets', tooltip: 'Show replica sets for this deployment' },
  { label: 'Rolling Restart...', shortcut: 'R', code: 'rolling_restart', tooltip: 'Perform a rolling restart of the deployment' },
  { label: 'Scale', shortcut: 'S', code: 'scale', tooltip: 'Scale the number of replicas' },
  { label: 'Delete...', shortcut: 'Ctrl+D', code: 'delete', tooltip: 'Delete this resource' },
]

const POD_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Containers', shortcut: 'Enter', code: 'containers', tooltip: 'Show containers in this pod' },
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information' },
  { label: 'Edit', shortcut: 'E', code: 'edit', tooltip: 'Edit the resource YAML in your default editor' },
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this pod' },
  { label: 'Port-Forward', shortcut: 'Shift+F', code: 'port_forward', tooltip: 'Configure port-forwards for this pod' },
  { label: 'Show Forwards', shortcut: 'F', code: 'show_port_forward', tooltip: 'Show existing port forwards' },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this pod' },
  { label: 'Delete', shortcut: 'Ctrl+D', code: 'delete', tooltip: 'Delete this resource' },
]

const CONTAINER_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Logs', shortcut: 'L', code: 'logs', tooltip: 'View logs for this container' },
  { label: 'Port-Forward', shortcut: 'Shift+F', code: 'port_forward', tooltip: 'Configure port-forwards for this container' },
  { label: 'Show Forwards', shortcut: 'F', code: 'show_port_forward', tooltip: 'Show existing port forwards' },
  { label: 'Shell', shortcut: 'S', code: 'shell', tooltip: 'Open a shell session in this container' },
]

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Describe', shortcut: 'D', code: 'describe', tooltip: 'View detailed resource information' },
  { label: 'Delete...', shortcut: 'Ctrl+D', code: 'delete', tooltip: 'Delete this resource' },
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
  } else {
    shortcuts = DEFAULT_SHORTCUTS
  }
  
  // Add Run command if available
  if (hasRunCommands) {
    return [...shortcuts, { label: 'Run...', shortcut: 'U', code: 'run', tooltip: 'Run a custom command' }]
  }
  
  return shortcuts
}

export function ResourceListShortcutsBar({ 
  resourceType, 
  hasSelection, 
  disabled,
  hasRunCommands,
  onAction,
}: ResourceListShortcutsBarProps) {
  const shortcuts = getShortcutsForResourceType(resourceType, hasSelection, hasRunCommands)
  
  return (
    <ShortcutsBar disabled={disabled}>
      {shortcuts.map((shortcut) => (
        <Button
          key={shortcut.code}
          label={shortcut.label}
          shortcut={shortcut.shortcut}
          onClick={() => onAction(shortcut.code)}
          tabIndex={0}
          disabled={disabled}
          tooltip={shortcut.tooltip}
        />
      ))}
    </ShortcutsBar>
  )
}
