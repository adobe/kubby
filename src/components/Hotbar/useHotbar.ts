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

// Owns all hotbar state: persistence, the add/remove/rename/jump actions, and
// the global keyboard shortcuts (Opt+H, Opt+1..9). Keeps App.tsx focused on
// navigation wiring.

import { useState, useEffect, useCallback } from 'preact/hooks'
import type { StateUpdater, Dispatch } from 'preact/hooks'
import type { NavigationNode } from '../../navigation/navigationTypes.ts'
import { createNavigationNode } from '../../navigation/navigationTypes.ts'
import type { HotbarEntry } from '../../navigation/hotbarTypes.ts'
import {
  HOTBAR_ENTRIES_STORAGE_KEY,
  HOTBAR_OPEN_STORAGE_KEY,
  createHotbarEntryId,
  isSameScreen,
  loadHotbarEntries,
  loadHotbarOpen,
} from '../../navigation/hotbarTypes.ts'

interface UseHotbarParams {
  navigationStack: NavigationNode[]
  setNavigationStack: Dispatch<StateUpdater<NavigationNode[]>>
  setLastResourceType: Dispatch<StateUpdater<string>>
  setLastNamespaceByContext: Dispatch<StateUpdater<Record<string, string>>>
}

export interface HotbarController {
  entries: HotbarEntry[]
  open: boolean
  toggle: () => void
  /** Save the current screen (resource type + context + namespace) as a slot */
  addCurrent: () => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  jump: (entry: HotbarEntry) => void
}

/**
 * Hotbar state + behavior, persisted to localStorage. The keyboard shortcuts
 * are only active while a resource screen is showing (navigation stack non-empty).
 */
export function useHotbar({
  navigationStack,
  setNavigationStack,
  setLastResourceType,
  setLastNamespaceByContext,
}: UseHotbarParams): HotbarController {
  const [entries, setEntries] = useState<HotbarEntry[]>(() => loadHotbarEntries())
  const [open, setOpen] = useState<boolean>(() => loadHotbarOpen())

  // Persist entries and open/collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(HOTBAR_ENTRIES_STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // Ignore localStorage errors
    }
  }, [entries])

  useEffect(() => {
    try {
      localStorage.setItem(HOTBAR_OPEN_STORAGE_KEY, String(open))
    } catch {
      // Ignore localStorage errors
    }
  }, [open])

  const toggle = useCallback(() => setOpen(prev => !prev), [])

  const addCurrent = useCallback(() => {
    if (navigationStack.length === 0) return
    const current = navigationStack[navigationStack.length - 1]
    // The containers view needs a parent pod, so it can't be a standalone shortcut
    if (current.resourceType === 'containers') return
    const screen = {
      resourceType: current.resourceType,
      context: current.context,
      namespace: current.namespace,
    }
    setEntries(prev =>
      prev.some(e => isSameScreen(e, screen))
        ? prev
        : [...prev, { id: createHotbarEntryId(), ...screen }],
    )
  }, [navigationStack])

  const remove = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, name: name || undefined } : e)))
  }, [])

  // Jump to a saved screen by replacing the current breadcrumb tip, so the
  // navigation depth never grows. Back/Esc then goes up one level from here.
  const jump = useCallback((entry: HotbarEntry) => {
    setNavigationStack(prev => {
      const top = prev.length > 0 ? prev[prev.length - 1] : undefined
      const node = createNavigationNode(
        entry.context,
        entry.namespace,
        entry.resourceType,
        top?.displayName ?? 'Dashboard',
      )
      return prev.length === 0 ? [node] : [...prev.slice(0, -1), node]
    })
    setLastResourceType(entry.resourceType)
    setLastNamespaceByContext(prev => ({ ...prev, [entry.context]: entry.namespace }))
  }, [setNavigationStack, setLastResourceType, setLastNamespaceByContext])

  // Global shortcuts (only while a resource screen is showing): Opt+H toggles,
  // Opt+1..9 jump to the first nine slots. Uses e.code to avoid macOS Opt+key glyphs.
  useEffect(() => {
    if (navigationStack.length === 0) return

    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey) return

      // Ignore while typing in an input (e.g. a combobox or the rename field)
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (e.code === 'KeyH') {
        e.preventDefault()
        toggle()
        return
      }

      const digitMatch = /^Digit([1-9])$/.exec(e.code)
      if (digitMatch) {
        const entry = entries[parseInt(digitMatch[1], 10) - 1]
        if (entry) {
          e.preventDefault()
          jump(entry)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigationStack.length, entries, toggle, jump])

  return { entries, open, toggle, addCurrent, remove, rename, jump }
}
