import { useState, useCallback } from 'preact/hooks'
import type { JSX } from 'preact'
import { ScaleModal } from '../../../components/ScaleModal/ScaleModal.tsx'

interface UseScaleActionProps {
  context: string
  namespace: string
  readOnly: boolean
}

interface UseScaleActionReturn {
  /** Open the scale modal for a deployment */
  openScale: (deploymentName: string) => void
  /** The modal element to render */
  ScaleModal: JSX.Element | null
}

/**
 * Hook for managing scale action state and UI.
 * Provides the scale modal for deployments.
 */
export function useScaleAction({
  context,
  namespace,
  readOnly,
}: UseScaleActionProps): UseScaleActionReturn {
  const [scaleTarget, setScaleTarget] = useState<string | null>(null)

  const openScale = useCallback((deploymentName: string) => {
    setScaleTarget(deploymentName)
  }, [])

  const handleClose = useCallback(() => {
    setScaleTarget(null)
  }, [])

  const ScaleModalElement = scaleTarget ? (
    <ScaleModal
      isOpen={true}
      onClose={handleClose}
      deploymentName={scaleTarget}
      context={context}
      namespace={namespace}
      readOnly={readOnly}
    />
  ) : null

  return {
    openScale,
    ScaleModal: ScaleModalElement,
  }
}
