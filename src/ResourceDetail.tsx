import { useEffect, useState, useCallback } from 'preact/hooks'
import classes from './ResourceDetail.module.scss'
import { getCacheAge } from './kubectl/resourceCache'
import { useResourceDetailLoader } from './kubectl/useResourceDetailLoader'
import type { NavigationNode } from './navigation/navigationTypes'
import { Button } from './components/Button.tsx'
import { isControlModifierPressed } from './navigation/keyboardShortcuts.ts'

type ViewMode = 'hierarchical' | 'yaml' | 'json'

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
 * Convert a value to YAML string with proper indentation
 */
function toYaml(value: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent)
  
  if (value === null || value === undefined) {
    return 'null'
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  
  if (typeof value === 'number') {
    return String(value)
  }
  
  if (typeof value === 'string') {
    // Check if string needs quoting
    if (value === '' || 
        value.includes('\n') || 
        value.includes(':') || 
        value.includes('#') ||
        value.startsWith(' ') ||
        value.endsWith(' ') ||
        /^[\d.]+$/.test(value) || // Looks like a number
        ['true', 'false', 'null', 'yes', 'no'].includes(value.toLowerCase())) {
      // Multi-line string handling
      if (value.includes('\n')) {
        const lines = value.split('\n')
        return '|\n' + lines.map(line => spaces + '  ' + line).join('\n')
      }
      // Quote the string
      return JSON.stringify(value)
    }
    return value
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    return value.map(item => {
      const itemYaml = toYaml(item, indent + 1)
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        // Object in array - put first key on same line as dash
        const lines = itemYaml.split('\n')
        return `${spaces}- ${lines[0].trimStart()}\n${lines.slice(1).join('\n')}`
      }
      return `${spaces}- ${itemYaml}`
    }).join('\n')
  }
  
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      return '{}'
    }
    return keys.map(key => {
      const val = obj[key]
      const keyStr = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key) ? key : JSON.stringify(key)
      
      if (val === null || val === undefined) {
        return `${spaces}${keyStr}: null`
      }
      
      if (typeof val === 'object' && !Array.isArray(val)) {
        const objVal = val as Record<string, unknown>
        if (Object.keys(objVal).length === 0) {
          return `${spaces}${keyStr}: {}`
        }
        return `${spaces}${keyStr}:\n${toYaml(val, indent + 1)}`
      }
      
      if (Array.isArray(val)) {
        if (val.length === 0) {
          return `${spaces}${keyStr}: []`
        }
        return `${spaces}${keyStr}:\n${toYaml(val, indent + 1)}`
      }
      
      return `${spaces}${keyStr}: ${toYaml(val, indent)}`
    }).join('\n')
  }
  
  return String(value)
}

/**
 * Render a hierarchical tree view of the JSON data
 */
function HierarchicalView({ data, level = 0 }: { data: unknown; level?: number }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  
  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }
  
  if (data === null || data === undefined) {
    return <span class={classes.valueNull}>null</span>
  }
  
  if (typeof data === 'boolean') {
    return <span class={classes.valueBoolean}>{data ? 'true' : 'false'}</span>
  }
  
  if (typeof data === 'number') {
    return <span class={classes.valueNumber}>{data}</span>
  }
  
  if (typeof data === 'string') {
    // Detect and format timestamps
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data)) {
      return <span class={classes.valueTimestamp}>{data}</span>
    }
    return <span class={classes.valueString}>{data}</span>
  }
  
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span class={classes.valueEmpty}>[]</span>
    }
    
    return (
      <div class={classes.arrayContainer}>
        {data.map((item, index) => (
          <div key={index} class={classes.arrayItem}>
            <span class={classes.arrayIndex}>[{index}]</span>
            <HierarchicalView data={item} level={level + 1} />
          </div>
        ))}
      </div>
    )
  }
  
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const keys = Object.keys(obj)
    
    if (keys.length === 0) {
      return <span class={classes.valueEmpty}>{'{}'}</span>
    }
    
    // At top level, show expanded. At nested levels, allow collapse for large objects
    const isLargeObject = keys.length > 10 || level > 2
    
    return (
      <div class={classes.objectContainer}>
        {keys.map(key => {
          const value = obj[key]
          const isComplex = typeof value === 'object' && value !== null
          const isCollapsed = collapsed[key]
          const showCollapseToggle = isComplex && isLargeObject
          
          return (
            <div key={key} class={classes.objectEntry}>
              <div class={classes.keyRow}>
                {showCollapseToggle && (
                  <button 
                    class={classes.collapseToggle} 
                    onClick={() => toggleCollapse(key)}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                )}
                <span class={classes.objectKey}>{key}:</span>
                {!isComplex && (
                  <span class={classes.inlineValue}>
                    <HierarchicalView data={value} level={level + 1} />
                  </span>
                )}
              </div>
              {isComplex && !isCollapsed && (
                <div class={classes.nestedValue}>
                  <HierarchicalView data={value} level={level + 1} />
                </div>
              )}
              {isComplex && isCollapsed && (
                <span class={classes.collapsedIndicator}>
                  {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} keys}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  
  return <span>{String(data)}</span>
}

/**
 * Shortcuts bar for resource detail view
 */
function DetailShortcutsBar({ viewMode, onViewModeChange }: { 
  viewMode: ViewMode; 
  onViewModeChange: (mode: ViewMode) => void 
}) {
  return (
    <div class={classes.shortcutsBar}>
      <Button
        label="Edit"
        shortcut="E"
        onClick={() => {}}
        tabIndex={0}
        disabled
      />
      <span class={classes.label}>View: </span>
      <Button
        label="Tree"
        shortcut="T"
        onClick={() => onViewModeChange('hierarchical')}
        tabIndex={0}
        className={viewMode === 'hierarchical' ? classes.activeViewButton : undefined}
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
  const [viewMode, setViewMode] = useState<ViewMode>('hierarchical')
  
  // Use the resource detail loader hook - handles caching and background refresh
  const {
    detail,
    cacheTimestamp,
    isRefreshing,
    error,
    refresh,
  } = useResourceDetailLoader({ context, namespace, resourceType, resourceName })

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
        setViewMode('hierarchical')
        return
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onBack, refresh])

  const renderContent = useCallback(() => {
    if (!detail) {
      if (isRefreshing) {
        return <div class={classes.loading}>Loading...</div>
      }
      return <div class={classes.empty}>No data available</div>
    }
    
    switch (viewMode) {
      case 'yaml':
        return (
          <pre class={classes.codeView}>
            {toYaml(detail)}
          </pre>
        )
      case 'json':
        return (
          <pre class={classes.codeView}>
            {JSON.stringify(detail, null, 2)}
          </pre>
        )
      case 'hierarchical':
      default:
        return <HierarchicalView data={detail} />
    }
  }, [detail, viewMode, isRefreshing])

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

      {isRefreshing && (
        <div class={classes.refreshIndicator}>
          {cacheTimestamp ? (
            <span>Data from {getCacheAge(cacheTimestamp)}, refreshing...</span>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      )}

      <DetailShortcutsBar viewMode={viewMode} onViewModeChange={setViewMode} />
    </div>
  )
}
