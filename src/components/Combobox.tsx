import {useRef, useState, useEffect, useImperativeHandle} from 'preact/hooks'
import {forwardRef} from 'preact/compat'
import {useCombobox} from 'downshift'
import type {Ref, JSX} from 'preact'
import classes from './Combobox.module.scss'

interface ComboboxProps<T> {
  items: T[];
  selectedItem: T | null;
  onSelectedItemChange: (item: T | null) => void;
  itemToString: (item: T | null) => string;
  filterItems?: (items: T[], inputValue: string) => T[];
  placeholder?: string;
  width?: string | number;
  tabIndex?: number;
  className?: string;
  emptyMessage?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

export interface ComboboxHandle {
  focus: () => void;
}

/**
 * Default filter function - case-insensitive substring match
 */
function defaultFilter<T>(items: T[], inputValue: string, itemToString: (item: T | null) => string): T[] {
  const lowerInput = inputValue.toLowerCase()
  return items.filter(item =>
    itemToString(item).toLowerCase().includes(lowerInput)
  )
}

function ComboboxInner<T>(
  {
    items,
    selectedItem,
    onSelectedItemChange,
    itemToString,
    filterItems,
    placeholder = 'Select...',
    width = 200,
    tabIndex,
    className,
    emptyMessage = 'No items found',
    onOpenChange,
  }: ComboboxProps<T>,
  ref: Ref<ComboboxHandle>
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [filterInput, setFilterInput] = useState(itemToString(selectedItem))

  // Track previous selectedItem to detect actual changes
  // (not just itemToString reference changes from inline functions)
  const prevSelectedItemRef = useRef<T | null>(selectedItem)

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    },
  }), [])

  // Update filter input when selectedItem prop changes
  // Using ref comparison to avoid resetting when itemToString is an inline function
  // that creates a new reference on every parent render
  useEffect(() => {
    if (prevSelectedItemRef.current !== selectedItem) {
      setFilterInput(itemToString(selectedItem))
      prevSelectedItemRef.current = selectedItem
    }
  }, [selectedItem, itemToString])

  // Filter items based on current input
  const filteredItems = filterInput
    ? (filterItems
        ? filterItems(items, filterInput)
        : defaultFilter(items, filterInput, itemToString))
    : items

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem: downshiftSelectedItem,
  } = useCombobox<T>({
    items: filteredItems,
    selectedItem,
    inputValue: filterInput,
    defaultHighlightedIndex: 0,
    onInputValueChange: ({inputValue: newInputValue, type}) => {
      if (type === useCombobox.stateChangeTypes.InputChange) {
        setFilterInput(newInputValue || '')
      }
    },
    onSelectedItemChange: ({selectedItem: newSelectedItem}) => {
      if (newSelectedItem && newSelectedItem !== selectedItem) {
        onSelectedItemChange(newSelectedItem)
        setFilterInput(itemToString(newSelectedItem))
        // Blur after selection to allow global keyboard shortcuts
            inputRef.current?.blur()
      }
    },
    onIsOpenChange: ({isOpen: newIsOpen}) => {
      if (!newIsOpen) {
        setFilterInput(itemToString(selectedItem))
      }
      onOpenChange?.(newIsOpen ?? false)
    },
    itemToString,
  })

  const inputStyle = typeof width === 'number' ? {width: `${width}px`} : {width}

  return (
    <div className={`${classes.comboboxWrapper} ${className || ''}`}>
      <div className={classes.combobox}>
        <input
          {...getInputProps({
            ref: inputRef,
            onBlur: () => {
              setFilterInput(itemToString(selectedItem))
            },
          })}
          className={classes.comboboxInput}
          placeholder={placeholder}
          tabIndex={tabIndex}
          style={inputStyle}
        />
      </div>
      {isOpen && (
        <ul {...getMenuProps()} className={classes.comboboxMenu}>
          {filteredItems.map((item, index) => (
            <li
              key={itemToString(item)}
              {...getItemProps({item, index})}
              className={`${classes.comboboxItem} ${highlightedIndex === index ? classes.comboboxItemHighlighted : ''} ${downshiftSelectedItem === item ? classes.comboboxItemSelected : ''}`}
            >
              {itemToString(item)}
            </li>
          ))}
          {filteredItems.length === 0 && (
            <li className={classes.comboboxItem}>{emptyMessage}</li>
          )}
        </ul>
      )}
    </div>
  )
}

// Export with forwardRef for generic component with ref support
// Using type assertion because TypeScript has trouble with generic forwardRef
export const Combobox = forwardRef(ComboboxInner) as <T>(
  props: ComboboxProps<T> & { ref?: Ref<ComboboxHandle> }
) => JSX.Element

// Re-export for convenience when building custom filters
export {useCombobox}
