import { useState, useCallback } from 'preact/hooks'
import type { JSX } from 'preact'
import { ConfirmModal } from '../../../components/ConfirmModal/ConfirmModal.tsx'
import { executeDelete } from '../resourceActions.ts'
import classes from './useDeleteAction.module.scss'

interface UseDeleteActionProps {
  context: string
  namespace: string
  resourceType: string
  onSuccess: () => void
  readOnly: boolean
}

interface UseDeleteActionReturn {
  /** Open the delete confirmation modal for a resource */
  openDelete: (resourceName: string) => void
  /** Whether a delete operation is in progress */
  isDeleting: boolean
  /** The modal element to render */
  DeleteModal: JSX.Element | null
}

/**
 * Hook for managing delete action state and UI.
 * Provides the delete confirmation modal and handles the delete operation.
 */
export function useDeleteAction({
  context,
  namespace,
  resourceType,
  onSuccess,
  readOnly,
}: UseDeleteActionProps): UseDeleteActionReturn {
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ resourceName: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [force, setForce] = useState(false)

  const openDelete = useCallback((resourceName: string) => {
    setDeleteConfirmation({ resourceName })
    setDeleteError(null)
    setForce(false)
  }, [])

  const handleClose = useCallback(() => {
    setDeleteConfirmation(null)
    setDeleteError(null)
    setForce(false)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmation) return

    console.log('[Delete] Starting delete:', {
      context,
      namespace,
      resourceType,
      resourceName: deleteConfirmation.resourceName,
    })

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const result = await executeDelete({
        context,
        namespace,
        resourceType,
        resourceName: deleteConfirmation.resourceName,
        force,
      })

      console.log('[Delete] Result:', result)

      if (result.success) {
        setDeleteConfirmation(null)
        onSuccess()
      } else {
        console.error('[Delete] Failed:', result.error)
        setDeleteError(result.error || 'Failed to delete resource')
      }
    } catch (e) {
      console.error('[Delete] Exception:', e)
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsDeleting(false)
    }
  }, [deleteConfirmation, context, namespace, resourceType, force, onSuccess])

  const DeleteModal = deleteConfirmation ? (
    <ConfirmModal
      isOpen={true}
      onClose={handleClose}
      onConfirm={handleConfirmDelete}
      title="Delete Resource"
      message={<>Are you sure you want to delete <strong>{deleteConfirmation.resourceName}</strong>?</>}
      warningText="This action cannot be undone."
      confirmLabel="Delete"
      confirmingLabel="Deleting..."
      isConfirming={isDeleting}
      error={deleteError}
      destructive
      readOnly={readOnly}
    >
      <label class={classes.forceOption}>
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce((e.target as HTMLInputElement).checked)}
          disabled={isDeleting}
          aria-label="Force delete"
        />
        Force delete (immediate, no grace period)
      </label>
    </ConfirmModal>
  ) : null

  return {
    openDelete,
    isDeleting,
    DeleteModal,
  }
}
