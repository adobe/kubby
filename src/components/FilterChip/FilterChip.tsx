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
