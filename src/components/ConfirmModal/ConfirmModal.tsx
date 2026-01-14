import { ComponentChildren } from 'preact'
import { useCallback } from 'preact/hooks'
import { Modal } from '../Modal/Modal.tsx'
import { Button } from '../Button/Button.tsx'
import classes from './ConfirmModal.module.scss'

interface ConfirmModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called when the modal should be closed */
  onClose: () => void
  /** Called when the user confirms the action */
  onConfirm: () => void
  /** Modal title */
  title: string
  /** Main message content (can include JSX like <strong> for highlighted text) */
  message: ComponentChildren
  /** Warning text displayed below the message */
  warningText?: string
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string
  /** Label shown while action is in progress (default: "Processing...") */
  confirmingLabel?: string
  /** Whether the confirm action is in progress */
  isConfirming?: boolean
  /** Error message to display */
  error?: string | null
  /** Whether the confirm button should be styled as destructive (red) */
  destructive?: boolean
  /** Whether in read-only mode (disables confirm action) */
  readOnly?: boolean
}

/**
 * Generic confirmation modal dialog with customizable text.
 * Supports destructive styling for delete-like actions.
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  warningText,
  confirmLabel = 'Confirm',
  confirmingLabel = 'Processing...',
  isConfirming = false,
  error,
  destructive = false,
  readOnly = false,
}: ConfirmModalProps) {
  const handleClose = () => {
    if (!isConfirming) {
      onClose()
    }
  }

  // Handle Enter key to confirm (called by Modal's onKeyDown)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isConfirming && !readOnly) {
      e.preventDefault()
      onConfirm()
    }
  }, [isConfirming, readOnly, onConfirm])

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} onKeyDown={handleKeyDown}>
      <div class={classes.confirmModal}>
        <p class={classes.message}>{message}</p>
        {warningText && <p class={classes.warning}>{warningText}</p>}
        {error && <div class={classes.error}>{error}</div>}
        <div class={classes.actions}>
          <Button
            label="Cancel"
            shortcut="Esc"
            onClick={handleClose}
            disabled={isConfirming}
            tabIndex={0}
          />
          <Button
            label={isConfirming ? confirmingLabel : confirmLabel}
            shortcut="Enter"
            onClick={onConfirm}
            disabled={isConfirming || readOnly}
            tabIndex={0}
            className={destructive ? classes.destructiveButton : undefined}
            tooltip={readOnly ? 'Disabled in read-only mode' : undefined}
          />
        </div>
      </div>
    </Modal>
  )
}
