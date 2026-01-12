import classes from './Button.module.scss'
import {formatShortcut} from '../../navigation/keyboardShortcuts.ts'

interface ButtonProps {
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

export function Button({
  label, 
  shortcut, 
  onClick, 
  disabled = false,
  className = '',
  tabIndex = -1,
}: ButtonProps) {
  return (
    <button 
      class={`${classes.Button} ${className}`}
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      <span class={classes.shortcutLabel}>{label}</span>
      <span class={classes.shortcutKey}>{formatShortcut(shortcut)}</span>
    </button>
  )
}
