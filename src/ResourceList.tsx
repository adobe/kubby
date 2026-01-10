import {useEffect, useState, useRef, useCallback, useMemo} from 'preact/hooks'
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
import type {ComboboxHandle} from './components/Combobox.tsx'
import {isPrimaryModifierPressed, isAltPressed} from './navigation/keyboardShortcuts.ts'
import type {LabelSelector} from './kubectl/resourceTypes'
import type {DashboardConfig} from './Dashboard'

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

/**
 * Extract all contexts from dashboard config (flattened from all groups).
 */
function getAllContexts(config: DashboardConfig): string[] {
  const contexts: string[] = []
  for (const group of config.groups) {
    for (const cg of group.context_groups) {
      for (const ctx of cg.contexts) {
        if (!contexts.includes(ctx)) {
          contexts.push(ctx)
        }
      }
    }
  }
  return contexts
}

/**
 * Get all namespaces available for a given context from the dashboard config.
 * Returns namespaces where contexts is null (available everywhere) or includes the context.
 */
function getNamespacesForContext(config: DashboardConfig, context: string): string[] {
  const namespaces: string[] = []
  
  for (const group of config.groups) {
    // Check if context exists in this group
    const contextInGroup = group.context_groups.some(cg => cg.contexts.includes(context))
    if (!contextInGroup) continue
    
    for (const ng of group.namespace_groups) {
      for (const ns of ng.namespaces) {
        // Namespace is available if contexts is null or includes this context
        if (ns.contexts === null || ns.contexts.includes(context)) {
          if (!namespaces.includes(ns.name)) {
            namespaces.push(ns.name)
          }
        }
      }
    }
  }
  
  return namespaces
}

interface ResourceListProps {
  context: string;
  namespace: string;
  resourceType: string;
  labelSelectors?: LabelSelector[];
  navigationStack: NavigationNode[];
  dashboardConfig: DashboardConfig;
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
  onResourceTypeChange?: (resourceType: string) => void;
  onContextChange?: (context: string) => void;
  onNamespaceChange?: (namespace: string) => void;
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
                               dashboardConfig,
                               onNavigateToNode,
                               onBack,
                               onResourceTypeChange,
                               onContextChange,
                               onNamespaceChange,
                               onResourceClick,
                               onRemoveFilter,
                               initialSelectedIndex,
                               onSelectionChange,
                               parentResourceName,
                             }: ResourceListProps) {
  const isMountedRef = useRef(true)
  const resourceComboboxRef = useRef<ComboboxHandle>(null)
  const contextComboboxRef = useRef<ComboboxHandle>(null)
  const namespaceComboboxRef = useRef<ComboboxHandle>(null)
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

  // Extract contexts and namespaces from dashboard config
  const allContexts = useMemo(() => getAllContexts(dashboardConfig), [dashboardConfig])
  const availableNamespaces = useMemo(
    () => getNamespacesForContext(dashboardConfig, context),
    [dashboardConfig, context]
  )

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

  // Track if comboboxes are open (for Escape key handling)
  const [isResourceComboboxOpen, setIsResourceComboboxOpen] = useState(false)
  const [isContextComboboxOpen, setIsContextComboboxOpen] = useState(false)
  const [isNamespaceComboboxOpen, setIsNamespaceComboboxOpen] = useState(false)
  const isAnyComboboxOpen = isResourceComboboxOpen || isContextComboboxOpen || isNamespaceComboboxOpen

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

  // Handle context selection from combobox
  const handleContextSelect = useCallback((newContext: string | null) => {
    if (newContext && newContext !== context && onContextChange) {
      onContextChange(newContext)
    }
  }, [context, onContextChange])

  // Handle namespace selection from combobox
  const handleNamespaceSelect = useCallback((newNamespace: string | null) => {
    if (newNamespace && newNamespace !== namespace && onNamespaceChange) {
      onNamespaceChange(newNamespace)
    }
  }, [namespace, onNamespaceChange])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input (except for Escape)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Escape - go back (but not if any combobox is open - let it close first)
      if (e.key === 'Escape') {
        if (isAnyComboboxOpen) {
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

      // Opt+R - Focus resource type combobox (not available in containers view)
      if (e.key === 'r' && isAltPressed(e) && !isContainersView) {
        e.preventDefault()
        resourceComboboxRef.current?.focus()
        return
      }

      // Opt+C - Focus context combobox
      if (e.key === 'c' && isAltPressed(e)) {
        e.preventDefault()
        contextComboboxRef.current?.focus()
        return
      }

      // Opt+N - Focus namespace combobox
      if (e.key === 'n' && isAltPressed(e)) {
        e.preventDefault()
        namespaceComboboxRef.current?.focus()
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
  }, [onBack, refresh, resources.length, selectedIndex, handleRowActivate, isAnyComboboxOpen, isContainersView])

  return (
    <div class={classes.resourceList}>
      <header class={classes.header}>
        <div class={classes.headerInfo}>
          <Label label="Resource" shortcut="Opt+R">
            <Combobox
              ref={resourceComboboxRef}
              items={resourceTypes}
              selectedItem={resourceType}
              onSelectedItemChange={handleResourceTypeSelect}
              itemToString={(item) => item || ''}
              filterItems={filterResourceTypes}
              placeholder="Select resource type..."
              emptyMessage="No resource types found"
              tabIndex={1}
              onOpenChange={setIsResourceComboboxOpen}
            />
          </Label>
          <Label label="Context" shortcut="Opt+C">
            <Combobox
              ref={contextComboboxRef}
              items={allContexts}
              selectedItem={context}
              onSelectedItemChange={handleContextSelect}
              itemToString={(item) => item || ''}
              placeholder="Select context..."
              emptyMessage="No contexts found"
              tabIndex={2}
              onOpenChange={setIsContextComboboxOpen}
            />
          </Label>
          <Label label="Namespace" shortcut="Opt+N">
            <Combobox
              ref={namespaceComboboxRef}
              items={availableNamespaces}
              selectedItem={namespace}
              onSelectedItemChange={handleNamespaceSelect}
              itemToString={(item) => item || ''}
              placeholder="Select namespace..."
              emptyMessage="No namespaces found"
              tabIndex={3}
              onOpenChange={setIsNamespaceComboboxOpen}
            />
          </Label>
        </div>
        <div class={classes.headerButtons}>
          <ShortcutButton
            label="Refresh"
            shortcut={'Cmd+R'}
            onClick={refresh}
            disabled={isRefreshing}
            tabIndex={4}
            className={classes.refreshButton}
          />
          <ShortcutButton
            label="Back"
            shortcut="Esc"
            onClick={onBack}
            tabIndex={5}
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
