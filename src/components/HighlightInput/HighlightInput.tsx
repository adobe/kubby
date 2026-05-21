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

import type { Ref } from 'preact'
import classes from './HighlightInput.module.scss'
import {useState} from 'preact/hooks'

interface HighlightInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onNext: () => void;
  onPrevious: () => void;
  currentMatch: number;
  totalMatches: number;
  tabIndex?: number;
  inputRef?: Ref<HTMLInputElement>;
}

export function HighlightInput({
  value,
  onChange,
  onClear,
  onNext,
  onPrevious,
  currentMatch,
  totalMatches,
  tabIndex,
  inputRef,
}: HighlightInputProps) {
  const [placeholder, setPlaceholder] = useState<string>('Type / to highlight...')
  const [isFocused, setIsFocused] = useState(false)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Down goes to next match
      onNext()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Up goes to previous match
      onPrevious()
    }
    if (e.key === 'Escape') {
      e.stopPropagation() // Prevent global handler from calling onBack
      if (value) {
        onClear()
      }
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Enter focuses the view
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    setPlaceholder('Type to highlight')
  }

  const handleBlur = () => {
    setIsFocused(false)
    setPlaceholder('Type / to highlight...')
  }

  // Show controls when focused or when there's a value
  const showControls = isFocused || value
  const hasMatches = totalMatches > 0

  return (
    <span class={classes.HighlightInput}>
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        autocorrect="off"
        autocapitalize="off"
        autocomplete="off"
        spellcheck={false}
        data-form-type="other"
        class={classes.input}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        tabIndex={tabIndex}
      />
      {showControls && (
        <div class={classes.controls}>
          {value && hasMatches && (
            <span class={classes.matchCount}>
              {currentMatch + 1}/{totalMatches}
            </span>
          )}
          {value && !hasMatches && (
            <span class={classes.noMatches}>0</span>
          )}
          {value && hasMatches && (
            <>
              <button
                class={classes.navButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onPrevious()
                }}
                tabIndex={tabIndex !== undefined ? tabIndex + 1 : undefined}
                aria-label="Previous match"
                title="Previous (↑)"
              >
                <span class={classes.navIcon}>↑</span>
              </button>
              <button
                class={classes.navButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onNext()
                }}
                tabIndex={tabIndex !== undefined ? tabIndex + 2 : undefined}
                aria-label="Next match"
                title="Next (↓)"
              >
                <span class={classes.navIcon}>↓</span>
              </button>
            </>
          )}
          <button
            class={classes.clearButton}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            tabIndex={tabIndex !== undefined ? tabIndex + 3 : undefined}
            aria-label="Clear highlight"
          >
            {value && <span class={classes.clearIcon}>×</span>}
            <span class={classes.shortcutKey}>Esc</span>
          </button>
        </div>
      )}
    </span>
  )
}
