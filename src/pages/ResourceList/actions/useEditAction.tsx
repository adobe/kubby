import { useState, useCallback } from 'preact/hooks'
import { executeEdit } from '../resourceActions.ts'

interface UseEditActionProps {
  context: string
  namespace: string
  resourceType: string
  onSuccess: () => void
}

interface UseEditActionReturn {
  /** Start editing a resource (opens external editor) */
  startEdit: (resourceName: string) => Promise<void>
  /** Name of the resource currently being edited, or null */
  editingResourceName: string | null
  /** Error message from the last edit attempt, or null */
  editError: string | null
  /** Clear the edit error */
  clearEditError: () => void
}

/**
 * Hook for managing edit action state.
 * Handles launching external editor and tracking edit state.
 */
export function useEditAction({
  context,
  namespace,
  resourceType,
  onSuccess,
}: UseEditActionProps): UseEditActionReturn {
  const [editingResourceName, setEditingResourceName] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = useCallback(async (resourceName: string) => {
    // Don't start if already editing
    if (editingResourceName) return

    setEditingResourceName(resourceName)
    setEditError(null)

    try {
      const result = await executeEdit({
        context,
        namespace,
        resourceType,
        resourceName,
      })

      if (!result.success && result.error) {
        setEditError(result.error)
      } else {
        onSuccess()
      }
    } finally {
      setEditingResourceName(null)
    }
  }, [editingResourceName, context, namespace, resourceType, onSuccess])

  const clearEditError = useCallback(() => {
    setEditError(null)
  }, [])

  return {
    startEdit,
    editingResourceName,
    editError,
    clearEditError,
  }
}
