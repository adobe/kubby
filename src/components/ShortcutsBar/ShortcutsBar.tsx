import { ComponentChildren } from 'preact'
import classes from './ShortcutsBar.module.scss'

interface ShortcutsBarProps {
  children: ComponentChildren
  disabled?: boolean
}

export function ShortcutsBar({ children, disabled }: ShortcutsBarProps) {
  return (
    <div class={classes.ShortcutsBar} data-disabled={disabled}>
      {children}
    </div>
  )
}
