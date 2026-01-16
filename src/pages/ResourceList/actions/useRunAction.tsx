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
        readOnly={readOnly}
      />
    )
  }, [isRunModalOpen, handleClose, runCommands, context, namespace, readOnly])

  return {
    openRun,
    hasRunCommands,
    renderRunModal,
  }
}
