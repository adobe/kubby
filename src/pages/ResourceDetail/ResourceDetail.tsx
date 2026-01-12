import {useEffect, useState, useCallback, useMemo, useRef} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {stringify} from 'yaml'
import classes from './ResourceDetail.module.scss'
import {getCacheAge} from '../../kubectl/resourceCache.ts'
import {useResourceDetailLoader} from '../../kubectl/useResourceDetailLoader.ts'
import type {NavigationNode} from '../../navigation/navigationTypes.ts'
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
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
}

/**
 * Shortcuts bar for resource detail view
 */
function DetailShortcutsBar({viewMode, onViewModeChange, onEdit, isEditing}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEdit: () => void;
  isEditing: boolean;
}) {
  return (
    <ShortcutsBar>
      <Button
        label={isEditing ? "Editing..." : "Edit"}
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
    </ShortcutsBar>
  )
}

export function ResourceDetail({
                                 context,
                                 namespace,
                                 resourceType,
                                 resourceName,
                                 onBack,
                               }: ResourceDetailProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Use the resource detail loader hook - handles caching and background refresh
  const {
    detail,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
  } = useResourceDetailLoader({context, namespace, resourceType, resourceName})

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
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, handleRefresh, handleEdit, handleViewModeChange])

  // Memoize the code strings to avoid re-highlighting on every render
  const yamlCode = useMemo(() => detail ? stringify(detail) : '', [detail])
  const jsonCode = useMemo(() => detail ? JSON.stringify(detail, null, 2) : '', [detail])

  const renderContent = useCallback(() => {
    if (!detail) {
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
        return <TreeView data={detail}/>
    }
  }, [detail, viewMode, isRefreshing, yamlCode, jsonCode])

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
        <Alert type="error" label="Edit Failed" message={editError} />
        <Alert type="error" label="Loading Error" message={error} />

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

      <DetailShortcutsBar viewMode={viewMode} onViewModeChange={handleViewModeChange} onEdit={handleEdit} isEditing={isEditing}/>
    </div>
  )
}
