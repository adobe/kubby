import type { Ref } from 'preact'
import type { NavigationNode } from '../../navigation/navigationTypes.ts'
import type { ResourceFilter } from '../../kubectl/filterTypes.ts'
import { getLabelFilters, getResourceNameFilter, getSpecFilters } from '../../kubectl/filterTypes.ts'
import { FilterChip } from '../FilterChip/FilterChip.tsx'
import { FilterInput } from '../FilterInput/FilterInput.tsx'
import classes from './Breadcrumb.module.scss'

interface BreadcrumbProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  /** All active filters for the current view */
  filters?: ResourceFilter[];
  /** Called when user wants to clear all filters (clicking the filtered node or × on any chip) */
  onClearFilters?: () => void;
  /** Current text filter value */
  filterText?: string;
  /** Called when text filter changes */
  onFilterTextChange?: (value: string) => void;
  /** Called when text filter should be cleared */
  onFilterClear?: () => void;
  /** Ref for the filter input */
  filterInputRef?: Ref<HTMLInputElement>;
  /** Tab index for the filter input */
  filterInputTabIndex?: number;
  /** Called when Enter is pressed in the filter input */
  onFilterSubmit?: () => void;
}

export function Breadcrumb({ 
  navigationStack, 
  onNavigateToNode,
  filters = [],
  onClearFilters,
  filterText = '',
  onFilterTextChange,
  onFilterClear,
  filterInputRef,
  filterInputTabIndex,
  onFilterSubmit,
}: BreadcrumbProps) {
  const labelFilters = getLabelFilters(filters)
  const specFilters = getSpecFilters(filters)
  const hasLabelFilters = labelFilters.length > 0
  const hasSpecFilters = specFilters.length > 0
  const hasAnyFilters = hasLabelFilters || hasSpecFilters
  
  const lastNode = navigationStack[navigationStack.length - 1]
  const isContainersView = lastNode?.resourceType === 'containers'
  
  // Get pod name filter (for containers view)
  const podFilter = getResourceNameFilter(filters, 'pod')
  
  return (
    <nav class={classes.Breadcrumb} aria-label="Navigation breadcrumb">
      <button
        class={classes.item}
        onClick={() => onNavigateToNode(-1)}
        type="button"
      >
        Dashboard
      </button>
      
      {navigationStack.map((node, index) => {
        const isLast = index === navigationStack.length - 1
        const isSecondToLast = index === navigationStack.length - 2
        const label = node.resourceType
        
        // Check if this node should show inline filters (label or spec filters)
        const showFiltersHere = isLast && hasAnyFilters
        
        // Node is clickable if:
        // - It's not the last node (normal breadcrumb navigation)
        // - It's the last node with filters (navigate to unfiltered view)
        const isClickable = !isLast || showFiltersHere
        
        const handleClick = () => {
          if (showFiltersHere && onClearFilters) {
            onClearFilters()
          } else {
            onNavigateToNode(index)
          }
        }
        
        // Check if we should render the "Pod" segment after this node
        // This happens when: this is the second-to-last node (Pods), we're in containers view, and there's a pod filter
        const shouldRenderPodSegmentAfter = isSecondToLast && isContainersView && podFilter
        
        return (
          <span key={`${node.context}-${node.namespace}-${node.resourceType}-${index}`} class={classes.segment}>
            <span class={classes.separator}>›</span>
            {isClickable ? (
              <button
                class={classes.item}
                onClick={handleClick}
                type="button"
              >
                {label}
              </button>
            ) : (
              <span class={classes.current}>{label}</span>
            )}
            
            {/* Inline filter chips (label filters and spec filters) */}
            {showFiltersHere && (
              <span class={classes.inlineFilters}>
                {/* Label filter chips */}
                {labelFilters.map((filter, filterIndex) => (
                  <FilterChip 
                    key={`label-${filter.key}-${filter.value}-${filterIndex}`}
                    filter={filter} 
                    onRemove={onClearFilters}
                  />
                ))}
                {/* Spec filter chips - only show first one with displayLabel to avoid clutter */}
                {specFilters.filter(f => f.displayLabel).slice(0, 1).map((filter, filterIndex) => (
                  <FilterChip 
                    key={`spec-${filter.path}-${filter.value}-${filterIndex}`}
                    filter={filter} 
                    onRemove={onClearFilters}
                  />
                ))}
              </span>
            )}
            
            {/* Render "Pod" segment with filter chip (for containers view) */}
            {shouldRenderPodSegmentAfter && (
              <span class={classes.segment}>
                <span class={classes.separator}>›</span>
                <span class={classes.current}>Pod</span>
                <span class={classes.inlineFilters}>
                  <FilterChip 
                    filter={podFilter} 
                    onRemove={onClearFilters}
                  />
                </span>
              </span>
            )}
          </span>
        )
      })}
      
      {/* Permanent filter input segment */}
      {onFilterTextChange && onFilterClear && (
        <span class={classes.segment}>
          <span class={classes.separator}> </span>
          <FilterInput
            value={filterText}
            onChange={onFilterTextChange}
            onClear={onFilterClear}
            onSubmit={onFilterSubmit}
            inputRef={filterInputRef}
            tabIndex={filterInputTabIndex}
          />
        </span>
      )}
    </nav>
  )
}
