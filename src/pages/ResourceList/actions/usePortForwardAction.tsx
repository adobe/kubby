import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import type { JSX } from 'preact'
import { invoke } from '@tauri-apps/api/core'
import { PortForwardModal } from '../../../components/PortForwardModal/PortForwardModal.tsx'
import type { ActivePortForward } from '../resourceActions.ts'

interface UsePortForwardActionProps {
  context: string
  namespace: string
  resourceType: string
  /** Parent resource name (for containers view) */
  parentResourceName?: string
  readOnly: boolean
}

interface UsePortForwardActionReturn {
  /** Open the port forward modal for a resource */
  openPortForward: (resourceName: string) => void
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
}: UsePortForwardActionProps): UsePortForwardActionReturn {
  const [portForwardTarget, setPortForwardTarget] = useState<string | null>(null)
  const [activePortForwards, setActivePortForwards] = useState<ActivePortForward[]>([])

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
  }, [fetchActivePortForwards])

  // Refresh active port forwards periodically (every 5 seconds)
  useEffect(() => {
    const intervalId = setInterval(fetchActivePortForwards, 5000)
    return () => clearInterval(intervalId)
  }, [fetchActivePortForwards])

  const openPortForward = useCallback((resourceName: string) => {
    setPortForwardTarget(resourceName)
  }, [])

  // Also refresh port forwards when the port forward modal closes
  const handleClose = useCallback(() => {
    setPortForwardTarget(null)
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
    />
  ) : null

  return {
    openPortForward,
    portForwardsByResource,
    PortForwardModal: PortForwardModalElement,
  }
}
