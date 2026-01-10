import { Breadcrumb } from './Breadcrumb.tsx'
import type { ResourceFilter } from '../kubectl/filterTypes'
import type { NavigationNode } from '../navigation/navigationTypes'
import classes from './NavigationBar.module.scss'

interface NavigationBarProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  /** All active filters for the current view */
  filters?: ResourceFilter[];
  /** Called when user wants to clear all filters */
  onClearFilters?: () => void;
}

export function NavigationBar({ 
  navigationStack, 
  onNavigateToNode, 
  filters,
  onClearFilters,
}: NavigationBarProps) {
  return (
    <div class={classes.NavigationBar}>
      <Breadcrumb 
        navigationStack={navigationStack}
        onNavigateToNode={onNavigateToNode}
        filters={filters}
        onClearFilters={onClearFilters}
      />
    </div>
  )
}
