/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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
