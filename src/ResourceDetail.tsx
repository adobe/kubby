import {useEffect, useState, useCallback, useMemo} from 'preact/hooks'
import {stringify} from 'yaml'
import classes from './ResourceDetail.module.scss'
import {getCacheAge} from './kubectl/resourceCache'
import {useResourceDetailLoader} from './kubectl/useResourceDetailLoader'
import type {NavigationNode} from './navigation/navigationTypes'
import {Button} from './components/Button.tsx'
import {CodeView} from './components/CodeView.tsx'
import {TreeView} from './components/TreeView.tsx'
import {isControlModifierPressed} from './navigation/keyboardShortcuts.ts'

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
function DetailShortcutsBar({viewMode, onViewModeChange}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void
}) {
  return (
    <div class={classes.shortcutsBar}>
      <Button
        label="Edit"
        shortcut="E"
        onClick={() => {
        }}
        tabIndex={0}
        disabled
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
    </div>
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

  // Use the resource detail loader hook - handles caching and background refresh
  const {
    detail,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
  } = useResourceDetailLoader({context, namespace, resourceType, resourceName})

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
        refresh()
        return
      }

      // Y - View YAML
      if (e.code === 'KeyY' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setViewMode('yaml')
        return
      }

      // J - View JSON
      if (e.code === 'KeyJ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setViewMode('json')
        return
      }

      // T - View Tree (hierarchical)
      if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setViewMode('tree')
        return
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, refresh])

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
            onClick={refresh}
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

      <div class={classes.body}>
        {error && (
          <div class={classes.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!error && (
          <div class={classes.contentWrapper}>
            {renderContent()}
          </div>
        )}
      </div>

      {isRefreshing && (
        <div class={classes.refreshIndicator}>
          {cacheTimestamp ? (
            <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      )}

      <DetailShortcutsBar viewMode={viewMode} onViewModeChange={setViewMode}/>
    </div>
  )
}
