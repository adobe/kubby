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

// Platform-aware keyboard shortcut utilities

/**
 * Detects if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().includes('MAC') || 
         navigator.userAgent.toUpperCase().includes('MAC')
}

/**
 * Mac-specific key symbols
 */
const MAC_SYMBOLS: Record<string, string> = {
  'Ctrl': '⌃',
  'Control': '⌃',
  'Cmd': '⌘',
  'Command': '⌘',
  'Meta': '⌘',
  'Shift': '⇧',
  'Alt': '⌥',
  'Option': '⌥',
  'Opt': '⌥',
  'Enter': '↵',
  'Return': '↵',
  'Esc': 'Esc',
  'Escape': 'Esc',
  'Up': '↑',
  'Down': '↓',
  'Left': '←',
  'Right': '→',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'Tab': '⇥',
  'Backspace': '⌫',
  'Delete': '⌦',
  'Del': '⌦',
  'Space': '␣',
}

/**
 * Windows/Linux key display names
 */
const PC_SYMBOLS: Record<string, string> = {
  'Cmd': 'Ctrl',
  'Command': 'Ctrl',
  'Meta': 'Ctrl',
  'Option': 'Alt',
  'Opt': 'Alt',
  'Enter': 'Enter',
  'Return': 'Enter',
  'Esc': 'Esc',
  'Escape': 'Esc',
  'Up': '↑',
  'Down': '↓',
  'Left': '←',
  'Right': '→',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
}

/**
 * Formats a keyboard shortcut for display based on the current platform.
 * 
 * @param shortcut - The shortcut string (e.g., "Ctrl+R", "Cmd+K", "Shift+F")
 * @returns The formatted shortcut with platform-appropriate symbols
 * 
 * @example
 * // On Mac:
 * formatShortcut("Ctrl+R") // "⌃R"
 * formatShortcut("Cmd+K")  // "⌘K"
 * formatShortcut("Shift+F") // "⇧F"
 * 
 * // On Windows/Linux:
 * formatShortcut("Ctrl+R") // "Ctrl+R"
 * formatShortcut("Cmd+K")  // "Ctrl+K"
 */
export function formatShortcut(shortcut: string): string {
  const mac = isMac()
  const symbols = mac ? MAC_SYMBOLS : PC_SYMBOLS
  
  // Split by + but preserve the + in cases like "Up / Down"
  const parts = shortcut.split('+').map(part => part.trim())
  
  const formatted = parts.map(part => {
    // Handle compound keys like "Up / Down"
    if (part.includes(' / ')) {
      const subParts = part.split(' / ').map(sp => sp.trim())
      return subParts.map(sp => symbols[sp] || sp).join(' / ')
    }
    return symbols[part] || part
  })
  
  // On Mac, join without separator for modifier+key combos
  // On PC, keep the + separator
  if (mac) {
    return formatted.join('')
  }
  return formatted.join('+')
}

/**
 * Returns the appropriate modifier key name for the current platform.
 * Use this when you need to display "Cmd" on Mac and "Ctrl" on Windows/Linux.
 */
export function getPrimaryModifier(): string {
  return isMac() ? 'Cmd' : 'Ctrl'
}

/**
 * Checks if the primary modifier (Cmd on Mac, Ctrl on PC) is pressed in an event.
 */
export function isPrimaryModifierPressed(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey
}

export function isControlModifierPressed(e: KeyboardEvent): boolean {
  return e.ctrlKey
}

/**
 * Checks if the Alt/Option key is pressed in an event.
 */
export function isAltModifierPressed(e: KeyboardEvent): boolean {
  return e.altKey
}
