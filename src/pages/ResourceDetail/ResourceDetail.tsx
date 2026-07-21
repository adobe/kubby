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
import {HighlightInput} from '../../components/HighlightInput/HighlightInput.tsx'
import {isControlModifierPressed} from '../../navigation/keyboardShortcuts.ts'

type ViewMode = 'tree' | 'yaml' | 'json'

interface ResourceDetailProps {
  context: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  dashboardConfig: DashboardConfig;
  navigationStack: NavigationNode[];
  /** When true, disables the Edit action (read-only mode) */
  readOnly: boolean;
  onNavigateToNode: (index: number) => void;
  onBack: () => void;
  onJump?: (targetResourceType: string, filters: ResourceFilter[]) => void;
}

/**
 * Shortcuts bar for resource detail view
 */
function DetailShortcutsBar({viewMode, onViewModeChange, onEdit, isEditing, onCopy, isSecretResource, isDecoded, onToggleDecode, readOnly}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEdit: () => void;
  isEditing: boolean;
  onCopy: () => void;
  isSecretResource: boolean;
  isDecoded: boolean;
  onToggleDecode: () => void;
  readOnly: boolean;
}) {
  const canCopy = viewMode === 'yaml' || viewMode === 'json'
  return (
    <ShortcutsBar>
      <Button
        label={isEditing ? 'Editing...' : 'Edit'}
        shortcut="E"
        onClick={onEdit}
        tabIndex={0}
        disabled={isEditing || readOnly}
        tooltip={readOnly ? 'Disabled in read-only mode' : undefined}
      />
      <span class={classes.label}>View: </span>
      <Button
        label="Tree"
        shortcut="T"
        onClick={() => onViewModeChange('tree')}
        tabIndex={0}
        className={viewMode === 'tree' ? classes.activeViewButton : undefined}
        role="tab"
        aria-selected={viewMode === 'tree'}
      />
      <Button
        label="Yaml"
        shortcut="Y"
        onClick={() => onViewModeChange('yaml')}
        tabIndex={0}
        className={viewMode === 'yaml' ? classes.activeViewButton : undefined}
        role="tab"
        aria-selected={viewMode === 'yaml'}
      />
      <Button
        label="Json"
        shortcut="J"
        onClick={() => onViewModeChange('json')}
        tabIndex={0}
        className={viewMode === 'json' ? classes.activeViewButton : undefined}
        role="tab"
        aria-selected={viewMode === 'json'}
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
                                 readOnly,
                                 onBack,
                                 onJump,
                               }: ResourceDetailProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDecoded, setIsDecoded] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  
  // Highlight state
  const [highlightText, setHighlightText] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const highlightInputRef = useRef<HTMLInputElement>(null)
  
  // Track highlighted elements for navigation
  const matchedElementsRef = useRef<HTMLElement[]>([])
  
  // Track if we've scrolled for the current search to avoid continuous scrolling
  const hasScrolledForSearchRef = useRef('')

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

  // Focus the body for keyboard scrolling when detail first loads
  // Don't steal focus if user is typing in an input
  useEffect(() => {
    const activeElement = document.activeElement as HTMLElement
    const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
    if (!isInput) {
      bodyRef.current?.focus()
    }
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
    if (isEditing || readOnly) return

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
  }, [resourceType, resourceName, context, namespace, refresh, isEditing, readOnly, refocusBody])

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

// Highlight navigation functions
  const CURRENT_MATCH_ATTR = 'data-current-match'
  function clearCurrentMatchAttr(elements: HTMLElement[]) {
    elements.forEach(el => el.removeAttribute(CURRENT_MATCH_ATTR))
  }
  function setCurrentMatchAttr(element: HTMLElement) {
    element.setAttribute(CURRENT_MATCH_ATTR, 'true')
  }

  const scrollToMatch = useCallback((index: number) => {
    const elements = matchedElementsRef.current
    if (elements.length === 0) return
    
    const safeIndex = ((index % elements.length) + elements.length) % elements.length
    const element = elements[safeIndex]

    if (element) {
      // Remove current match attr from all elements
      clearCurrentMatchAttr(elements)
      // Add current match attr to the new current element
      setCurrentMatchAttr(element)
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setCurrentMatchIndex(safeIndex)
    }
  }, [])
  
  const handleHighlightNext = useCallback(() => {
    if (matchCount > 0) {
      scrollToMatch(currentMatchIndex + 1)
    }
  }, [matchCount, currentMatchIndex, scrollToMatch])
  
  const handleHighlightPrevious = useCallback(() => {
    if (matchCount > 0) {
      scrollToMatch(currentMatchIndex - 1)
    }
  }, [matchCount, currentMatchIndex, scrollToMatch])
  
  const handleHighlightClear = useCallback(() => {
    // Remove current match attr from all elements before clearing
    clearCurrentMatchAttr(matchedElementsRef.current)
    setHighlightText('')
    setCurrentMatchIndex(0)
    setMatchCount(0)
    matchedElementsRef.current = []
    refocusBody()
  }, [refocusBody])
  
  // Update match count and collect matched elements after render
  useEffect(() => {
    const trimmedHighlight = highlightText.trim()
    
    if (!trimmedHighlight) {
      // Remove current match attr from all elements before clearing
      clearCurrentMatchAttr(matchedElementsRef.current)
      matchedElementsRef.current = []
      setMatchCount(0)
      setCurrentMatchIndex(0)
      hasScrolledForSearchRef.current = ''
      return
    }
    
    // Use requestAnimationFrame to wait for DOM to update
    const rafId = requestAnimationFrame(() => {
      const container = bodyRef.current
      if (!container) return
      
      // Remove current match attr from previous elements
      clearCurrentMatchAttr(matchedElementsRef.current)
      
      const elements = container.querySelectorAll('[data-highlight-match="true"]')
      const elementsArray = Array.from(elements) as HTMLElement[]
      matchedElementsRef.current = elementsArray
      setMatchCount(elements.length)
      
      // Auto-scroll to first match only once per unique search term
      const shouldScroll = elements.length > 0 && hasScrolledForSearchRef.current !== trimmedHighlight
      if (shouldScroll) {
        hasScrolledForSearchRef.current = trimmedHighlight
        setCurrentMatchIndex(0)
        const firstMatch = elementsArray[0]
        setCurrentMatchAttr(firstMatch)
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (elementsArray.length > 0) {
        // Re-apply current match attr after DOM re-render (elements may have been recreated)
        const safeIndex = Math.min(currentMatchIndex, elementsArray.length - 1)
        setCurrentMatchAttr(elementsArray[safeIndex])
      }
    })
    
    return () => cancelAnimationFrame(rafId)
  }, [highlightText, viewMode, displayDetail, currentMatchIndex])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      
      // "/" - Focus highlight input (when not in an input)
      if (e.key === '/' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        highlightInputRef.current?.focus()
        return
      }

      // Escape - clear highlight first if active, then go back
      if (e.key === 'Escape') {
        // If in highlight input, let it handle its own Escape
        if (target === highlightInputRef.current) {
          return
        }
        // If highlight is active, clear it first
        if (highlightText) {
          e.preventDefault()
          handleHighlightClear()
          return
        }
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
  }, [onBack, handleRefresh, handleEdit, handleViewModeChange, handleCopy, isSecretResource, handleToggleDecode, highlightText, handleHighlightClear, handleHighlightNext, handleHighlightPrevious])

  const renderContent = useCallback(() => {
    if (!displayDetail) {
      if (isRefreshing) {
        return <div class={classes.loading}>Loading...</div>
      }
      return <div class={classes.empty}>No data available</div>
    }

    switch (viewMode) {
      case 'yaml':
        return <CodeView code={yamlCode} language="yaml" highlightText={highlightText}/>
      case 'json':
        return <CodeView code={jsonCode} language="json" highlightText={highlightText}/>
      case 'tree':
      default:
        return <TreeView data={displayDetail} onJump={onJump} highlightText={highlightText}/>
    }
  }, [displayDetail, viewMode, isRefreshing, yamlCode, jsonCode, highlightText, onJump])

  return (
    <div class={classes.ResourceDetail}>
      <header class={classes.header}>
        <div class={classes.headerInfo}>
          <span class={classes.resourceName}>{resourceName}</span>
          <span class={classes.resourceType}>{resourceType}</span>
        </div>
        <div class={classes.highlightSection}>
          <HighlightInput
            value={highlightText}
            onChange={setHighlightText}
            onClear={handleHighlightClear}
            onNext={handleHighlightNext}
            onPrevious={handleHighlightPrevious}
            currentMatch={currentMatchIndex}
            totalMatches={matchCount}
            inputRef={highlightInputRef}
            tabIndex={0}
          />
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
                          isDecoded={isDecoded} onToggleDecode={handleToggleDecode} readOnly={readOnly}/>
    </div>
  )
}
