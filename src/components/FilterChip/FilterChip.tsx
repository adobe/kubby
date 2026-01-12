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
