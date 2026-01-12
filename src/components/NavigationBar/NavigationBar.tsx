import type { Ref } from 'preact'
import { Breadcrumb } from '../Breadcrumb/Breadcrumb.tsx'
import type { ResourceFilter } from '../../kubectl/filterTypes.ts'
import type { NavigationNode } from '../../navigation/navigationTypes.ts'
import classes from './NavigationBar.module.scss'

interface NavigationBarProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  /** All active filters for the current view */
  filters?: ResourceFilter[];
  /** Called when user wants to clear all filters */
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

export function NavigationBar({ 
  navigationStack, 
  onNavigateToNode, 
  filters,
  onClearFilters,
  filterText,
  onFilterTextChange,
  onFilterClear,
  filterInputRef,
  filterInputTabIndex,
  onFilterSubmit,
}: NavigationBarProps) {
  return (
    <div class={classes.NavigationBar}>
      <Breadcrumb 
        navigationStack={navigationStack}
        onNavigateToNode={onNavigateToNode}
        filters={filters}
        onClearFilters={onClearFilters}
        filterText={filterText}
        onFilterTextChange={onFilterTextChange}
        onFilterClear={onFilterClear}
        filterInputRef={filterInputRef}
        filterInputTabIndex={filterInputTabIndex}
        onFilterSubmit={onFilterSubmit}
      />
    </div>
  )
}
