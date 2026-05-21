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

import { useState, useCallback, useMemo } from 'preact/hooks'
import type { JSX } from 'preact'
import { RunModal } from '../../../components/RunModal/RunModal.tsx'
import type { LabelSelector } from '../../../kubectl/resourceTypes.ts'

/** Run command configuration with optional resource type filter */
export interface RunCommand {
  name: string
  command: string
  /** Optional list of resource types this command applies to. If empty/undefined, applies to all. */
  resources?: string[]
}

interface UseRunActionProps {
  /** All run commands from config */
  allRunCommands: RunCommand[]
  /** Current resource type */
  resourceType: string
  context: string
  namespace: string
  readOnly: boolean
}

interface UseRunActionReturn {
  /** Open the run modal */
  openRun: () => void
  /** Whether there are any run commands available for this resource type */
  hasRunCommands: boolean
  /** Render the run modal for a specific resource */
  renderRunModal: (resourceName: string, labels: LabelSelector[]) => JSX.Element | null
}

/**
 * Hook for managing run action state and UI.
 * Provides the run modal for executing custom commands.
 */
export function useRunAction({
  allRunCommands,
  resourceType,
  context,
  namespace,
  readOnly,
}: UseRunActionProps): UseRunActionReturn {
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)

  // Filter run commands to only those applicable to the current resource type
  const runCommands = useMemo(() => {
    const normalizedType = resourceType.toLowerCase()
    return allRunCommands.filter(cmd => {
      // If resources is not specified or empty, command applies to all resources
      if (!cmd.resources || cmd.resources.length === 0) {
        return true
      }
      // Check if current resource type matches any in the list (case-insensitive)
      return cmd.resources.some(r => 
        r.toLowerCase() === normalizedType || 
        r.toLowerCase() + 's' === normalizedType || 
        r.toLowerCase() === normalizedType + 's'
      )
    })
  }, [allRunCommands, resourceType])

  const hasRunCommands = runCommands.length > 0

  const openRun = useCallback(() => {
    if (hasRunCommands) {
      setIsRunModalOpen(true)
    }
  }, [hasRunCommands])

  const handleClose = useCallback(() => {
    setIsRunModalOpen(false)
  }, [])

  const renderRunModal = useCallback((resourceName: string, labels: LabelSelector[]): JSX.Element | null => {
    if (!isRunModalOpen) return null

    return (
      <RunModal
        isOpen={true}
        onClose={handleClose}
        runCommands={runCommands}
        context={context}
        namespace={namespace}
        labels={labels}
        resourceName={resourceName}
        resourceType={resourceType}
        readOnly={readOnly}
      />
    )
  }, [isRunModalOpen, handleClose, runCommands, context, namespace, resourceType, readOnly])

  return {
    openRun,
    hasRunCommands,
    renderRunModal,
  }
}
