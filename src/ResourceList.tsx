import {useEffect, useState, useCallback, useRef} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {useCombobox} from 'downshift'
import classes from './ResourceList.module.scss'
import {
  getCacheKey,
  loadCachedResources,
  saveCachedResources,
  getCacheAge, CachedTimestampedResources,
} from './resourceCache'

// Column configuration for each resource type
interface ColumnConfig {
  name: string;
  jsonPath: string;
}

interface ResourceTypeConfig {
  columns: ColumnConfig[];
}

// Default config for unknown resource types
const DEFAULT_RESOURCE_CONFIG: ResourceTypeConfig = {
  columns: [
    {name: 'AGE', jsonPath: '.metadata.creationTimestamp'},
  ],
}

interface ResourceItem {
  name: string;

  [key: string]: string | number | null;
}

export interface ResourceListResponse {
  columns: ColumnConfig[];
  items: ResourceItem[];
}

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  onBack: () => void;
  onResourceTypeChange?: (resourceType: string) => void;
}


export function ResourceList({context, namespace, resourceType, onBack, onResourceTypeChange}: ResourceListProps) {
  const cacheKey = getCacheKey(context, namespace, resourceType)
  const isMountedRef = useRef(true)

  const [cachedData, setCachedData] = useState<CachedTimestampedResources | null>(null)
  const [resourceTypes, setResourceTypes] = useState<string[]>([])

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [columnConfig, setColumnConfig] = useState<ResourceTypeConfig>(DEFAULT_RESOURCE_CONFIG)
  const [resources, setResources] = useState<ResourceItem[]>([])

  // Fetch resource types on mount
  useEffect(() => {
    async function fetchResourceTypes() {
      try {
        const types = await invoke<string[]>('get_resource_types', { context })
        if (isMountedRef.current) {
          setResourceTypes(types)
        }
      } catch (e) {
        console.error('Failed to fetch resource types:', e)
        // Don't show error for resource types, just use empty array
        if (isMountedRef.current) {
          setResourceTypes([])
        }
      }
    }
    fetchResourceTypes()
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
    reset,
  } = useCombobox<string>({
    items: filteredItems,
    selectedItem: resourceType,
    inputValue: filterInput,
    defaultHighlightedIndex: 0, // Auto-highlight first item
    onInputValueChange: ({ inputValue: newInputValue, type }) => {
      // Only update filter if user is typing (not if selection changes)
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
      // Reset to current value if menu closes without selection
      if (!newIsOpen) {
        setFilterInput(resourceType)
      }
    },
    itemToString: (item: string | null) => item || '',
  })

  // Async function to fetch and update resources
  const loadResources = useCallback(async () => {
    if (!isMountedRef.current) return
    
    setIsRefreshing(true)
    // Don't clear error here - only clear it on successful fetch
    // This preserves any existing error state until we have new data
    
    // Wait for React to flush state updates and re-render before starting async operation
    // Use requestAnimationFrame twice to ensure UI has updated
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })

    if (!isMountedRef.current) return

    try {
      const result = await invoke<ResourceListResponse>('get_resources', {
        resourceType,
        context,
        namespace,
      })
      
      if (!isMountedRef.current) return
      
      setResources(result.items)
      setColumnConfig({ columns: result.columns })
      saveCachedResources(cacheKey, result)
      setCachedData({ data: result, timestamp: Date.now() })
      setError(null) // Clear error only on successful fetch
    } catch (e) {
      if (!isMountedRef.current) return
      setError(String(e))
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }, [cacheKey, context, namespace, resourceType])

  // Load cached data immediately and trigger background fetch
  useEffect(() => {
    isMountedRef.current = true
    
    const cached = loadCachedResources(cacheKey)
    if (cached && cached.data) {
      // Set all cached data state synchronously
      setCachedData(cached)
      setResources(cached.data.items || [])
      setColumnConfig({ columns: cached.data.columns || [] })
      setError(null) // Clear any previous errors when showing cached data
      // Don't set isRefreshing here - let loadResources() handle it
      // This allows cached data to display immediately
    } else {
      // If no cached data, show loading state immediately
      setIsRefreshing(true)
    }
    
    // Defer background fetch to allow React to flush cached data updates first
    // Use requestAnimationFrame to ensure UI renders before starting fetch
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loadResources()
      })
    })

    return () => {
      isMountedRef.current = false
      cancelAnimationFrame(rafId)
    }
  }, [cacheKey, loadResources])

  const cacheTimestamp = cachedData?.timestamp ?? null

  const handleRefresh = useCallback(() => {
    // Defer to allow UI to update (button state, cursor, etc.) before starting async operation
    requestAnimationFrame(() => {
        loadResources()
    })
  }, [loadResources])

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
                    // Reset to current selection on blur
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
        <button class={classes.refreshButton} onClick={handleRefresh} disabled={isRefreshing}>
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
              {columnConfig.columns.map((col) => (
                <th key={col.name}>
                  {col.name}
                </th>
              ))}
            </tr>
            </thead>
            <tbody>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={columnConfig.columns.length + 1} class={classes.emptyRow}>
                  No resources found
                </td>
              </tr>
            ) : (
              resources.map((resource) => (
                <tr key={resource.name} class={classes.resourceRow}>
                  <td class={classes.nameCell}>{resource.name}</td>
                  {columnConfig.columns.map((col) => (
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

      {isRefreshing ? (
        <div class={classes.refreshIndicator}>
          {cacheTimestamp ? (
            <>
              <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
            </>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      ) : null}
    </div>
  )
}


