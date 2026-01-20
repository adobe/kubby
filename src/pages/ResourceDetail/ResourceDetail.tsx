import {useEffect, useState, useCallback, useMemo, useRef} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {stringify} from 'yaml'
import classes from './ResourceDetail.module.scss'
import {getCacheAge} from '../../kubectl/resourceCache.ts'
import {useResourceDetailLoader} from '../../kubectl/useResourceDetailLoader.ts'
import type {NavigationNode} from '../../navigation/navigationTypes.ts'
import type {DashboardConfig} from '../Dashboard/Dashboard.tsx'
import type {ResourceFilter} from '../../kubectl/filterTypes.ts'
import {Button} from '../../components/Button/Button.tsx'
import {Alert} from '../../components/Alert/Alert.tsx'
import {CodeView} from '../../components/CodeView/CodeView.tsx'
import {TreeView} from '../../components/TreeView/TreeView.tsx'
import {ShortcutsBar} from '../../components/ShortcutsBar/ShortcutsBar.tsx'
import {isControlModifierPressed} from '../../navigation/keyboardShortcuts.ts'

type ViewMode = 'tree' | 'yaml' | 'json'

interface ResourceDetailProps {
  context: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  dashboardConfig: DashboardConfig;
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
  onJump?: (targetResourceType: string, filters: ResourceFilter[]) => void;
}

/**
 * Shortcuts bar for resource detail view
 */
function DetailShortcutsBar({viewMode, onViewModeChange, onEdit, isEditing, onCopy, isSecretResource, isDecoded, onToggleDecode}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEdit: () => void;
  isEditing: boolean;
  onCopy: () => void;
  isSecretResource: boolean;
  isDecoded: boolean;
  onToggleDecode: () => void;
}) {
  const canCopy = viewMode === 'yaml' || viewMode === 'json'
  return (
    <ShortcutsBar>
      <Button
        label={isEditing ? 'Editing...' : 'Edit'}
        shortcut="E"
        onClick={onEdit}
        tabIndex={0}
        disabled={isEditing}
      />
      <span class={classes.label}>View: </span>
      <Button
        label="Tree"
        shortcut="T"
        onClick={() => onViewModeChange('tree')}
        tabIndex={0}
        className={viewMode === 'tree' ? classes.activeViewButton : undefined}
      />
      <Button
        label="Yaml"
        shortcut="Y"
        onClick={() => onViewModeChange('yaml')}
        tabIndex={0}
        className={viewMode === 'yaml' ? classes.activeViewButton : undefined}
      />
      <Button
        label="Json"
        shortcut="J"
        onClick={() => onViewModeChange('json')}
        tabIndex={0}
        className={viewMode === 'json' ? classes.activeViewButton : undefined}
      />
      {canCopy && (
        <Button
          label="Copy"
          shortcut="C"
          onClick={onCopy}
          tabIndex={0}
          disabled={!canCopy}
        />
      )}
      {isSecretResource && (
        <Button
          label="Decode"
          shortcut="X"
          onClick={onToggleDecode}
          tabIndex={0}
          className={isDecoded ? classes.activeViewButton : undefined}
        />
      )}
    </ShortcutsBar>
  )
}

/**
 * Check if resource type is a secret (contains sensitive data)
 */
function isSecretResourceType(resourceType: string): boolean {
  const type = resourceType.toLowerCase()
  return type === 'secret' || type === 'secrets'
}

/**
 * Decode base64 encoded secret data
 */
function decodeSecretData(data: Record<string, unknown>): Record<string, string> {
  const decoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      try {
        decoded[key] = atob(value)
      } catch {
        decoded[key] = value // If decode fails, show original
      }
    } else {
      decoded[key] = String(value)
    }
  }
  return decoded
}

/**
 * Transform secret resource data for display
 * - When hidden: shows character count for each secret value
 * - When decoded: base64 decodes the values
 */
function transformSecretData(detail: Record<string, unknown>, isDecoded: boolean): Record<string, unknown> {
  if (!detail || typeof detail !== 'object') return detail

  const data = detail.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return detail

  if (!isDecoded) {
    // Show character count for each secret value
    const hiddenData: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Decode to get actual character count (base64 encoded length differs from decoded)
        try {
          const decoded = atob(value)
          hiddenData[key] = `[${decoded.length} chars]`
        } catch {
          hiddenData[key] = `[${value.length} chars]`
        }
      } else {
        hiddenData[key] = `[? chars]`
      }
    }
    return {
      ...detail,
      data: hiddenData
    }
  }

  // Decode the secret values
  return {
    ...detail,
    data: decodeSecretData(data)
  }
}

export function ResourceDetail({
                                 context,
                                 namespace,
                                 resourceType,
                                 resourceName,
                                 dashboardConfig,
                                 onBack,
                                 onJump,
                               }: ResourceDetailProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDecoded, setIsDecoded] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Check if this is a secret resource
  const isSecretResource = isSecretResourceType(resourceType)

  // Use the resource detail loader hook - handles caching and background refresh
  const {
    detail,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
    fetchDetail,
  } = useResourceDetailLoader({context, namespace, resourceType, resourceName})

  // Auto-refresh configuration from dashboard config (backend provides defaults)
  const liveViewAutoRefresh = dashboardConfig.liveViewAutoRefresh
  const refreshRateSeconds = dashboardConfig.refreshRateSeconds

  // Auto-refresh effect - silent background refresh
  useEffect(() => {
    if (!liveViewAutoRefresh) return

    const intervalId = setInterval(() => {
      // Skip if a manual refresh is already in progress
      if (isRefreshing) return

      // Perform silent refresh (doesn't set isRefreshing flag)
      fetchDetail()
    }, refreshRateSeconds * 1000)

    return () => clearInterval(intervalId)
  }, [liveViewAutoRefresh, refreshRateSeconds, isRefreshing, fetchDetail])

  // Focus the body for keyboard scrolling when detail loads
  useEffect(() => {
    bodyRef.current?.focus()
  }, [detail])

  // Helper to refocus body after actions
  const refocusBody = useCallback(() => {
    bodyRef.current?.focus()
  }, [])

  // Handle view mode change with refocus
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    refocusBody()
  }, [refocusBody])

  // Handle refresh with refocus
  const handleRefresh = useCallback(() => {
    refresh()
    refocusBody()
  }, [refresh, refocusBody])

  // Transform detail data for secrets (hide or decode)
  const displayDetail = useMemo(() => {
    if (!detail) return detail
    if (isSecretResource) {
      return transformSecretData(detail as Record<string, unknown>, isDecoded)
    }
    return detail
  }, [detail, isSecretResource, isDecoded])

  // Memoize the code strings to avoid re-highlighting on every render
  const yamlCode = useMemo(() => displayDetail ? stringify(displayDetail) : '', [displayDetail])
  const jsonCode = useMemo(() => displayDetail ? JSON.stringify(displayDetail, null, 2) : '', [displayDetail])

  // Handle edit resource
  const handleEdit = useCallback(async () => {
    if (isEditing) return

    setIsEditing(true)
    setEditError(null)

    try {
      await invoke('edit_resource', {
        resourceType,
        resourceName,
        context,
        namespace,
      })
      // On success, refresh the resource data
      refresh()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsEditing(false)
      refocusBody()
    }
  }, [resourceType, resourceName, context, namespace, refresh, isEditing, refocusBody])

  // Handle copy to clipboard (yaml or json only)
  const handleCopy = useCallback(async () => {
    if (viewMode !== 'yaml' && viewMode !== 'json') return

    const content = viewMode === 'yaml' ? yamlCode : jsonCode
    try {
      await navigator.clipboard.writeText(content)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
    refocusBody()
  }, [viewMode, yamlCode, jsonCode, refocusBody])

  // Handle toggle decode for secrets
  const handleToggleDecode = useCallback(() => {
    setIsDecoded(prev => !prev)
    refocusBody()
  }, [refocusBody])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Escape - go back
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }

      // Skip other shortcuts if in an input
      if (isInput) return

      // Ctrl+R / Cmd+R - Refresh
      if (e.code === 'KeyR' && isControlModifierPressed(e)) {
        e.preventDefault()
        handleRefresh()
        return
      }

      // Y - View YAML
      if (e.code === 'KeyY' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleViewModeChange('yaml')
        return
      }

      // J - View JSON
      if (e.code === 'KeyJ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleViewModeChange('json')
        return
      }

      // T - View Tree (hierarchical)
      if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleViewModeChange('tree')
        return
      }

      // E - Edit resource
      if (e.code === 'KeyE' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleEdit()
        return
      }

      // C - Copy (yaml/json only)
      if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleCopy()
        return
      }

      // X - Toggle decode for secrets
      if (e.code === 'KeyX' && !e.metaKey && !e.ctrlKey && !e.altKey && isSecretResource) {
        e.preventDefault()
        handleToggleDecode()
        return
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, handleRefresh, handleEdit, handleViewModeChange, handleCopy, isSecretResource, handleToggleDecode])

  const renderContent = useCallback(() => {
    if (!displayDetail) {
      if (isRefreshing) {
        return <div class={classes.loading}>Loading...</div>
      }
      return <div class={classes.empty}>No data available</div>
    }

    switch (viewMode) {
      case 'yaml':
        return <CodeView code={yamlCode} language="yaml"/>
      case 'json':
        return <CodeView code={jsonCode} language="json"/>
      case 'tree':
      default:
        return <TreeView data={displayDetail} onJump={onJump}/>
    }
  }, [displayDetail, viewMode, isRefreshing, yamlCode, jsonCode])

  return (
    <div class={classes.ResourceDetail}>
      <header class={classes.header}>
        <div class={classes.headerInfo}>
          <span class={classes.resourceName}>{resourceName}</span>
          <span class={classes.resourceType}>{resourceType}</span>
        </div>
        <div class={classes.headerButtons}>
          <Button
            label="Refresh"
            shortcut="Ctrl+R"
            onClick={handleRefresh}
            disabled={isRefreshing}
            tabIndex={1}
            className={classes.refreshButton}
          />
          <Button
            label="Back"
            shortcut="Esc"
            onClick={onBack}
            tabIndex={2}
            className={classes.backButton}
          />
        </div>
      </header>

      <div ref={bodyRef} class={classes.body} tabIndex={0}>
        <Alert type="error" label="Edit Failed" message={editError}/>
        <Alert type="error" label="Loading Error" message={error}/>

        {!error && (
          <div class={classes.contentWrapper}>
            {renderContent()}
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

      <DetailShortcutsBar viewMode={viewMode} onViewModeChange={handleViewModeChange} onEdit={handleEdit}
                          isEditing={isEditing} onCopy={handleCopy} isSecretResource={isSecretResource}
                          isDecoded={isDecoded} onToggleDecode={handleToggleDecode}/>
    </div>
  )
}
