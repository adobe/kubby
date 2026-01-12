import classes from './Error.module.scss'

interface ErrorProps {
  /** The label shown before the error message (e.g., "Error", "Edit failed") */
  label: string
  /** The error message to display. If null/undefined, nothing is rendered. */
  message: string | null | undefined
}

/**
 * Displays an error message with a styled container.
 * Renders nothing if message is null or undefined.
 */
export function Error({ label, message }: ErrorProps) {
  if (!message) return null

  return (
    <div class={classes.error}>
      <strong>{label}:</strong> {message}
    </div>
  )
}
