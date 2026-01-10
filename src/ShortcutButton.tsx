import classes from './ShortcutButton.module.scss'
import {formatShortcut} from './keyboardUtils'

interface ShortcutButtonProps {
  /** The label text displayed next to the shortcut key */
  label: string
  /** The shortcut string (e.g., "Ctrl+R", "Enter", "Shift+F") */
  shortcut: string
  /** Click handler */
  onClick?: () => void
  /** Whether the button is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
  /** Tab index (-1 to exclude from tab order) */
  tabIndex?: number
}

export function ShortcutButton({ 
  label, 
  shortcut, 
  onClick, 
  disabled = false,
  className = '',
  tabIndex = -1,
}: ShortcutButtonProps) {
  return (
    <button 
      class={`${classes.shortcutButton} ${className}`}
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      <span class={classes.shortcutLabel}>{label}</span>
      <span class={classes.shortcutKey}>{formatShortcut(shortcut)}</span>
    </button>
  )
}
