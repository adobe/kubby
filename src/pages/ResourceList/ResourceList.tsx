import {useEffect, useState, useRef, useCallback, useMemo} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import classes from './ResourceList.module.scss'
import {getCacheAge} from '../../kubectl/resourceCache.ts'
import {useResourceLoader} from '../../kubectl/useResourceLoader.ts'
import {NavigationBar} from '../../components/NavigationBar/NavigationBar.tsx'
import type {NavigationNode} from '../../navigation/navigationTypes.ts'
import {ResourceListShortcutsBar, getShortcutsForResourceType} from './ResourceListShortcutsBar.tsx'
import {Alert} from '../../components/Alert/Alert.tsx'
import {Button, type ButtonHandle} from '../../components/Button/Button.tsx'
import {Combobox} from '../../components/Combobox/Combobox.tsx'
import type {ComboboxHandle} from '../../components/Combobox/Combobox.tsx'
import {isAltModifierPressed, isControlModifierPressed} from '../../navigation/keyboardShortcuts.ts'
import type {LabelSelector} from '../../kubectl/resourceTypes.ts'
import type {ResourceFilter} from '../../kubectl/filterTypes.ts'
import {getResourceNameFilter, toLabelSelectors, getSpecFilters} from '../../kubectl/filterTypes.ts'
import type {DashboardConfig} from '../Dashboard/Dashboard.tsx'
import type {ActionCode} from './resourceActions.ts'
import {executeShell, MODIFICATION_ACTIONS} from './resourceActions.ts'
import {evaluateColumnColor} from '../../kubectl/columnColorEvaluator.ts'
import {getRelatedResources, buildFiltersForRelation} from './relatedResources.ts'
import {
  useDeleteAction,
  useEditAction,
  useRollingRestartAction,
  useScaleAction,
  usePortForwardAction,
  useRunAction,
} from './actions'

/**
 * Check if a keyboard event matches a shortcut string.
 * Requires no modifiers (Ctrl/Cmd/Alt) for action shortcuts.
 */
function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  // Require no modifiers for action shortcuts
  if (e.metaKey || e.ctrlKey || e.altKey) return false

  switch (shortcut) {
    case 'Enter':
      return e.key === 'Enter'
    case 'Del':
      return e.key === 'Delete'
    default:
      // Single letter shortcuts use e.code (e.g., "D" → "KeyD")
      return e.code === `Key${shortcut.toUpperCase()}`
  }
}

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
    for (const cg of group.contextGroups) {
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
    const contextInGroup = group.contextGroups.some(cg => cg.contexts.includes(context))
    if (!contextInGroup) continue

    for (const ng of group.namespaceGroups) {
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
  /** All active filters for the current view */
  filters?: ResourceFilter[];
  navigationStack: NavigationNode[];
  dashboardConfig: DashboardConfig;
  readOnly: boolean;
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
  onResourceTypeChange?: (resourceType: string) => void;
  onContextChange?: (context: string) => void;
  onNamespaceChange?: (namespace: string) => void;
  onResourceClick?: (resourceType: string, resourceName: string, labels: LabelSelector[]) => void;
  /** Called when user wants to clear all filters */
  onClearFilters?: () => void;
  /** Called when user wants to describe (view details of) a resource */
  onDescribe?: (resourceType: string, resourceName: string) => void;
  /** Called when user wants to view logs for a resource */
  onLogs?: (resourceType: string, resourceName: string, containerName?: string) => void;
  /** Called when user wants to jump to a related resource */
  onJump?: (targetResourceType: string, filters: ResourceFilter[]) => void;
  initialSelectedIndex?: number;
  onSelectionChange?: (index: number) => void;
  initialFilterText?: string;
  onFilterTextChange?: (filterText: string) => void;
}

export function ResourceList({
                               context,
                               namespace,
                               resourceType,
                               filters = [],
                               navigationStack,
                               dashboardConfig,
                               readOnly,
                               onNavigateToNode,
                               onBack,
                               onResourceTypeChange,
                               onContextChange,
                               onNamespaceChange,
                               onResourceClick,
                               onClearFilters,
                               onDescribe,
                               onLogs,
                               onJump,
                               initialSelectedIndex,
                               onSelectionChange,
                               initialFilterText,
                               onFilterTextChange,
                             }: ResourceListProps) {
  const isMountedRef = useRef(true)
  const resourceComboboxRef = useRef<ComboboxHandle>(null)
  const contextComboboxRef = useRef<ComboboxHandle>(null)
  const namespaceComboboxRef = useRef<ComboboxHandle>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const jumpButtonRef = useRef<ButtonHandle>(null)

  // Text filter state for filtering resources by name
  const [filterText, setFilterText] = useState(initialFilterText ?? '')

  // Containers view has a fixed resource type (not changeable)
  const isContainersView = resourceType === 'containers'

  // Extract label selectors and parent resource name from filters for the resource loader
  const labelSelectors = useMemo(() => toLabelSelectors(filters), [filters])
  const podFilter = getResourceNameFilter(filters, 'pod')
  const parentResourceName = podFilter?.name

  // Extract spec filters for backend filtering
  const specFilters = useMemo(() => {
    const specs = getSpecFilters(filters)
    return specs.map(f => ({path: f.path, value: f.value}))
  }, [filters])

  // Use the resource loader hook - handles caching and background refresh
  const {
    resources: allResources,
    columns,
    cacheTimestamp,
    isRefreshing,
    error,
    evaluationError,
    refresh,
    fetchResources,
    isStale,
  } = useResourceLoader({context, namespace, resourceType, labelSelectors, parentResourceName, specFilters})

  console.log(columns)
  // Filter resources by text filter (case-insensitive substring match on name)
  const resources = useMemo(() => {
    if (!filterText.trim()) {
      return allResources
    }
    const lowerFilter = filterText.toLowerCase()
    return allResources.filter(r => r.name.toLowerCase().includes(lowerFilter))
  }, [allResources, filterText])

  const [resourceTypes, setResourceTypes] = useState<string[]>([])

  // Extract contexts and namespaces from dashboard config
  const allContexts = useMemo(() => getAllContexts(dashboardConfig), [dashboardConfig])
  const availableNamespaces = useMemo(
    () => getNamespacesForContext(dashboardConfig, context),
    [dashboardConfig, context],
  )

  // Auto-refresh configuration from dashboard config (backend provides defaults)
  const liveViewAutoRefresh = dashboardConfig.liveViewAutoRefresh
  const refreshRateSeconds = dashboardConfig.refreshRateSeconds
  const metricsRefreshRateSeconds = dashboardConfig.metricsRefreshRateSeconds

  // Auto-refresh effect - silent background refresh
  useEffect(() => {
    if (!liveViewAutoRefresh) return

    const intervalId = setInterval(() => {
      // Skip if a manual refresh is already in progress
      if (isRefreshing) return

      // Perform silent refresh (doesn't set isRefreshing flag)
      fetchResources()
    }, refreshRateSeconds * 1000)

    return () => clearInterval(intervalId)
  }, [liveViewAutoRefresh, refreshRateSeconds, isRefreshing, fetchResources])

  // Metrics refresh effect - refreshes metrics cache independently
  // Only runs for resource types that can have metrics (pods, containers)
  useEffect(() => {
    const resourceTypeNeedsMetrics = ['pods', 'containers'].includes(resourceType.toLowerCase())
    if (!resourceTypeNeedsMetrics || !metricsRefreshRateSeconds) return

    const refreshMetrics = async () => {
      try {
        await invoke('refresh_metrics_cache', {context, namespace})
        // Trigger resource refresh to pick up new metrics
        fetchResources()
      } catch (e) {
        // Silently ignore metrics errors - graceful degradation
        console.debug('Metrics refresh failed:', e)
      }
    }

    // Initial metrics fetch
    refreshMetrics()

    // Set up interval for subsequent fetches
    const intervalId = setInterval(refreshMetrics, metricsRefreshRateSeconds * 1000)

    return () => clearInterval(intervalId)
  }, [context, namespace, resourceType, metricsRefreshRateSeconds, fetchResources])

  // Selected row index (-1 means no selection)
  // Initialize from prop if provided, otherwise -1
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex ?? -1)

  // Port forward error state (for silent failures)
  const [portForwardError, setPortForwardError] = useState<string | null>(null)

  // Handle port forward failure callback
  const handlePortForwardFailed = useCallback((resourceName: string, localPort: number, targetPort: number) => {
    setPortForwardError(`Port forward to ${resourceName}:${targetPort} (local ${localPort}) failed unexpectedly`)
    // Auto-clear error after 10 seconds
    setTimeout(() => setPortForwardError(null), 10000)
  }, [])

  // Action hooks
  const deleteAction = useDeleteAction({
    context,
    namespace,
    resourceType,
    onSuccess: refresh,
    readOnly,
  })

  const editAction = useEditAction({
    context,
    namespace,
    resourceType,
    onSuccess: refresh,
  })

  const rollingRestartAction = useRollingRestartAction({
    context,
    namespace,
    readOnly,
  })

  const scaleAction = useScaleAction({
    context,
    namespace,
    readOnly,
  })

  const portForwardAction = usePortForwardAction({
    context,
    namespace,
    resourceType,
    parentResourceName,
    readOnly,
    onPortForwardFailed: handlePortForwardFailed,
  })

  const runAction = useRunAction({
    allRunCommands: dashboardConfig.runCommands ?? [],
    resourceType,
    context,
    namespace,
    readOnly,
  })

  // Handle action from shortcuts bar or keyboard
  const handleAction = useCallback(async (code: ActionCode) => {
    // Check if action is a modification action and we're in read-only mode
    if (readOnly && MODIFICATION_ACTIONS.includes(code)) {
      return
    }

    // Actions that don't require a selection
    if (code === 'run') {
      runAction.openRun()
      return
    }

    // AI action - opens AI assistant with current context
    if (code === 'ai' && dashboardConfig.ai) {
      const selectedResource = selectedIndex >= 0 ? resources[selectedIndex] : null
      try {
        await invoke('open_ai_tool', {
          params: {
            tool: dashboardConfig.ai.tool,
            context,
            namespace,
            resourceType: resourceType !== 'containers' ? resourceType : undefined,
            resourceName: selectedResource?.name,
            readOnly: dashboardConfig.ai.readOnly,
          }
        })
      } catch (e) {
        console.error('Failed to open AI tool:', e)
      }
      return
    }

    // All other actions require a selection
    if (selectedIndex < 0 || !resources[selectedIndex]) return
    const resource = resources[selectedIndex]

    switch (code) {
      case 'pods':
      case 'containers':
        // Navigate to child resources (same as Enter/double-click)
        onResourceClick?.(resourceType, resource.name, resource.labels)
        break

      case 'describe':
        onDescribe?.(resourceType, resource.name)
        break

      case 'edit':
        editAction.startEdit(resource.name)
        break

      case 'logs':
        if (onLogs) {
          if (isContainersView && parentResourceName) {
            // For containers, get logs from the parent pod with this container selected
            onLogs('pod', parentResourceName, resource.name)
          } else {
            onLogs(resourceType, resource.name)
          }
        }
        break

      case 'shell': {
        const result = await executeShell({
          context,
          namespace,
          resourceType,
          resourceName: resource.name,
          parentResourceName,
        })
        if (!result.success) {
          console.error('Shell failed:', result.error)
        }
        break
      }

      case 'delete':
        deleteAction.openDelete(resource.name)
        break

      case 'rolling_restart':
        rollingRestartAction.openRollingRestart(resource.name)
        break

      case 'port_forward':
        // Extract ports from the resource's rawValues if available
        const rawPorts = resource.rawValues?.PORTS
        const initialPorts = rawPorts
          ? rawPorts.map(p => typeof p === 'number' ? p : parseInt(String(p), 10)).filter(p => !isNaN(p) && p > 0)
          : undefined
        portForwardAction.openPortForward(resource.name, initialPorts)
        break

      case 'scale':
        scaleAction.openScale(resource.name)
        break

      case 'replica_sets':
      case 'show_port_forward':
        // TODO: Implement these actions
        console.log(`Action ${code} not yet implemented`)
        break
    }
  }, [
    selectedIndex, resources, resourceType, context, namespace,
    parentResourceName, isContainersView, readOnly,
    onResourceClick, onDescribe, onLogs,
    runAction, editAction, deleteAction, rollingRestartAction, scaleAction, portForwardAction,
  ])

  // Handle jump to related resource
  const handleJump = useCallback((relationCode: string) => {
    if (selectedIndex < 0 || !resources[selectedIndex] || !onJump) return

    const resource = resources[selectedIndex]
    const relatedResources = getRelatedResources(resourceType)
    const relation = relatedResources.find(r => r.code === relationCode)

    if (!relation) {
      console.warn(`Unknown relation code: ${relationCode}`)
      return
    }

    // Build filters for the target resource
    const jumpFilters = buildFiltersForRelation(
      relation,
      resourceType,
      resource.name,
      resource.labels,
    )

    onJump(relation.targetResourceType, jumpFilters)
  }, [selectedIndex, resources, resourceType, onJump])

  // Reset selection when navigating to a different resource list
  // Use initialSelectedIndex if returning to same node, otherwise start fresh
  useEffect(() => {
    const newIndex = initialSelectedIndex ?? (resources.length > 0 ? 0 : -1)
    setSelectedIndex(newIndex)
  }, [context, namespace, resourceType])

  // Restore text filter when navigating back to a node that had a filter
  // Clear it when navigating to a new node (initialFilterText will be undefined)
  useEffect(() => {
    setFilterText(initialFilterText ?? '')
  }, [context, namespace, resourceType, initialFilterText])

  // Select first row when resources load for the first time, adjust if out of bounds
  useEffect(() => {
    if (resources.length === 0) {
      // Only reset selection if not loading and not transitioning between views
      // This prevents losing initialSelectedIndex during navigation transitions
      if (!isRefreshing && !isStale) {
        setSelectedIndex(-1)
      }
    } else if (selectedIndex < 0) {
      // Select first row when resources first load
      setSelectedIndex(0)
    } else if (selectedIndex >= resources.length) {
      // If current selection is beyond the new list size, select the last item
      setSelectedIndex(resources.length - 1)
    }
  }, [resources.length, selectedIndex, isRefreshing, isStale])

  // Notify parent when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIndex)
  }, [selectedIndex, onSelectionChange])

  // Notify parent when filter text changes (for navigation state persistence)
  useEffect(() => {
    onFilterTextChange?.(filterText)
  }, [filterText, onFilterTextChange])

  // Scroll selected row into view when selection changes
  useEffect(() => {
    if (selectedIndex >= 0 && tableBodyRef.current) {
      const row = tableBodyRef.current.querySelector(`tr[data-index="${selectedIndex}"]`)
      row?.scrollIntoView({block: 'nearest', behavior: 'smooth'})
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
      // Note: App.tsx handleContextChange handles containers view (goes back to parent)
      // and clears filters to avoid race conditions
      onContextChange(newContext)
    }
  }, [context, onContextChange])

  // Handle namespace selection from combobox
  const handleNamespaceSelect = useCallback((newNamespace: string | null) => {
    if (newNamespace && newNamespace !== namespace && onNamespaceChange) {
      // Note: App.tsx handleNamespaceChange handles containers view (goes back to parent)
      // and clears filters to avoid race conditions
      onNamespaceChange(newNamespace)
    }
  }, [namespace, onNamespaceChange])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input (except for Escape)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Escape - clear text filter first, then go back (but not if any combobox is open - let it close first)
      // Note: Modals capture all keyboard events, so this won't run when a modal is open
      // Note: FilterInput handles its own Escape (blur/clear) and stops propagation
      if (e.key === 'Escape') {
        if (isAnyComboboxOpen) {
          // Let the combobox handle Escape to close itself
          return
        }
        // If focused on an input (like a combobox), blur it instead of going back
        if (isInput) {
          (target as HTMLInputElement).blur()
          e.preventDefault()
          return
        }
        e.preventDefault()
        // Clear text filter first before going back
        if (filterText) {
          setFilterText('')
          return
        }
        onBack()
        return
      }

      // Skip other shortcuts if in an input
      if (isInput) return

      // Ctrl+R / Cmd+R - Refresh
      // Use e.code for physical key to avoid locale issues
      if (e.code === 'KeyR' && isControlModifierPressed(e)) {
        e.preventDefault()
        refresh()
        return
      }

      // Opt+R - Focus resource type combobox (not available in containers view)
      // Use e.code because Opt+letter produces special characters on macOS (e.g., Opt+R → '®')
      if (e.code === 'KeyR' && isAltModifierPressed(e) && !isContainersView) {
        e.preventDefault()
        resourceComboboxRef.current?.focus()
        return
      }

      // Alternative resource shortcut : (as in k9s)
      if (e.key === ':' && !isContainersView) {
        e.preventDefault()
        resourceComboboxRef.current?.focus()
        return
      }

      // Opt+C - Focus context combobox
      // Use e.code because Opt+letter produces special characters on macOS (e.g., Opt+C → 'ç')
      if (e.code === 'KeyC' && isAltModifierPressed(e)) {
        e.preventDefault()
        contextComboboxRef.current?.focus()
        return
      }

      // Opt+N - Focus namespace combobox
      // Use e.code because Opt+letter produces special characters on macOS (e.g., Opt+N → '˜')
      if (e.code === 'KeyN' && isAltModifierPressed(e)) {
        e.preventDefault()
        namespaceComboboxRef.current?.focus()
        return
      }

      // "/" - Focus filter input
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        filterInputRef.current?.focus()
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
            if (prev <= 0) return 0 // Stay at first item
            return prev - 1
          })
          return
        }

        // PageDown - move selection down by a page
        if (e.key === 'PageDown') {
          e.preventDefault()
          const pageSize = 10
          setSelectedIndex(prev => {
            if (prev < 0) return Math.min(pageSize - 1, resources.length - 1)
            return Math.min(prev + pageSize, resources.length - 1)
          })
          return
        }

        // PageUp - move selection up by a page
        if (e.key === 'PageUp') {
          e.preventDefault()
          const pageSize = 10
          setSelectedIndex(prev => {
            if (prev <= 0) return 0 // Stay at first item
            return Math.max(prev - pageSize, 0)
          })
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

        // J - Open Jump dropdown (if available)
        if (e.code === 'KeyJ' && !e.metaKey && !e.ctrlKey && !e.altKey && selectedIndex >= 0) {
          const relatedResources = getRelatedResources(resourceType)
          if (relatedResources.length > 0) {
            e.preventDefault()
            jumpButtonRef.current?.toggle()
          }
          return
        }

        // A - Open AI assistant (if configured)
        if (e.code === 'KeyA' && !e.metaKey && !e.ctrlKey && !e.altKey && dashboardConfig.ai) {
          e.preventDefault()
          handleAction('ai')
          return
        }

        // Action shortcuts - derived from shortcut bar configuration
        const hasSelection = selectedIndex >= 0
        const activeShortcuts = getShortcutsForResourceType(resourceType, hasSelection, runAction.hasRunCommands)

        for (const shortcut of activeShortcuts) {
          if (matchesShortcut(e, shortcut.shortcut)) {
            // Skip if read-only and action is modifying
            if (readOnly && shortcut.isModifying) return

            e.preventDefault()
            // Special case: Enter activates row (pods/containers navigation)
            if (shortcut.shortcut === 'Enter') {
              handleRowActivate(selectedIndex)
            } else {
              handleAction(shortcut.code)
            }
            return
          }
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, refresh, resources, resourceType, selectedIndex, handleRowActivate, isAnyComboboxOpen, runAction.hasRunCommands, handleAction, readOnly, filterText, dashboardConfig.ai])

  return (
    <div class={classes.ResourceList}>
      <header class={classes.header}>
        <div className={classes.headerContext}>
          <div className={classes.headerSwitchers}>
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
              label="Resource"
              shortcut="Opt+R"
            />
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
              label="Context"
              shortcut="Opt+C"
            />
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
              label="Namespace"
              shortcut="Opt+N"
            />
          </div>

          <div className={classes.headerButtons}>
            <Button
              label="Refresh"
              shortcut={'Ctrl+R'}
              onClick={refresh}
              disabled={isRefreshing}
              tabIndex={4}
              className={classes.refreshButton}
            />
            <Button
              label="Back"
              shortcut="Esc"
              onClick={onBack}
              tabIndex={5}
              className={classes.backButton}
            />
          </div>
        </div>

        <div class={classes.navigationBar}>
          <NavigationBar
            navigationStack={navigationStack}
            onNavigateToNode={onNavigateToNode}
            filters={filters}
            onClearFilters={onClearFilters}
            filterText={filterText}
            onFilterTextChange={setFilterText}
            onFilterClear={() => setFilterText('')}
            filterInputRef={filterInputRef}
            filterInputTabIndex={0}
            onFilterSubmit={() => {
              // Select first filtered result when Enter is pressed
              if (resources.length > 0) {
                setSelectedIndex(0)
              }
            }}
          />
        </div>

      </header>

      <div class={classes.body}>
        <Alert type="error" label="Edit Failed" message={editAction.editError}/>
        <Alert type="error" label="Port Forward Failed" message={portForwardError}/>
        <Alert type="error" label="Loading Error" message={error}/>
        <Alert type="error" label="Column Evaluation Error" message={evaluationError}/>

        {/* Show table if we have resources OR if there's no error (empty state) */}
        {(resources.length > 0 || !error) && (
          <div class={classes.tableWrapper}>
            <table class={classes.table}>
              <thead>
              <tr tabIndex={-1}>
                <th class={classes.nameColumn}>NAME</th>
                {columns.map((col) => (
                  <th key={col.name} class={col.align === 'end' ? classes.alignEnd : undefined}>
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
                      <div class={classes.nameContent}>
                        <span>{resource.name}</span>
                        {editAction.editingResourceName === resource.name && (
                          <span class={classes.editingChip}>Editing</span>
                        )}
                      </div>
                    </td>
                    {columns.map((col) => {
                      // Evaluate color for this column
                      const rawValues = resource.rawValues?.[col.name] || []
                      const placeholderValues = rawValues.map(v => {
                        const num = parseFloat(v as string)
                        return isNaN(num) ? v : num
                      })
                      const colorState = evaluateColumnColor(col.colorRules, placeholderValues)
                      const cellClass = colorState ? `${classes.dataCell} ${classes[`color-${colorState}`]}` : classes.dataCell

                      // Check if this is a PORTS column and if there are active port forwards
                      const isPortsColumn = col.name.toUpperCase() === 'PORTS' || col.name.toUpperCase() === 'PORT(S)'
                      const forwardedPorts = portForwardAction.portForwardsByResource.get(resource.name)
                      const hasPortForwards = isPortsColumn && forwardedPorts && forwardedPorts.length > 0

                      return (
                        <td key={col.name} class={`${cellClass}${col.align === 'end' ? ` ${classes.alignEnd}` : ''}`}>
                          {resource[col.name] ?? '<none>'}
                          {hasPortForwards && (
                            <span class={classes.portForwardIndicator}>
                              {' → '}{forwardedPorts.join(', ')}
                            </span>
                          )}
                        </td>
                      )
                    })}
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
      </div>

      <ResourceListShortcutsBar
        resourceType={resourceType}
        hasSelection={selectedIndex >= 0}
        disabled={error !== null}
        hasRunCommands={runAction.hasRunCommands}
        readOnly={readOnly}
        aiConfig={dashboardConfig.ai}
        availableResourceTypes={resourceTypes}
        onAction={handleAction}
        onJump={handleJump}
        jumpButtonRef={jumpButtonRef}
      />

      {/* Action modals */}
      {runAction.renderRunModal(
        selectedIndex >= 0 && resources[selectedIndex] ? resources[selectedIndex].name : '',
        selectedIndex >= 0 && resources[selectedIndex] ? resources[selectedIndex].labels : [],
      )}
      {deleteAction.DeleteModal}
      {rollingRestartAction.RollingRestartModal}
      {scaleAction.ScaleModal}
      {portForwardAction.PortForwardModal}
    </div>
  )
}
