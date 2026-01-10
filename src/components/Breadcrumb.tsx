import type { NavigationNode } from '../navigation/navigationTypes'
import { formatResourceTypeForDisplay } from '../navigation/navigationTypes'
import classes from './Breadcrumb.module.scss'

interface BreadcrumbProps {
  navigationStack: NavigationNode[];
  onNavigateToNode: (index: number) => void;
}

export function Breadcrumb({ navigationStack, onNavigateToNode }: BreadcrumbProps) {
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
        const prevNode = index > 0 ? navigationStack[index - 1] : null
        
        // Check if previous node should show the pod name in brackets (when current is containers)
        const showPodNameAfterPrev = prevNode && 
          prevNode.resourceType === 'pods' && 
          node.resourceType === 'containers' && 
          node.parentResourceName
        
        const label = formatResourceTypeForDisplay(node.resourceType)
        
        return (
          <span key={`${node.context}-${node.namespace}-${node.resourceType}-${index}`} class={classes.segment}>
            {showPodNameAfterPrev && (
              <span class={classes.parentResource}> [{node.parentResourceName}]</span>
            )}
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
