import {useState, useRef, useEffect, useCallback, useImperativeHandle} from 'preact/hooks'
import {forwardRef} from 'preact/compat'
import type {Ref} from 'preact'
import classes from './Button.module.scss'
import {formatShortcut} from '../../navigation/keyboardShortcuts.ts'

/** Sub-item for dropdown buttons */
export interface SubItem {
  /** Unique identifier for the sub-item */
  code: string
  /** Display label in the dropdown */
  label: string
  /** Whether the sub-item is available (dimmed if false) */
  available?: boolean
}

/** Handle for controlling Button externally */
export interface ButtonHandle {
  /** Toggle the dropdown open/closed */
  toggle: () => void
  /** Open the dropdown */
  open: () => void
  /** Close the dropdown */
  close: () => void
}

interface ButtonProps {
  /** The label text displayed next to the shortcut key */
  label: string
  /** The shortcut string (e.g., "Ctrl+R", "Enter", "Shift+F") */
  shortcut?: string
  /** Click handler (for regular buttons without sub-items) */
  onClick?: () => void
  /** Whether the button is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
  /** Tab index (-1 to exclude from tab order) */
  tabIndex?: number
  /** Tooltip to show on mouse over - uses HTML title property */
  tooltip?: string
  /** Sub-items to show in a dropdown (makes button a dropdown trigger) */
  subItems?: SubItem[]
  /** Handler called when a sub-item is clicked */
  onSubItemClick?: (code: string) => void
  /** Direction for dropdown popup ('up' for shortcuts bar, 'down' for normal) */
  dropDirection?: 'up' | 'down'
}

function ButtonComponent({
  label, 
  shortcut, 
  onClick, 
  disabled = false,
  className = '',
  tabIndex = -1,
  tooltip = undefined,
  subItems,
  onSubItemClick,
  dropDirection = 'down',
}: ButtonProps, ref: Ref<ButtonHandle>) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hasSubItems = subItems && subItems.length > 0

  // Get indices of available items for keyboard navigation
  const availableIndices = subItems?.map((item, i) => item.available !== false ? i : -1).filter(i => i !== -1) ?? []

  // Expose handle for external control
  useImperativeHandle(ref, () => ({
    toggle: () => setIsOpen(prev => !prev),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  }), [])

  // Reset focused index when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      // Focus first available item when opening
      setFocusedIndex(availableIndices.length > 0 ? availableIndices[0] : -1)
    } else {
      setFocusedIndex(-1)
    }
  }, [isOpen])

  // Handle keyboard events when dropdown is open (capture phase to intercept before global handlers)
  useEffect(() => {
    if (!isOpen || !subItems) return

    function handleKeyDown(e: KeyboardEvent) {
      // Only handle if dropdown is open
      if (!isOpen) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(false)
          break

        case 'ArrowDown': {
          e.preventDefault()
          e.stopPropagation()
          // Move to next available item
          const currentAvailableIdx = availableIndices.indexOf(focusedIndex)
          const nextIdx = currentAvailableIdx < availableIndices.length - 1 
            ? availableIndices[currentAvailableIdx + 1]
            : availableIndices[0] // Wrap to first
          setFocusedIndex(nextIdx)
          break
        }

        case 'ArrowUp': {
          e.preventDefault()
          e.stopPropagation()
          // Move to previous available item
          const currentAvailableIdx = availableIndices.indexOf(focusedIndex)
          const prevIdx = currentAvailableIdx > 0
            ? availableIndices[currentAvailableIdx - 1]
            : availableIndices[availableIndices.length - 1] // Wrap to last
          setFocusedIndex(prevIdx)
          break
        }

        case 'Enter':
        case ' ': {
          e.preventDefault()
          e.stopPropagation()
          const item = subItems?.[focusedIndex]
          if (focusedIndex >= 0 && item && item.available !== false) {
            setIsOpen(false)
            onSubItemClick?.(item.code)
          }
          break
        }

        case 'Tab':
          // Close dropdown on Tab but don't prevent default tab behavior
          e.stopPropagation()
          setIsOpen(false)
          break

        // Prevent other keys from propagating to global handlers
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
          e.preventDefault()
          e.stopPropagation()
          break
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use capture phase to intercept events before they reach global handlers
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('mousedown', handleClickOutside)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, focusedIndex, availableIndices, subItems, onSubItemClick])

  const handleButtonClick = useCallback(() => {
    if (hasSubItems) {
      setIsOpen(prev => !prev)
    } else {
      onClick?.()
    }
  }, [hasSubItems, onClick])

  const handleSubItemClick = useCallback((code: string, available: boolean) => {
    if (!available) return
    setIsOpen(false)
    onSubItemClick?.(code)
  }, [onSubItemClick])

  // Regular button without dropdown
  if (!hasSubItems) {
    return (
      <button 
        class={`${classes.Button} ${className}`}
        onClick={onClick}
        disabled={disabled}
        tabIndex={tabIndex}
        title={tooltip}
      >
        <span class={classes.label}>{label}</span>
        {shortcut && (<span class={classes.shortcutKey}>{formatShortcut(shortcut)}</span>)}
      </button>
    )
  }

  // Dropdown button
  const dropdownClasses = [
    classes.dropdown,
    dropDirection === 'up' ? classes.dropUp : classes.dropDown,
  ].join(' ')

  return (
    <div class={classes.ButtonDropdown} ref={containerRef}>
      <button 
        class={`${classes.Button} ${classes.hasDropdown} ${className} ${isOpen ? classes.isOpen : ''}`}
        onClick={handleButtonClick}
        disabled={disabled}
        tabIndex={tabIndex}
        title={tooltip}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span class={classes.label}>{label}</span>
        {shortcut && (<span class={classes.shortcutKey}>{formatShortcut(shortcut)}</span>)}
        {dropDirection === 'up'
          ? (<span className={classes.dropdownArrow}>▾</span>)
          : (<span className={classes.dropdownArrow}>▾</span>)
        }
      </button>
      
      {isOpen && (
        <div class={dropdownClasses} role="menu" ref={dropdownRef}>
          {subItems.map((item, index) => {
            const isAvailable = item.available !== false
            const isFocused = index === focusedIndex
            return (
              <button
                key={item.code}
                class={`${classes.dropdownItem} ${!isAvailable ? classes.unavailable : ''} ${isFocused ? classes.focused : ''}`}
                onClick={() => handleSubItemClick(item.code, isAvailable)}
                disabled={!isAvailable}
                role="menuitem"
                onMouseEnter={() => isAvailable && setFocusedIndex(index)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Export with forwardRef for external control
export const Button = forwardRef(ButtonComponent)
