import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks'
import type { JSX } from 'preact'
import { invoke } from '@tauri-apps/api/core'
import { PortForwardModal } from '../../../components/PortForwardModal/PortForwardModal.tsx'
import type { ActivePortForward } from '../resourceActions.ts'

/** Information about a port forward that died unexpectedly */
interface DeadPortForward {
  info: ActivePortForward
  exitCode: number | null
  errorMessage: string | null
}

interface UsePortForwardActionProps {
  context: string
  namespace: string
  resourceType: string
  /** Parent resource name (for containers view) */
  parentResourceName?: string
  readOnly: boolean
  /** Callback when a port forward fails silently (process died) */
  onPortForwardFailed?: (resourceName: string, localPort: number, targetPort: number, errorMessage?: string) => void
}

interface UsePortForwardActionReturn {
  /** Open the port forward modal for a resource, optionally with known ports from the list */
  openPortForward: (resourceName: string, initialPorts?: number[]) => void
  /** Map from resource name to array of forwarded local ports */
  portForwardsByResource: Map<string, number[]>
  /** The modal element to render */
  PortForwardModal: JSX.Element | null
}

/**
 * Hook for managing port forward action state and UI.
 * Provides the port forward modal and tracks active port forwards.
 */
export function usePortForwardAction({
  context,
  namespace,
  resourceType,
  parentResourceName,
  readOnly,
  onPortForwardFailed,
}: UsePortForwardActionProps): UsePortForwardActionReturn {
  const [portForwardTarget, setPortForwardTarget] = useState<string | null>(null)
  const [portForwardInitialPorts, setPortForwardInitialPorts] = useState<number[] | undefined>(undefined)
  const [activePortForwards, setActivePortForwards] = useState<ActivePortForward[]>([])
  // Track which port forwards we've already reported as failed to avoid duplicate notifications
  const reportedFailuresRef = useRef<Set<string>>(new Set())

  // Build a lookup map from resource name to its forwarded local ports
  const portForwardsByResource = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const pf of activePortForwards) {
      const ports = map.get(pf.resourceName) || []
      ports.push(pf.localPort)
      map.set(pf.resourceName, ports)
    }
    return map
  }, [activePortForwards])

  // Check for dead port forwards and notify via callback
  const checkDeadPortForwards = useCallback(async () => {
    try {
      const deadForwards = await invoke<DeadPortForward[]>('check_dead_port_forwards')
      if (deadForwards.length > 0) {
        console.log('[PortForward] Dead forwards detected:', deadForwards)
      }
      for (const dead of deadForwards) {
        // Report all failures (not filtered by context/namespace/resourceType since the user
        // might have switched views but still needs to know about the failure)
        const failureKey = `${dead.info.id}`
        if (!reportedFailuresRef.current.has(failureKey)) {
          reportedFailuresRef.current.add(failureKey)
          console.log('[PortForward] Reporting failure:', dead.info.resourceName, dead.info.localPort, dead.info.targetPort, dead.errorMessage)
          onPortForwardFailed?.(dead.info.resourceName, dead.info.localPort, dead.info.targetPort, dead.errorMessage ?? undefined)
          // Clear the failure key after a delay to allow re-reporting if it happens again
          setTimeout(() => {
            reportedFailuresRef.current.delete(failureKey)
          }, 30000) // 30 seconds
        }
      }
    } catch (e) {
      console.error('Failed to check for dead port forwards:', e)
    }
  }, [onPortForwardFailed])

  // Fetch active port forwards for the current context/namespace
  const fetchActivePortForwards = useCallback(async () => {
    try {
      const forwards = await invoke<ActivePortForward[]>('list_active_port_forwards', {
        context,
        namespace,
        resourceType: resourceType.toLowerCase(),
      })
      setActivePortForwards(forwards)
    } catch (e) {
      console.error('Failed to fetch active port forwards:', e)
      setActivePortForwards([])
    }
  }, [context, namespace, resourceType])

  // Fetch active port forwards on mount and when context/namespace/resourceType changes
  useEffect(() => {
    fetchActivePortForwards()
    // Also check for dead forwards on mount
    checkDeadPortForwards()
  }, [fetchActivePortForwards, checkDeadPortForwards])

  // Refresh active port forwards and check for dead ones periodically (every 2 seconds for faster detection)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchActivePortForwards()
      checkDeadPortForwards()
    }, 2000)
    return () => clearInterval(intervalId)
  }, [fetchActivePortForwards, checkDeadPortForwards])

  const openPortForward = useCallback((resourceName: string, initialPorts?: number[]) => {
    setPortForwardTarget(resourceName)
    setPortForwardInitialPorts(initialPorts)
  }, [])

  // Also refresh port forwards when the port forward modal closes
  const handleClose = useCallback(() => {
    setPortForwardTarget(null)
    setPortForwardInitialPorts(undefined)
    fetchActivePortForwards()
  }, [fetchActivePortForwards])

  const PortForwardModalElement = portForwardTarget ? (
    <PortForwardModal
      isOpen={true}
      onClose={handleClose}
      context={context}
      namespace={namespace}
      resourceType={resourceType}
      resourceName={portForwardTarget}
      parentResourceName={parentResourceName}
      readOnly={readOnly}
      initialPorts={portForwardInitialPorts}
    />
  ) : null

  return {
    openPortForward,
    portForwardsByResource,
    PortForwardModal: PortForwardModalElement,
  }
}
