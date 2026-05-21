/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { useState, useMemo, useContext } from 'preact/hooks'
import { createContext, type ComponentChildren } from 'preact'
import classes from './TreeView.module.scss'
import { findLinearizer, defaultLinearizers, LinearizerConfig, LinearizedResult, LinearizedPart } from './linearizers.ts'
import type { ResourceFilter } from '../../kubectl/filterTypes.ts'

const MAX_VALUE_LENGTH = 100

/** Callback for jumping to a related resource */
export type OnJumpFn = (targetResourceType: string, filters: ResourceFilter[]) => void

// Highlight context to pass highlight state down the tree
interface HighlightContextValue {
  highlightText: string
  lowerHighlightText: string
}

const HighlightContext = createContext<HighlightContextValue | null>(null)

interface TreeViewProps {
  data: unknown
  level?: number
  path?: string[]
  linearizers?: LinearizerConfig[]
  onJump?: OnJumpFn
  highlightText?: string
}

/**
 * Get text representation of linearized parts for matching
 */
function getLinearizedText(parts: LinearizedResult): string {
  return parts.map(part => {
    switch (part.type) {
      case 'key': return part.value
      case 'string': return part.value
      case 'number': return String(part.value)
      case 'boolean': return part.value ? 'true' : 'false'
      case 'text': return part.value
      case 'separator': return '|'
      case 'secretRef': return part.secretName
      case 'table': 
        return part.headers.join(' ') + ' ' + 
          part.rows.map(row => row.map(cell => getLinearizedText([cell])).join(' ')).join(' ')
      default: return ''
    }
  }).join(' ')
}

// Keys to exclude from highlight matching (these contain redundant/noisy data)
const HIGHLIGHT_EXCLUDE_KEYS = [
  'kubectl.kubernetes.io/last-applied-configuration',
]

/**
 * Check if text matches highlight (case-insensitive)
 * Excludes certain keys that contain noisy data (like last-applied-configuration)
 */
function matchesHighlight(text: string, lowerHighlightText: string): boolean {
  if (!lowerHighlightText) return false
  
  // Check if this is an excluded key
  const lowerText = text.toLowerCase()
  for (const excludeKey of HIGHLIGHT_EXCLUDE_KEYS) {
    if (lowerText.startsWith(excludeKey + ':')) {
      return false
    }
  }
  
  return lowerText.includes(lowerHighlightText)
}

/**
 * Wrapper component that applies highlight/muted styles
 * @param isLeaf - If true, this is a leaf row (no nested children) - full opacity muting applies
 *                 If false, this is a container row - only the key is muted, not nested content
 */
function HighlightableRow({ 
  children, 
  textContent,
  className,
  isLeaf = true
}: { 
  children: ComponentChildren
  textContent: string
  className?: string
  isLeaf?: boolean
}) {
  const highlightCtx = useContext(HighlightContext)
  
  if (!highlightCtx?.lowerHighlightText) {
    return <div class={className}>{children}</div>
  }
  
  const isMatch = matchesHighlight(textContent, highlightCtx.lowerHighlightText)
  
  // Apply different classes based on match status and whether this is a leaf
  // - highlighted: matching rows get background highlight
  // - muted: non-matching leaf rows get full opacity reduction
  // - mutedKey: non-matching container rows get key-only opacity reduction (via CSS)
  let highlightClass = ''
  if (isMatch) {
    highlightClass = classes.highlighted
  } else if (isLeaf) {
    highlightClass = classes.muted
  } else {
    highlightClass = classes.mutedKey
  }
  
  return (
    <div 
      class={`${className || ''} ${highlightClass}`.trim()}
      data-highlight-match={isMatch ? 'true' : undefined}
    >
      {children}
    </div>
  )
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
    case 'range':
      return <span class={classes.linearizedParts}>
        <span class={classes.valueText}>Range</span>
        <span class={classes.valueNumber}>{part.from}</span>
        <span class={classes.valueText}>…</span>
        <span class={classes.valueNumber}>{part.to}</span>
      </span>
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

  // Parent (objectEntry or arrayItem) handles highlighting, so we don't wrap in HighlightableRow here
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
          {/* Disable highlighting in expanded tree to avoid double highlighting */}
          <HighlightContext.Provider value={null}>
            <TreeViewInternal
              data={data}
              level={level + 1}
              path={path}
              linearizers={linearizers}
              onJump={onJump}
              skipLinearization
            />
          </HighlightContext.Provider>
        </div>
      )}
    </div>
  )
}

interface TreeViewInternalProps extends TreeViewProps {
  skipLinearization?: boolean
}

/**
 * Get text representation of a primitive value
 */
function getPrimitiveText(data: unknown): string {
  if (data === null || data === undefined) return 'null'
  if (typeof data === 'boolean') return data ? 'true' : 'false'
  if (typeof data === 'number') return String(data)
  if (typeof data === 'string') {
    // Normalize boolean-like strings for consistent matching
    const lower = data.toLowerCase()
    if (lower === 'true' || lower === 'false') return lower
    return data
  }
  return String(data)
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
    // Detect boolean-like strings (True/False from YAML)
    const lowerData = data.toLowerCase()
    if (lowerData === 'true' || lowerData === 'false') {
      return <span class={classes.valueBoolean}>{lowerData}</span>
    }
    // Detect numeric strings
    const numValue = parseFloat(data)
    if (!isNaN(numValue) && String(numValue) === data.trim()) {
      return <TruncatableValue value={data} className={classes.valueNumber} />
    }
    return <TruncatableValue value={data} className={classes.valueString} />
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span class={classes.valueEmpty}>[]</span>
    }

    return (
      <div class={classes.arrayContainer}>
        {data.map((item, index) => {
          const childPath = [...path, String(index)]
          const childLinearizer = findLinearizer(childPath, linearizers)
          const isComplex = typeof item === 'object' && item !== null
          const childIsLinearizable = childLinearizer && isComplex
          
          // For linearizable items, wrap in HighlightableRow so highlighting is handled at this level
          if (childIsLinearizable) {
            const linearizedText = getLinearizedText(childLinearizer(item, String(index)) || [])
            return (
              <HighlightableRow key={index} textContent={`[${index + 1}] ${linearizedText}`} className={classes.arrayItem} isLeaf={true}>
                <span class={classes.arrayIndex}>[{index + 1}]</span>
                <TreeViewInternal
                  data={item}
                  level={level + 1}
                  path={childPath}
                  linearizers={linearizers}
                  onJump={onJump}
                />
              </HighlightableRow>
            )
          }
          
          // Get text content for matching
          const textContent = `[${index + 1}] ${getPrimitiveText(item)}`
          // isLeaf is false if item is complex (has nested content)
          const itemIsComplex = typeof item === 'object' && item !== null
          
          return (
            <HighlightableRow key={index} textContent={textContent} className={classes.arrayItem} isLeaf={!itemIsComplex}>
              <span class={classes.arrayIndex}>[{index + 1}]</span>
              <TreeViewInternal
                data={item}
                level={level + 1}
                path={childPath}
                linearizers={linearizers}
                onJump={onJump}
              />
            </HighlightableRow>
          )
        })}
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

          // Get text content for highlighting
          const textContent = childIsLinearizable 
            ? key // LinearizedValue handles its own text content
            : `${key}: ${getPrimitiveText(value)}`

          // For linearizable children, wrap in HighlightableRow so the key gets muted/highlighted
          // The LinearizedValue inside will NOT apply its own muted styling to avoid double muting
          if (childIsLinearizable) {
            return (
              <HighlightableRow key={key} textContent={`${key}: ${getLinearizedText(childLinearizer(value, key) || [])}`} className={classes.objectEntry} isLeaf={true}>
                <div class={classes.keyRow}>
                  <span class={classes.objectKey}>{key}:</span>
                  <span class={classes.inlineValue}>
                    <TreeViewInternal
                      data={value}
                      level={level + 1}
                      path={childPath}
                      linearizers={linearizers}
                      onJump={onJump}
                    />
                  </span>
                </div>
              </HighlightableRow>
            )
          }

          return (
            <HighlightableRow key={key} textContent={textContent} className={classes.objectEntry} isLeaf={!isComplex}>
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
                    <TreeViewInternal
                      data={value}
                      level={level + 1}
                      path={childPath}
                      linearizers={linearizers}
                      onJump={onJump}
                    />
                  </span>
                )}
                {isComplex && isCollapsed && (
                  <span class={classes.collapsedIndicator}>
                    {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).length} keys}`}
                  </span>
                )}
              </div>
              {isComplex && !isCollapsed && (
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
            </HighlightableRow>
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
export function TreeView({ data, level = 0, path = [], linearizers, onJump, highlightText }: TreeViewProps) {
  // Memoize context value to avoid unnecessary re-renders
  const contextValue = useMemo(() => {
    if (!highlightText?.trim()) return null
    return {
      highlightText: highlightText.trim(),
      lowerHighlightText: highlightText.trim().toLowerCase()
    }
  }, [highlightText])

  return (
    <HighlightContext.Provider value={contextValue}>
      <TreeViewInternal
        data={data}
        level={level}
        path={path}
        linearizers={linearizers}
        onJump={onJump}
      />
    </HighlightContext.Provider>
  )
}
