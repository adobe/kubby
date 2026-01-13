import { ComponentChildren } from 'preact'
import { useEffect, useRef, useCallback } from 'preact/hooks'
import classes from './Modal.module.scss'

interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called when the modal should be closed */
  onClose: () => void
  /** Modal title displayed in the header */
  title: string
  /** Content to render inside the modal */
  children: ComponentChildren
}

/**
 * Generic modal dialog with transparent overlay background.
 * Supports close button, Escape key to dismiss, and focus trap.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Handle Escape key to close modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }, [onClose])

  // Focus trap - keep focus within modal
  const handleFocusTrap = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault()
        lastElement?.focus()
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement?.focus()
      }
    }
  }, [])

  // Store previous focus and focus modal on open
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement
      // Focus the first focusable element in the modal
      requestAnimationFrame(() => {
        const firstButton = modalRef.current?.querySelector<HTMLElement>('button')
        firstButton?.focus()
      })
    } else if (previousActiveElement.current) {
      // Restore focus when closing
      previousActiveElement.current.focus()
      previousActiveElement.current = null
    }
  }, [isOpen])

  // Add keyboard event listeners
  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleFocusTrap)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleFocusTrap)
    }
  }, [isOpen, handleKeyDown, handleFocusTrap])

  if (!isOpen) return null

  return (
    <div class={classes.overlay} onClick={onClose}>
      <div 
        ref={modalRef}
        class={classes.modal} 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header class={classes.header}>
          <h2 id="modal-title" class={classes.title}>{title}</h2>
          <button 
            class={classes.closeButton} 
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </header>
        <div class={classes.content}>
          {children}
        </div>
      </div>
    </div>
  )
}
