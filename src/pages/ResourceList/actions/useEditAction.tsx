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
