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
  /** Optional keyboard event handler for custom key handling (called after Escape/Tab are processed) */
  onKeyDown?: (e: KeyboardEvent) => void
}

/**
 * Generic modal dialog with transparent overlay background.
 * Supports close button, Escape key to dismiss, and focus trap.
 * 
 * Important: When open, this modal captures ALL keyboard events in the capture phase
 * to prevent them from reaching global handlers. This ensures modal isolation.
 */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'password', 'email', 'number', '',
])

function isTextEntryElement(el: Element | null): boolean {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type.toLowerCase()
    return TEXT_INPUT_TYPES.has(type)
  }
  return false
}

export function Modal({ isOpen, onClose, title, children, onKeyDown }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const mouseDownOnOverlay = useRef(false)

  // Capture ALL keyboard events when modal is open to prevent them from reaching global handlers
  // This runs in the capture phase (before bubble phase) so it intercepts events first
  const handleCaptureKeyDown = useCallback((e: KeyboardEvent) => {
    // Always stop propagation to prevent global handlers from receiving the event
    e.stopPropagation()

    // Handle Escape to close modal
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    // Handle Tab / Arrow keys for focus trap & navigation
    const isTab = e.key === 'Tab'
    const isArrowNav = e.key === 'ArrowLeft' || e.key === 'ArrowRight'

    if ((isTab || isArrowNav) && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // If focus is outside the modal, force it back in
      if (!modalRef.current.contains(document.activeElement)) {
        e.preventDefault()
        firstElement?.focus()
        return
      }

      // ArrowLeft / Shift+Tab = previous, ArrowRight / Tab = next
      const reverse = e.key === 'ArrowLeft' || (isTab && e.shiftKey)

      if (isArrowNav) {
        if (isTextEntryElement(document.activeElement)) return

        e.preventDefault()
        const index = Array.from(focusableElements).indexOf(document.activeElement as HTMLElement)
        if (reverse) {
          const prev = index <= 0 ? lastElement : focusableElements[index - 1]
          prev?.focus()
        } else {
          const next = index >= focusableElements.length - 1 ? firstElement : focusableElements[index + 1]
          next?.focus()
        }
      } else {
        // Tab: only intercept at boundaries to keep trap
        if (reverse) {
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
      }
      return
    }

    // Call custom key handler for other keys (e.g., Enter for ConfirmModal)
    onKeyDown?.(e)
  }, [onClose, onKeyDown])

  // Store previous focus and focus modal on open
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement
      // Focus the first focusable element in the content area (not the close button)
      requestAnimationFrame(() => {
        const content = modalRef.current?.querySelector(`.${classes.content}`)
        const firstButton = content?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        firstButton?.focus()
      })
    } else if (previousActiveElement.current) {
      // Restore focus when closing
      previousActiveElement.current.focus()
      previousActiveElement.current = null
    }
  }, [isOpen])

  // Add capture-phase keyboard event listener when modal is open
  useEffect(() => {
    if (!isOpen) return

    // Use capture phase to intercept events before they reach other handlers
    document.addEventListener('keydown', handleCaptureKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleCaptureKeyDown, { capture: true })
    }
  }, [isOpen, handleCaptureKeyDown])

  const handleOverlayMouseDown = useCallback((e: MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget
  }, [])

  const handleOverlayClick = useCallback((e: MouseEvent) => {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose()
    }
    mouseDownOnOverlay.current = false
  }, [onClose])

  if (!isOpen) return null

  return (
    <div class={classes.overlay} onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div 
        ref={modalRef}
        class={classes.modal} 
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
