import classes from './Alert.module.scss'
import {ReactElement} from 'preact/compat'

export type AlertType = 'error' | 'warning' | 'info'

interface ErrorProps {
  /** Type of the alert **/
  type: AlertType
  /** The label shown before the error message (e.g., "Error", "Edit failed") */
  label: string
  /** The error message to display. If null/undefined, nothing is rendered. */
  message: ReactElement | string | null | undefined
}

/**
 * Displays an alert message with a styled container.
 * Renders nothing if message is null or undefined.
 */
export function Alert({ type, label, message }: ErrorProps) {
  if (!message) return null

  function props(): { alertClass: string, icon: string } {
    switch (type) {
      case 'error':
        return ({alertClass: classes.error, icon: '🚫'})
      case 'warning':
        return ({alertClass: classes.warning, icon: '⚠️'})
      case 'info':
        return ({alertClass: classes.info, icon: 'ℹ️'})
    }
  }
  const { alertClass, icon } = props()
  return (
    <div class={`${classes.Alert} ${alertClass}`}>
      <div class={classes.title}>{icon} <strong>{label}</strong></div>
      <div>{message ?? 'Unknown error'}</div>
    </div>
  )
}
