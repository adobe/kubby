import classes from './Label.module.scss'
import {formatShortcut} from '../../navigation/keyboardShortcuts.ts'

interface LabelProps {
  label: string;
  value?: string;
  shortcut?: string; // e.g., 'Cmd+K' or 'Ctrl+K' - will auto-switch based on platform
  className?: string;
  children?: preact.ComponentChildren;
}

export function Label({label, value, shortcut, className, children}: LabelProps) {
  return (
    <span className={`${classes.Label} ${className || ''}`}>
      <span className={classes.labelText}>
        {label}
        {shortcut && (
          <span className={classes.shortcutHint}>{formatShortcut(shortcut)}</span>
        )}
      </span>
      {value && <span className={classes.value}>{value}</span>}
      {children}
    </span>
  )
}
