import {useState, useRef, useEffect, useCallback, useImperativeHandle, useLayoutEffect} from 'preact/hooks'
import {forwardRef} from 'preact/compat'
import type {Ref, JSX} from 'preact'
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
  /** Single letter keyboard shortcut (displayed and activatable when dropdown is open) */
  shortcut?: string
}

/** Horizontal alignment for dropdown positioning */
type DropdownAlign = 'left' | 'right'

/** Handle for controlling Button externally */
export interface ButtonHandle {
  /** Toggle the dropdown open/closed */
  toggle: () => void
  /** Open the dropdown */
  open: () => void
  /** Close the dropdown */
  close: () => void
  /** Focus the button */
  focus: () => void
}

type NativeButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'label' | 'className' | 'tabIndex' | 'disabled' | 'onClick'>

interface ButtonProps extends NativeButtonProps {
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
  /** Whether to show external icon */
  external?: boolean
  /** Whether to dim the shortcut badge (used when another dropdown captures keyboard) */
  shortcutMuted?: boolean
  /** Called when dropdown open state changes */
  onOpenChange?: (isOpen: boolean) => void
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
  external = false,
  shortcutMuted = false,
  onOpenChange,
  ...rest
}: ButtonProps, ref: Ref<ButtonHandle>) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [dropdownAlign, setDropdownAlign] = useState<DropdownAlign>('left')
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hasSubItems = subItems && subItems.length > 0

  // Get indices of available items for keyboard navigation
  const availableIndices = subItems?.map((item, i) => item.available !== false ? i : -1).filter(i => i !== -1) ?? []

  // Expose handle for external control
  useImperativeHandle(ref, () => ({
    toggle: () => setIsOpen(prev => !prev),
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    focus: () => buttonRef.current?.focus(),
  }), [])

  // Reset focused index when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(availableIndices.length > 0 ? availableIndices[0] : -1)
    } else {
      setFocusedIndex(-1)
    }
    onOpenChange?.(isOpen)
  }, [isOpen])

  // Calculate dropdown position to keep it within viewport bounds
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !containerRef.current) return

    const dropdown = dropdownRef.current
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const dropdownRect = dropdown.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    // Check if dropdown overflows on the right when left-aligned
    const overflowsRight = containerRect.left + dropdownRect.width > viewportWidth
    // Check if dropdown would overflow on the left when right-aligned
    const overflowsLeft = containerRect.right - dropdownRect.width < 0

    // Prefer left alignment, but switch to right if it overflows
    if (overflowsRight && !overflowsLeft) {
      setDropdownAlign('right')
    } else {
      setDropdownAlign('left')
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

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
          e.preventDefault()
          e.stopPropagation()
          break

        default: {
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const letter = e.key.toUpperCase()
            const match = subItems?.find(
              item => item.shortcut === letter && item.available !== false
            )
            if (match) {
              e.preventDefault()
              e.stopPropagation()
              setIsOpen(false)
              onSubItemClick?.(match.code)
              break
            }
          }
          e.stopPropagation()
          break
        }
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
        ref={buttonRef}
        class={`${classes.Button} ${className}`}
        onClick={onClick}
        disabled={disabled}
        tabIndex={tabIndex}
        title={tooltip}
        {...rest}
      >
        <span class={classes.label}>{label}</span>
        {shortcut && (<span class={`${classes.shortcutKey} ${shortcutMuted ? classes.shortcutMuted : ''}`}>{formatShortcut(shortcut)}</span>)}
        {external && (<span class={classes.external} />)}
      </button>
    )
  }

  // Dropdown button
  const dropdownClasses = [
    classes.dropdown,
    dropDirection === 'up' ? classes.dropUp : classes.dropDown,
    dropdownAlign === 'right' ? classes.alignRight : classes.alignLeft,
  ].join(' ')

  return (
    <div class={classes.ButtonDropdown} ref={containerRef}>
      <button 
        ref={buttonRef}
        class={`${classes.Button} ${classes.hasDropdown} ${className} ${isOpen ? classes.isOpen : ''}`}
        onClick={handleButtonClick}
        disabled={disabled}
        tabIndex={tabIndex}
        title={tooltip}
        aria-haspopup="true"
        aria-expanded={isOpen}
        {...rest}
      >
        <span class={classes.label}>{label}</span>
        {shortcut && (<span class={`${classes.shortcutKey} ${shortcutMuted ? classes.shortcutMuted : ''}`}>{formatShortcut(shortcut)}</span>)}
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
                {item.shortcut && (
                  <span class={classes.dropdownItemShortcut}>{item.shortcut}</span>
                )}
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
