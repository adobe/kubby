import { ShortcutsBar } from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import { Button } from '../../components/Button/Button.tsx'

interface ShortcutConfig {
  label: string
  shortcut: string
  onClick?: () => void
}

interface ResourceListShortcutsBarProps {
  resourceType: string
  hasSelection: boolean
  disabled: boolean
}

// Shortcut configurations by resource type
const DEPLOYMENT_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Pods', shortcut: 'Enter' },
  { label: 'Replica Sets', shortcut: 'Z' },
  { label: 'Describe', shortcut: 'D' },
  { label: 'Edit', shortcut: 'E' },
  { label: 'Logs', shortcut: 'L' },
  { label: 'Rolling Restart', shortcut: 'R' },
  { label: 'Scale', shortcut: 'S' },
  { label: 'Delete', shortcut: 'Ctrl+D' },
]

const POD_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Containers', shortcut: 'Enter' },
  { label: 'Describe', shortcut: 'D' },
  { label: 'Edit', shortcut: 'E' },
  { label: 'Logs', shortcut: 'L' },
  { label: 'Port-Forward', shortcut: 'Shift+F' },
  { label: 'Show PortForward', shortcut: 'F' },
  { label: 'Shell', shortcut: 'S' },
]

const NO_SELECTION_SHORTCUTS: ShortcutConfig[] = [
  { label: 'Select', shortcut: 'Up / Down' },
  { label: 'Help', shortcut: 'H' },
]

function getShortcutsForResourceType(resourceType: string, hasSelection: boolean): ShortcutConfig[] {
  if (!hasSelection) {
    return NO_SELECTION_SHORTCUTS
  }
  
  const normalizedType = resourceType.toLowerCase()
  
  if (normalizedType === 'deployments' || normalizedType === 'deployment') {
    return DEPLOYMENT_SHORTCUTS
  }
  
  if (normalizedType === 'pods' || normalizedType === 'pod') {
    return POD_SHORTCUTS
  }
  
  // Default: show basic shortcuts for other resource types
  return [
    { label: 'Describe', shortcut: 'D' },
    { label: 'Edit', shortcut: 'E' },
    { label: 'Delete', shortcut: 'Ctrl+D' },
  ]
}

export function ResourceListShortcutsBar({ resourceType, hasSelection, disabled }: ResourceListShortcutsBarProps) {
  const shortcuts = getShortcutsForResourceType(resourceType, hasSelection)
  
  return (
    <ShortcutsBar disabled={disabled}>
      {shortcuts.map((shortcut) => (
        <Button
          key={shortcut.label}
          label={shortcut.label}
          shortcut={shortcut.shortcut}
          onClick={shortcut.onClick}
          tabIndex={0}
          disabled={disabled}
        />
      ))}
    </ShortcutsBar>
  )
}
