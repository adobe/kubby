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
