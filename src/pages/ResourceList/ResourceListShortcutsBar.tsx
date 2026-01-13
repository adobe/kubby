import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import { Button } from '../../components/Button/Button.tsx'
import type { ActionCode } from './resourceActions.ts'

interface ShortcutConfig {
  label: string
  shortcut: string
  code: ActionCode
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
  { label: 'Pods', shortcut: 'Enter', code: 'pods' },
  { label: 'Describe', shortcut: 'D', code: 'describe' },
  { label: 'Edit', shortcut: 'E', code: 'edit' },
  { label: 'Logs', shortcut: 'L', code: 'logs' },
  { label: 'Replica Sets', shortcut: 'Z', code: 'replica_sets' },
  { label: 'Rolling Restart', shortcut: 'R', code: 'rolling_restart' },
  { label: 'Scale', shortcut: 'S', code: 'scale' },
  { label: 'Delete', shortcut: 'Ctrl+D', code: 'delete' },
]

const POD_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Containers', shortcut: 'Enter', code: 'containers' },
  { label: 'Describe', shortcut: 'D', code: 'describe' },
  { label: 'Edit', shortcut: 'E', code: 'edit' },
  { label: 'Logs', shortcut: 'L', code: 'logs' },
  { label: 'Port-Forward', shortcut: 'Shift+F', code: 'port_forward' },
  { label: 'Show PortForward', shortcut: 'F', code: 'show_port_forward' },
  { label: 'Shell', shortcut: 'S', code: 'shell' },
  { label: 'Delete', shortcut: 'Ctrl+D', code: 'delete' },
]

const CONTAINER_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Logs', shortcut: 'L', code: 'logs' },
  { label: 'Port-Forward', shortcut: 'Shift+F', code: 'port_forward' },
  { label: 'Show PortForward', shortcut: 'F', code: 'show_port_forward' },
  { label: 'Shell', shortcut: 'S', code: 'shell' },
]

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Describe', shortcut: 'D', code: 'describe' },
  { label: 'Delete', shortcut: 'Ctrl+D', code: 'delete' },
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
    return [...shortcuts, { label: 'Run...', shortcut: 'U', code: 'run' }]
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
        />
      ))}
    </ShortcutsBar>
  )
}
