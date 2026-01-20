import { useState, useMemo } from 'preact/hooks'
import classes from './TreeView.module.scss'
import { findLinearizer, defaultLinearizers, LinearizerConfig, LinearizedResult, LinearizedPart } from './linearizers.ts'
import type { ResourceFilter } from '../../kubectl/filterTypes.ts'

const MAX_VALUE_LENGTH = 100

/** Callback for jumping to a related resource */
export type OnJumpFn = (targetResourceType: string, filters: ResourceFilter[]) => void

interface TreeViewProps {
  data: unknown
  level?: number
  path?: string[]
  linearizers?: LinearizerConfig[]
  onJump?: OnJumpFn
}

/**
 * Truncatable value component - shows truncated text with expand on click
 */
function TruncatableValue({
  value,
  className
}: {
  value: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = value.length > MAX_VALUE_LENGTH

  const displayValue = needsTruncation && !expanded
    ? value.slice(0, MAX_VALUE_LENGTH)
    : value

  if (!needsTruncation) {
    return <span class={className}>{value}</span>
  }

  return (
    <span
      class={`${className} ${classes.truncatable} ${expanded ? classes.expanded : ''}`}
      onClick={() => setExpanded(!expanded)}
      title={expanded ? 'Click to collapse' : 'Click to expand'}
    >
      {displayValue} <span class={classes.expandDots}>...</span>
    </span>
  )
}

/**
 * Render a single linearized part with proper type formatting
 */
function LinearizedPartView({ part, onJump }: { part: LinearizedPart; onJump?: OnJumpFn }) {
  switch (part.type) {
    case 'key':
      return <span class={classes.objectKey}>{part.value}</span>
    case 'string':
      return <span class={classes.valueString}>{part.value}</span>
    case 'number':
      return <span class={classes.valueNumber}>{part.value}</span>
    case 'boolean':
      return <span class={classes.valueBoolean}>{part.value ? 'true' : 'false'}</span>
    case 'text':
      return <span class={classes.valueText}>{part.value}</span>
    case 'separator':
      return <span class={classes.valueSeparator}>|</span>
    case 'secretRef':
      return <span class={classes.valueString}>{part.secretName}</span>
    case 'table':
      return (
        <table class={classes.linearizedTable}>
          <thead>
            <tr>
              {part.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {part.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>
                    <LinearizedPartView part={cell} onJump={onJump} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    default:
      return null
  }
}

/**
 * Linearized value component - shows compact representation with expand on click
 */
function LinearizedValue({
  linearized,
  data,
  level,
  path,
  linearizers,
  onJump
}: {
  linearized: LinearizedResult
  data: unknown
  level: number
  path: string[]
  linearizers?: LinearizerConfig[]
  onJump?: OnJumpFn
}) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    setExpanded(prev => !prev)
  }

  // Find any secretRef in the linearized parts for the Jump button
  const secretRefPart = linearized.find(part => part.type === 'secretRef')
  const secretName = secretRefPart?.type === 'secretRef' ? secretRefPart.secretName : null

  return (
    <div class={classes.linearizedContainer}>
      <div class={classes.linearizedRow}>
        <span
          class={`${classes.linearizedValue} ${expanded ? classes.expanded : ''}`}
          onClick={handleClick}
          title={expanded ? 'Click to collapse' : 'Click to expand full view'}
        >
          <span class={classes.linearizedParts}>
            {linearized.map((part, i) => (
              <LinearizedPartView key={i} part={part} onJump={onJump} />
            ))}
          </span>
          <span class={classes.expandIcon}>{expanded ? '▼' : '▶'}</span>
        </span>
        {onJump && secretName && (
          <button
            class={classes.jumpButton}
            onClick={(e) => {
              e.stopPropagation()
              onJump('secrets', [{ type: 'text', value: secretName }])
            }}
          >
            Jump
          </button>
        )}
      </div>
      {expanded && (
        <div class={classes.expandedTree}>
          <TreeViewInternal
            data={data}
            level={level + 1}
            path={path}
            linearizers={linearizers}
            onJump={onJump}
            skipLinearization
          />
        </div>
      )}
    </div>
  )
}

interface TreeViewInternalProps extends TreeViewProps {
  skipLinearization?: boolean
}

/**
 * Internal TreeView component that handles all rendering logic
 */
function TreeViewInternal({
  data,
  level = 0,
  path = [],
  linearizers = defaultLinearizers,
  onJump,
  skipLinearization = false
}: TreeViewInternalProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Check for linearization at this path
  const linearizer = useMemo(() => {
    if (skipLinearization) return null
    return findLinearizer(path, linearizers)
  }, [path, linearizers, skipLinearization])

  // If we have a linearizer, try to linearize
  if (linearizer && typeof data === 'object' && data !== null) {
    const key = path[path.length - 1] || ''
    const linearized = linearizer(data, key)
    if (linearized) {
      return (
        <LinearizedValue
          linearized={linearized}
          data={data}
          level={level}
          path={path}
          linearizers={linearizers}
          onJump={onJump}
        />
      )
    }
  }

  if (data === null || data === undefined) {
    return <span class={classes.valueNull}>null</span>
  }

  if (typeof data === 'boolean') {
    return <span class={classes.valueBoolean}>{data ? 'true' : 'false'}</span>
  }

  if (typeof data === 'number') {
    return <TruncatableValue value={String(data)} className={classes.valueNumber} />
  }

  if (typeof data === 'string') {
    // Detect and format timestamps
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data)) {
      return <TruncatableValue value={data} className={classes.valueTimestamp} />
    }
    return <TruncatableValue value={data} className={classes.valueString} />
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span class={classes.valueEmpty}>[]</span>
    }

    return (
      <div class={classes.arrayContainer}>
        {data.map((item, index) => (
          <div key={index} class={classes.arrayItem}>
            <span class={classes.arrayIndex}>[{index + 1}]</span>
            <TreeViewInternal
              data={item}
              level={level + 1}
              path={[...path, String(index)]}
              linearizers={linearizers}
              onJump={onJump}
            />
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
          const childPath = [...path, key]

          // Check if child has a linearizer
          const childLinearizer = findLinearizer(childPath, linearizers)
          const childIsLinearizable = childLinearizer && isComplex

          return (
            <div key={key} class={classes.objectEntry}>
              <div class={classes.keyRow}>
                {showCollapseToggle && !childIsLinearizable && (
                  <button
                    class={classes.collapseToggle}
                    onClick={() => toggleCollapse(key)}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                )}
                <span class={classes.objectKey}>{key}:</span>
                {(!isComplex || childIsLinearizable) && (
                  <span class={classes.inlineValue}>
                    <TreeViewInternal
                      data={value}
                      level={level + 1}
                      path={childPath}
                      linearizers={linearizers}
                      onJump={onJump}
                    />
                  </span>
                )}
                {isComplex && !childIsLinearizable && isCollapsed && (
                  <span class={classes.collapsedIndicator}>
                      {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} keys}`}
                    </span>
                )}
              </div>
              {isComplex && !childIsLinearizable && !isCollapsed && (
                <div class={classes.nestedValue}>
                  <TreeViewInternal
                    data={value}
                    level={level + 1}
                    path={childPath}
                    linearizers={linearizers}
                    onJump={onJump}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return <TruncatableValue value={String(data)} className={undefined} />
}

/**
 * Render a hierarchical tree view of JSON data with linearization support
 */
export function TreeView({ data, level = 0, path = [], linearizers, onJump }: TreeViewProps) {
  return (
    <TreeViewInternal
      data={data}
      level={level}
      path={path}
      linearizers={linearizers}
      onJump={onJump}
    />
  )
}
