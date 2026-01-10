import { useState } from 'preact/hooks'
import classes from './TreeView.module.scss'

interface TreeViewProps {
  data: unknown
  level?: number
}

/**
 * Render a hierarchical tree view of JSON data
 */
export function TreeView({ data, level = 0 }: TreeViewProps) {
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
            <TreeView data={item} level={level + 1} />
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
      <div class={classes.TreeView}>
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
                    <TreeView data={value} level={level + 1} />
                  </span>
                )}
              </div>
              {isComplex && !isCollapsed && (
                <div class={classes.nestedValue}>
                  <TreeView data={value} level={level + 1} />
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
