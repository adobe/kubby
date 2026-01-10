import {useEffect, useState, useRef, useCallback} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import classes from './ResourceList.module.scss'
import {getCacheAge} from './kubectl/resourceCache'
import {useResourceLoader} from './kubectl/useResourceLoader'
import {NavigationBar} from './components/NavigationBar.tsx'
import type {NavigationNode} from './navigation/navigationTypes'
import {ShortcutsBar} from './components/ShortcutsBar.tsx'
import {ShortcutButton} from './components/ShortcutButton.tsx'
import {Label} from './components/Label.tsx'
import {Combobox} from './components/Combobox.tsx'
import {isPrimaryModifierPressed} from './navigation/keyboardShortcuts.ts'
import type {LabelSelector} from './kubectl/resourceTypes'

/**
 * Filter and sort resource types by relevance to the input.
 * Prioritizes: exact match > singular/plural match > starts with > contains
 */
function filterResourceTypes(items: string[], inputValue: string): string[] {
  const lowerInput = inputValue.toLowerCase()
  
  return items
    .filter(item => item.toLowerCase().includes(lowerInput))
    .sort((a, b) => {
      const lowerA = a.toLowerCase()
      const lowerB = b.toLowerCase()

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
}

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  labelSelectors?: LabelSelector[];
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
  onResourceTypeChange?: (resourceType: string) => void;
  onResourceClick?: (resourceType: string, resourceName: string, labels: LabelSelector[]) => void;
  onRemoveFilter?: (index: number) => void;
  initialSelectedIndex?: number;
  onSelectionChange?: (index: number) => void;
  parentResourceName?: string; // For containers view: the pod name
}

export function ResourceList({
                               context,
                               namespace,
                               resourceType,
                               labelSelectors,
                               navigationStack,
                               onNavigateToNode,
                               onBack,
                               onResourceTypeChange,
                               onResourceClick,
                               onRemoveFilter,
                               initialSelectedIndex,
                               onSelectionChange,
                               parentResourceName,
                             }: ResourceListProps) {
  const isMountedRef = useRef(true)
  const comboboxRef = useRef<{ focus: () => void }>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)

  // Containers view has a fixed resource type (not changeable)
  const isContainersView = resourceType === 'containers'

  // Use the resource loader hook - handles caching and background refresh
  const {
    resources,
    columns,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
  } = useResourceLoader({context, namespace, resourceType, labelSelectors, parentResourceName})

  const [resourceTypes, setResourceTypes] = useState<string[]>([])

  // Selected row index (-1 means no selection)
  // Initialize from prop if provided, otherwise -1
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex ?? -1)

  // Reset selection when navigating to a different resource list
  // Use initialSelectedIndex if returning to same node, otherwise start fresh
  useEffect(() => {
    const newIndex = initialSelectedIndex ?? (resources.length > 0 ? 0 : -1)
    setSelectedIndex(newIndex)
  }, [context, namespace, resourceType])

  // Select first row when resources load for the first time, adjust if out of bounds
  useEffect(() => {
    if (resources.length === 0) {
      // Only reset selection if not loading (actual empty result)
      // This prevents losing initialSelectedIndex during loading transitions
      if (!isRefreshing) {
        setSelectedIndex(-1)
      }
    } else if (selectedIndex < 0) {
      // Select first row when resources first load
      setSelectedIndex(0)
    } else if (selectedIndex >= resources.length) {
      // If current selection is beyond the new list size, select the last item
      setSelectedIndex(resources.length - 1)
    }
  }, [resources.length, selectedIndex, isRefreshing])

  // Notify parent when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIndex)
  }, [selectedIndex, onSelectionChange])

  // Scroll selected row into view when selection changes
  useEffect(() => {
    if (selectedIndex >= 0 && tableBodyRef.current) {
      const row = tableBodyRef.current.querySelector(`tr[data-index="${selectedIndex}"]`)
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // Fetch resource types on mount
  useEffect(() => {
    isMountedRef.current = true

    async function fetchResourceTypes() {
      try {
        const types = await invoke<string[]>('get_resource_types', {context})
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

  // Track if combobox is open (for Escape key handling)
  const [isComboboxOpen, setIsComboboxOpen] = useState(false)

  // Handle row click
  const handleRowClick = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  // Handle row double-click or Enter on selected row
  const handleRowActivate = useCallback((index: number) => {
    if (onResourceClick && resources[index]) {
      const resource = resources[index]
      onResourceClick(resourceType, resource.name, resource.labels)
    }
  }, [onResourceClick, resources, resourceType])

  // Handle resource type selection from combobox
  const handleResourceTypeSelect = useCallback((newResourceType: string | null) => {
    if (newResourceType && newResourceType !== resourceType && onResourceTypeChange) {
      onResourceTypeChange(newResourceType)
    }
  }, [resourceType, onResourceTypeChange])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input (except for Escape)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Escape - go back (but not if combobox is open - let it close first)
      if (e.key === 'Escape') {
        if (isComboboxOpen) {
          // Let the combobox handle Escape to close itself
          return
        }
        e.preventDefault()
        onBack()
        return
      }

      // Skip other shortcuts if in an input
      if (isInput) return

      // Ctrl+R / Cmd+R - Refresh
      if (e.key === 'r' && isPrimaryModifierPressed(e)) {
        e.preventDefault()
        refresh()
        return
      }

      // Ctrl+K / Cmd+K - Focus combobox (not available in containers view)
      if (e.key === 'k' && isPrimaryModifierPressed(e) && !isContainersView) {
        e.preventDefault()
        comboboxRef.current?.focus()
        return
      }

      // Arrow key navigation for resource list (works globally)
      if (resources.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(prev => {
            if (prev < 0) return 0 // First arrow down selects first item
            return Math.min(prev + 1, resources.length - 1)
          })
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(prev => {
            if (prev < 0) return 0 // First arrow up also selects first item
            return Math.max(prev - 1, 0)
          })
          return
        }

        // Enter activates selected resource
        if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault()
          handleRowActivate(selectedIndex)
          return
        }

        // Home/End for quick navigation
        if (e.key === 'Home') {
          e.preventDefault()
          setSelectedIndex(0)
          return
        }

        if (e.key === 'End') {
          e.preventDefault()
          setSelectedIndex(resources.length - 1)
          return
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, refresh, resources.length, selectedIndex, handleRowActivate, isComboboxOpen, isContainersView])

  return (
    <div class={classes.resourceList}>
      <header class={classes.header}>
        <div class={classes.headerInfo}>
          <Label label="Resource" shortcut="Cmd+K">
            <Combobox
              ref={comboboxRef}
              items={resourceTypes}
              selectedItem={resourceType}
              onSelectedItemChange={handleResourceTypeSelect}
              itemToString={(item) => item || ''}
              filterItems={filterResourceTypes}
              placeholder="Select resource type..."
              emptyMessage="No resource types found"
              tabIndex={1}
              onOpenChange={setIsComboboxOpen}
            />
          </Label>
          <Label label="Context" value={context} />
          <Label label="Namespace" value={namespace} />
        </div>
        <div class={classes.headerButtons}>
          <ShortcutButton
            label="Refresh"
            shortcut={'Cmd+R'}
            onClick={refresh}
            disabled={isRefreshing}
            tabIndex={2}
            className={classes.refreshButton}
          />
          <ShortcutButton
            label="Back"
            shortcut="Esc"
            onClick={onBack}
            tabIndex={3}
            className={classes.backButton}
          />
        </div>
      </header>

      <NavigationBar
        navigationStack={navigationStack}
        onNavigateToNode={onNavigateToNode}
        labelSelectors={labelSelectors}
        onRemoveFilter={onRemoveFilter}
      />

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
            <tbody ref={tableBodyRef}>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} class={classes.emptyRow}>
                  {isRefreshing ? '...' : 'No resources found'}
                </td>
              </tr>
            ) : (
              resources.map((resource, index) => (
                <tr
                  key={resource.name}
                  class={`${classes.resourceRow} ${selectedIndex === index ? classes.resourceRowSelected : ''}`}
                  onClick={() => handleRowClick(index)}
                  onDblClick={() => handleRowActivate(index)}
                  data-index={index}
                >
                  <td class={classes.nameCell}>
                    {resource.name}
                  </td>
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
          {resources.length > 0 && (
            <div class={classes.footer}>
              {resources.length} item{resources.length !== 1 ? 's' : ''}
            </div>
          )}
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

      <ShortcutsBar
        resourceType={resourceType}
        hasSelection={selectedIndex >= 0}
      />
    </div>
  )
}
