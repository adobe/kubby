import { useState, useCallback } from 'preact/hooks'
import type { JSX } from 'preact'
import { RollingRestartModal } from '../../../components/RollingRestartModal/RollingRestartModal.tsx'

interface UseRollingRestartActionProps {
  context: string
  namespace: string
  readOnly: boolean
}

interface UseRollingRestartActionReturn {
  /** Open the rolling restart modal for a deployment */
  openRollingRestart: (deploymentName: string) => void
  /** The modal element to render */
  RollingRestartModal: JSX.Element | null
}

/**
 * Hook for managing rolling restart action state and UI.
 * Provides the rolling restart modal for deployments.
 */
export function useRollingRestartAction({
  context,
  namespace,
  readOnly,
}: UseRollingRestartActionProps): UseRollingRestartActionReturn {
  const [rollingRestartTarget, setRollingRestartTarget] = useState<string | null>(null)

  const openRollingRestart = useCallback((deploymentName: string) => {
    setRollingRestartTarget(deploymentName)
  }, [])

  const handleClose = useCallback(() => {
    setRollingRestartTarget(null)
  }, [])

  const RollingRestartModalElement = rollingRestartTarget ? (
    <RollingRestartModal
      isOpen={true}
      onClose={handleClose}
      deploymentName={rollingRestartTarget}
      context={context}
      namespace={namespace}
      readOnly={readOnly}
    />
  ) : null

  return {
    openRollingRestart,
    RollingRestartModal: RollingRestartModalElement,
  }
}
