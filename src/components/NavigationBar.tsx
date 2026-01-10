import { LabelFilterChip } from './LabelFilterChip.tsx'
import { Breadcrumb } from './Breadcrumb.tsx'
import type { LabelSelector } from '../kubectl/resourceTypes'
import type { NavigationNode } from '../navigation/navigationTypes'
import classes from './NavigationBar.module.scss'

interface NavigationBarProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
  labelSelectors?: LabelSelector[];
  onRemoveFilter?: (index: number) => void;
}

export function NavigationBar({ 
  navigationStack, 
  onNavigateToNode, 
  labelSelectors, 
  onRemoveFilter 
}: NavigationBarProps) {
  return (
    <div class={classes.navigationBar}>
      <Breadcrumb 
        navigationStack={navigationStack} 
        onNavigateToNode={onNavigateToNode} 
      />
      
      {labelSelectors && labelSelectors.length > 0 && onRemoveFilter && (
        <div class={classes.chips}>
          {labelSelectors.map((selector, index) => (
            <LabelFilterChip
              key={`${selector.key}-${selector.value}-${index}`}
              labelKey={selector.key}
              labelValue={selector.value}
              onRemove={() => onRemoveFilter(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
