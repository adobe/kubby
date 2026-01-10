import type { NavigationNode } from '../navigation/navigationTypes'
import { formatResourceTypeForDisplay } from '../navigation/navigationTypes'
import classes from './Breadcrumb.module.scss'

interface BreadcrumbProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
}

export function Breadcrumb({ navigationStack, onNavigateToNode }: BreadcrumbProps) {
  return (
    <nav class={classes.breadcrumb} aria-label="Navigation breadcrumb">
      <button
        class={classes.item}
        onClick={() => onNavigateToNode(-1)}
        type="button"
      >
        Dashboard
      </button>
      
      {navigationStack.map((node, index) => {
        const isLast = index === navigationStack.length - 1
        const label = formatResourceTypeForDisplay(node.resourceType)
        
        return (
          <span key={`${node.context}-${node.namespace}-${node.resourceType}-${index}`} class={classes.segment}>
            <span class={classes.separator}>›</span>
            {isLast ? (
              <span class={classes.current}>{label}</span>
            ) : (
              <button
                class={classes.item}
                onClick={() => onNavigateToNode(index)}
                type="button"
              >
                {label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
