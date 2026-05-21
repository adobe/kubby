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

import type { ResourceFilter } from '../../kubectl/filterTypes.ts'
import classes from './FilterChip.module.scss'

interface FilterChipProps {
  filter: ResourceFilter;
  onRemove?: () => void;
}

export function FilterChip({ filter, onRemove }: FilterChipProps) {
  const renderContent = () => {
    switch (filter.type) {
      case 'label':
        return (
          <>
            <span class={classes.key}>{filter.key}</span>
            <span class={classes.operator}>=</span>
            <span class={classes.value}>{filter.value}</span>
          </>
        )
      case 'resourceName':
        return (
          <span class={classes.value}>{filter.name}</span>
        )
      case 'spec':
        // Display spec filters with friendly formatting
        // Use displayLabel if provided, otherwise show "for <value>"
        return (
          <>
            {filter.displayLabel && (
              <span class={classes.key}>{filter.displayLabel}</span>
            )}
            {!filter.displayLabel && (
              <span class={classes.operator}>for</span>
            )}
            <span class={classes.value}>{filter.value}</span>
          </>
        )
      default:
        return null
    }
  }

  const getAriaLabel = () => {
    switch (filter.type) {
      case 'label':
        return `Remove filter ${filter.key}=${filter.value}`
      case 'resourceName':
        return `Remove filter: ${filter.name}`
      case 'spec':
        return `Remove filter: ${filter.displayLabel || 'for'} ${filter.value}`
      default:
        return 'Remove filter'
    }
  }

  return (
    <span class={classes.FilterChip}>
      {renderContent()}
      {onRemove && (
        <button 
          class={classes.removeButton}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={getAriaLabel()}
        >
          ×
        </button>
      )}
    </span>
  )
}
