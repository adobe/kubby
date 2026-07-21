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

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import classes from './Hotbar.module.scss'
import type { HotbarEntry } from '../../navigation/hotbarTypes.ts'
import {
  HOTBAR_WIDTH_STORAGE_KEY,
  clampHotbarWidth,
  loadHotbarWidth,
} from '../../navigation/hotbarTypes.ts'
import { Button } from '../Button/Button.tsx'
import { NamespaceBadge } from '../NamespaceBadge/NamespaceBadge.tsx'
import { formatShortcut } from '../../navigation/keyboardShortcuts.ts'

interface HotbarProps {
  /** Saved screen shortcuts */
  entries: HotbarEntry[]
  /** Whether the panel is expanded */
  open: boolean
  /** Toggle expanded/collapsed */
  onToggle: () => void
  /** Jump to a saved screen */
  onJump: (entry: HotbarEntry) => void
  /** Remove a saved screen */
  onRemove: (id: string) => void
  /** Rename a saved screen (empty string clears the custom name) */
  onRename: (id: string, name: string) => void
  /** Save the current screen as a new slot */
  onAddCurrent: () => void
  /** False when the current screen can't be saved (e.g. containers view) */
  canAddCurrent: boolean
  /** True when the current screen is already saved */
  currentAlreadySaved: boolean
  /** namespace -> configured label, for rendering NamespaceBadge */
  namespaceLabels: Map<string, string>
  /** Contexts known to the config; slots with an unknown context are dimmed */
  knownContexts: string[]
  /** Effective read-only state (drives the toggle) */
  readOnly: boolean
  /** Toggle the session read-only override */
  onToggleReadOnly: () => void
}

/**
 * Toggle-able sidebar that stores shortcuts to specific resource screens
 * (resource type + context + namespace). Rendered on the resource screens
 * (not the Dashboard) by App.tsx.
 */
export function Hotbar({
  entries,
  open,
  onToggle,
  onJump,
  onRemove,
  onRename,
  onAddCurrent,
  canAddCurrent,
  currentAlreadySaved,
  namespaceLabels,
  knownContexts,
  readOnly,
  onToggleReadOnly,
}: HotbarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Divider alignment: match the two header dividers on the resource list screen.
  // Measured relative to the hotbar's own top so any vertical offset cancels out.
  // null → fall back to the CSS heights (e.g. on the detail/logs screens).
  const [rowHeights, setRowHeights] = useState<{ row1: number; row2: number } | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const navBar = document.querySelector('[data-kubby-navbar]') as HTMLElement | null
    if (!root || !navBar) {
      return
    }
    const navRect = navBar.getBoundingClientRect()
    const rootTop = root.getBoundingClientRect().top
    // +1px so the read-only row's bottom border overlaps the nav bar's top
    // border (one continuous line across the screen/sidebar boundary).
    const next = {
      row1: Math.round(navRect.top - rootTop) + 1,
      row2: Math.round(navRect.height),
    }
    setRowHeights(prev =>
      prev && prev.row1 === next.row1 && prev.row2 === next.row2 ? prev : next,
    )
  })

  // Resizable width (persisted). Only applied to the expanded panel.
  const [width, setWidth] = useState<number>(() => loadHotbarWidth())

  // Persist width whenever it settles
  useEffect(() => {
    try {
      localStorage.setItem(HOTBAR_WIDTH_STORAGE_KEY, String(width))
    } catch {
      // Ignore localStorage errors
    }
  }, [width])

  // Drag the left edge to resize. Dragging left widens the panel.
  const startResize = (e: MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'

    const onMove = (ev: MouseEvent) => {
      setWidth(clampHotbarWidth(startWidth + (startX - ev.clientX)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Focus and select the rename field when entering edit mode
  useEffect(() => {
    if (editingId !== null && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [editingId])

  const startRename = (entry: HotbarEntry) => {
    setEditingId(entry.id)
    setDraftName(entry.name ?? '')
  }

  const commitRename = () => {
    if (editingId !== null) {
      onRename(editingId, draftName.trim())
    }
    setEditingId(null)
    setDraftName('')
  }

  const cancelRename = () => {
    setEditingId(null)
    setDraftName('')
  }

  const readOnlyTitle = readOnly
    ? 'Read-only mode is ON — click to allow changes'
    : 'Read-only mode is OFF — click to prevent changes'

  if (!open) {
    return (
      <div ref={rootRef} class={classes.Hotbar} data-collapsed="true">
        <button
          type="button"
          class={`${classes.railLock} ${readOnly ? classes.railLockOn : ''}`}
          onClick={onToggleReadOnly}
          title={readOnlyTitle}
          aria-label="Toggle read-only mode"
          aria-pressed={readOnly}
        >
          RO
        </button>
        <button
          class={classes.rail}
          onClick={onToggle}
          title="Show hotbar (⌥H)"
          aria-label="Show hotbar"
        >
          <span class={classes.railChevron}>‹</span>
          <span class={classes.railText}>Hotbar</span>
          {entries.length > 0 && <span class={classes.railBadge}>{entries.length}</span>}
        </button>
      </div>
    )
  }

  const addTooltip = !canAddCurrent
    ? "This screen can't be saved as a shortcut"
    : currentAlreadySaved
      ? 'This screen is already in the hotbar'
      : 'Save the current resource, context and namespace as a shortcut'

  return (
    <div ref={rootRef} class={classes.Hotbar} style={{ width: `${width}px` }}>
      <div
        class={classes.resizeHandle}
        onMouseDown={startResize}
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
      />
      <div
        class={classes.readOnlyRow}
        style={rowHeights ? { height: `${rowHeights.row1}px` } : undefined}
      >
        <span class={classes.readOnlyLabel}>Read-only</span>
        <button
          type="button"
          role="switch"
          aria-checked={readOnly}
          class={`${classes.switch} ${readOnly ? classes.switchOn : ''}`}
          onClick={onToggleReadOnly}
          title={readOnlyTitle}
        >
          <span class={classes.switchKnob} />
        </button>
      </div>

      <div
        class={classes.header}
        style={rowHeights ? { height: `${rowHeights.row2}px` } : undefined}
      >
        <span class={classes.title}>Hotbar</span>
        <button
          class={classes.collapseButton}
          onClick={onToggle}
          title="Hide hotbar (⌥H)"
          aria-label="Hide hotbar"
        >
          ›
        </button>
      </div>

      <Button
        label={currentAlreadySaved ? 'Screen saved' : 'Add current screen'}
        onClick={onAddCurrent}
        disabled={!canAddCurrent || currentAlreadySaved}
        tooltip={addTooltip}
        className={classes.addButton}
        tabIndex={0}
      />

      <div class={classes.slots}>
        {entries.length === 0 ? (
          <div class={classes.empty}>
            No saved screens yet. Click “Add current screen” to pin this resource,
            context and namespace.
          </div>
        ) : (
          entries.map((entry, index) => {
            const isEditing = editingId === entry.id
            const unknownContext =
              knownContexts.length > 0 && !knownContexts.includes(entry.context)
            const nsLabel = namespaceLabels.get(entry.namespace)
            const keyHint = index < 9 ? formatShortcut(`Opt+${index + 1}`) : null

            return (
              <div
                key={entry.id}
                class={`${classes.slot} ${unknownContext ? classes.unknown : ''}`}
              >
                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    class={classes.renameInput}
                    value={draftName}
                    placeholder={entry.resourceType}
                    onInput={(e) => setDraftName((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        cancelRename()
                      }
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <button
                    class={classes.slotButton}
                    onClick={() => onJump(entry)}
                    title={
                      unknownContext
                        ? `Context "${entry.context}" is no longer in your config`
                        : `Jump to ${entry.resourceType} in ${entry.context} / ${entry.namespace}`
                    }
                  >
                    {keyHint && <span class={classes.slotKey}>{keyHint}</span>}
                    <span class={classes.slotInfo}>
                      <span class={classes.slotLabel}>{entry.name || entry.resourceType}</span>
                      <span class={classes.slotMeta}>
                        <span class={classes.slotContext}>{entry.context}</span>
                        <span class={classes.slotSep}>/</span>
                        {nsLabel && <NamespaceBadge label={nsLabel} />}
                        <span class={classes.slotNamespace}>{entry.namespace}</span>
                      </span>
                    </span>
                  </button>
                )}

                {!isEditing && (
                  <div class={classes.slotActions}>
                    <button
                      class={classes.slotAction}
                      onClick={() => startRename(entry)}
                      title="Rename"
                      aria-label={`Rename ${entry.name || entry.resourceType}`}
                    >
                      ✎
                    </button>
                    <button
                      class={`${classes.slotAction} ${classes.removeAction}`}
                      onClick={() => onRemove(entry.id)}
                      title="Remove"
                      aria-label={`Remove ${entry.name || entry.resourceType}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
