import {useEffect, useState, useRef} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {useCombobox} from 'downshift'
import classes from './ResourceList.module.scss'
import {getCacheAge} from './resourceCache'
import {useResourceLoader} from './useResourceLoader'

// Re-export for backwards compatibility
export type { ResourceListResponse } from './resourceTypes'

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  onBack: () => void;
  onResourceTypeChange?: (resourceType: string) => void;
}

export function ResourceList({context, namespace, resourceType, onBack, onResourceTypeChange}: ResourceListProps) {
  const isMountedRef = useRef(true)

  // Use the resource loader hook - handles caching and background refresh
  const {
    resources,
    columns,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
  } = useResourceLoader({ context, namespace, resourceType })

  const [resourceTypes, setResourceTypes] = useState<string[]>([])

  // Fetch resource types on mount
  useEffect(() => {
    isMountedRef.current = true
    
    async function fetchResourceTypes() {
      try {
        const types = await invoke<string[]>('get_resource_types', { context })
        if (isMountedRef.current) {
          setResourceTypes(types)
        }
      } catch (e) {
        console.error('Failed to fetch resource types:', e)
        if (isMountedRef.current) {
          setResourceTypes([])
        }
      }
    }
    
    // Use requestAnimationFrame to ensure UI renders before starting fetch
    const rafId = requestAnimationFrame(() => {
      fetchResourceTypes()
    })

    return () => {
      isMountedRef.current = false
      cancelAnimationFrame(rafId)
    }
  }, [context])

  // State to track input value for filtering (separate from downshift's internal state)
  const [filterInput, setFilterInput] = useState(resourceType)

  // Update filter input when resourceType prop changes
  useEffect(() => {
    setFilterInput(resourceType)
  }, [resourceType])

  // Filter and sort resource types based on current input value
  const filteredItems = filterInput
    ? resourceTypes
        .filter(item => 
          item.toLowerCase().includes(filterInput.toLowerCase())
        )
        .sort((a, b) => {
          const lowerA = a.toLowerCase()
          const lowerB = b.toLowerCase()
          const lowerInput = filterInput.toLowerCase()
          
          // Exact match comes first
          const aExact = lowerA === lowerInput
          const bExact = lowerB === lowerInput
          if (aExact && !bExact) return -1
          if (!aExact && bExact) return 1
          
          // Match without final 's' (singular/plural)
          const aWithoutS = lowerA === lowerInput + 's'
          const bWithoutS = lowerB === lowerInput + 's'
          const aInputWithoutS = lowerA + 's' === lowerInput
          const bInputWithoutS = lowerB + 's' === lowerInput
          
          const aSingularPlural = aWithoutS || aInputWithoutS
          const bSingularPlural = bWithoutS || bInputWithoutS
          
          if (aSingularPlural && !bSingularPlural) return -1
          if (!aSingularPlural && bSingularPlural) return 1
          
          // Starts with the input comes next
          const aStarts = lowerA.startsWith(lowerInput)
          const bStarts = lowerB.startsWith(lowerInput)
          if (aStarts && !bStarts) return -1
          if (!aStarts && bStarts) return 1
          
          // Otherwise maintain alphabetical order
          return a.localeCompare(b)
        })
    : resourceTypes

  // Downshift combobox setup
  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem,
  } = useCombobox<string>({
    items: filteredItems,
    selectedItem: resourceType,
    inputValue: filterInput,
    defaultHighlightedIndex: 0,
    onInputValueChange: ({ inputValue: newInputValue, type }) => {
      if (type === useCombobox.stateChangeTypes.InputChange) {
        setFilterInput(newInputValue || '')
      }
    },
    onSelectedItemChange: ({ selectedItem: newSelectedItem }) => {
      if (newSelectedItem && newSelectedItem !== resourceType && onResourceTypeChange) {
        onResourceTypeChange(newSelectedItem)
        setFilterInput(newSelectedItem)
      }
    },
    onIsOpenChange: ({ isOpen: newIsOpen }) => {
      if (!newIsOpen) {
        setFilterInput(resourceType)
      }
    },
    itemToString: (item: string | null) => item || '',
  })

  return (
    <div class={classes.resourceList}>
      <header class={classes.header}>
        <button class={classes.backButton} onClick={onBack}>
          ← Back
        </button>
        <div class={classes.headerInfo}>
          <div class={classes.resourceTypeWrapper}>
            <div class={classes.combobox}>
              <input
                {...getInputProps({
                  onBlur: () => {
                    setFilterInput(resourceType)
                  }
                })}
                class={classes.comboboxInput}
                placeholder="Select resource type..."
              />
            </div>
            {isOpen && (
              <ul {...getMenuProps()} class={classes.comboboxMenu}>
                {filteredItems.map((item, index) => (
                  <li
                    key={item}
                    {...getItemProps({ item, index })}
                    class={`${classes.comboboxItem} ${highlightedIndex === index ? classes.comboboxItemHighlighted : ''} ${selectedItem === item ? classes.comboboxItemSelected : ''}`}
                  >
                    {item}
                  </li>
                ))}
                {filteredItems.length === 0 && (
                  <li class={classes.comboboxItem}>No resource types found</li>
                )}
              </ul>
            )}
          </div>
          <span className={classes.context}>
            <span className={classes.label}>Context</span>
            <span className={classes.name}>{context}</span>
          </span>
          <span className={classes.namespace}>
            <span className={classes.label}>Namespace</span>
            <span className={classes.name}>{namespace}</span>
          </span>
        </div>
        <button class={classes.refreshButton} onClick={refresh} disabled={isRefreshing}>
          ↻ Refresh
        </button>
      </header>

      {error && (
        <div class={classes.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!error && (
        <div class={classes.tableWrapper}>
          <table class={classes.table}>
            <thead>
            <tr>
              <th class={classes.nameColumn}>NAME</th>
              {columns.map((col) => (
                <th key={col.name}>
                  {col.name}
                </th>
              ))}
            </tr>
            </thead>
            <tbody>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} class={classes.emptyRow}>
                  No resources found
                </td>
              </tr>
            ) : (
              resources.map((resource) => (
                <tr key={resource.name} class={classes.resourceRow}>
                  <td class={classes.nameCell}>{resource.name}</td>
                  {columns.map((col) => (
                    <td key={col.name} class={classes.dataCell}>
                      {resource[col.name] ?? '<none>'}
                    </td>
                  ))}
                </tr>
              ))
            )}
            </tbody>
          </table>
        </div>
      )}

      {!error && resources.length > 0 && (
        <div class={classes.footer}>
          {resources.length} item{resources.length !== 1 ? 's' : ''}
        </div>
      )}

      {isRefreshing && (
        <div class={classes.refreshIndicator}>
          {cacheTimestamp ? (
            <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      )}
    </div>
  )
}
