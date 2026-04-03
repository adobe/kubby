import {useCallback, useEffect, useMemo, useState} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {writeText} from '@tauri-apps/plugin-clipboard-manager'
import {Modal} from '../Modal/Modal.tsx'
import {Alert} from '../Alert/Alert.tsx'
import classes from './RunModal.module.scss'
import type {LabelSelector, ResourceDetailResponse} from '../../kubectl/resourceTypes.ts'

export interface RunCommand {
  name: string
  command: string
}

interface RunModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called when the modal should be closed */
  onClose: () => void
  /** List of configured run commands */
  runCommands: RunCommand[]
  /** Current context */
  context: string
  /** Current namespace */
  namespace: string
  /** Labels from the selected resource */
  labels: LabelSelector[]
  /** Name of the selected resource */
  resourceName: string
  /** Type of the selected resource (e.g., 'pod', 'deployment', 'httpproxy') */
  resourceType: string
  /** Whether in read-only mode (disables execute, keeps copy enabled) */
  readOnly: boolean
}

/**
 * Labels that should be excluded when copying to a new pod.
 * These are either managed by Kubernetes or can cause issues with the new pod.
 */
const EXCLUDED_LABEL_PATTERNS = [
  'pod-template-hash',            // Managed by Deployments
  'controller-revision-hash',     // Managed by StatefulSets
  'statefulset.kubernetes.io/',   // StatefulSet-specific labels
  'inject-sidecar',               // Sidecar injection (can cause issues)
  'rollouts-pod-template-hash',   // Argo Rollouts
  'app.kubernetes.io/managed-by', // Helm
  'helm.sh/chart',                // Helm
]

/**
 * Filter out labels that shouldn't be copied to a new pod
 */
function filterLabels(labels: LabelSelector[]): LabelSelector[] {
  return labels.filter(label => {
    const key = label.key.toLowerCase()
    return !EXCLUDED_LABEL_PATTERNS.some(pattern => key.startsWith(pattern.toLowerCase()))
  })
}

/**
 * Format labels as key=value,key=value string for kubectl --labels flag
 */
function formatLabels(labels: LabelSelector[]): string {
  const filteredLabels = filterLabels(labels)
  if (filteredLabels.length === 0) return ''
  return filteredLabels.map(l => `${l.key}=${l.value}`).join(',')
}

/**
 * Extract a value from a nested object using dot-notation path.
 * For example, getValueByPath(obj, 'spec.virtualhost.fqdn') returns obj.spec.virtualhost.fqdn
 * Returns empty string if the path doesn't exist or value is null/undefined.
 */
function getValueByPath(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  return current != null ? String(current) : ''
}

/**
 * Substitute placeholders in command template.
 * 
 * Supports two syntaxes:
 * - Simple placeholders: $context, $namespace, $name, $labels
 * - Deep path placeholders: ${spec.virtualhost.fqdn}, ${metadata.annotations.key}
 *   These reference paths in the resource definition.
 */
function substituteCommand(
  command: string,
  context: string,
  namespace: string,
  labels: LabelSelector[],
  resourceName: string,
  resourceDef?: ResourceDetailResponse,
): string {
  const labelsStr = formatLabels(labels)
  let result = command
    // Simple placeholders (existing behavior)
    .replace(/\$context/g, context)
    .replace(/\$namespace/g, namespace)
    .replace(/\$labels/g, labelsStr)
    .replace(/\$name/g, resourceName)

  // Deep path substitutions ${path.to.value}
  if (resourceDef) {
    result = result.replace(/\$\{([^}]+)\}/g, (_, path) =>
      getValueByPath(resourceDef, path)
    )
  }

  return result
}

/**
 * Modal dialog for running kubectl commands with the current context/namespace/labels
 */
export function RunModal({
                           isOpen,
                           onClose,
                           runCommands,
                           context,
                           namespace,
                           labels,
                           resourceName,
                           resourceType,
                           readOnly,
                         }: RunModalProps) {
  const [resourceDef, setResourceDef] = useState<ResourceDetailResponse | null>(null)
  const [isLoadingDef, setIsLoadingDef] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if any command uses ${...} syntax and needs the resource definition
  const needsResourceDef = useMemo(() =>
    runCommands.some(cmd => /\$\{[^}]+\}/.test(cmd.command)),
    [runCommands]
  )

  // Fetch resource detail when modal opens (if any command needs deep path substitution)
  useEffect(() => {
    if (!isOpen || !needsResourceDef || !resourceName) {
      setResourceDef(null)
      return
    }

    let cancelled = false
    setIsLoadingDef(true)

    invoke<ResourceDetailResponse>('get_resource_detail', {
      resourceType,
      resourceName,
      context,
      namespace,
    })
      .then(result => {
        if (!cancelled) {
          setResourceDef(result)
        }
      })
      .catch(e => {
        if (!cancelled) {
          console.error('Failed to fetch resource detail for command substitution:', e)
          setError(`Failed to load resource details: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDef(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, needsResourceDef, resourceName, resourceType, context, namespace])

  const handleExecute = useCallback(async (command: RunCommand) => {
    const substitutedCommand = substituteCommand(
      command.command, context, namespace, labels, resourceName, resourceDef ?? undefined
    )
    try {
      await invoke('open_terminal_with_command', {command: substitutedCommand})
      onClose()
    } catch (e) {
      console.error('Failed to open terminal:', e)
      setError(`Failed to execute command: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [context, namespace, labels, resourceName, resourceDef, onClose])

  const handleCopy = useCallback(async (command: RunCommand) => {
    const substitutedCommand = substituteCommand(
      command.command, context, namespace, labels, resourceName, resourceDef ?? undefined
    )
    try {
      await writeText(substitutedCommand)
    } catch (e) {
      console.error('Failed to copy to clipboard:', e)
    }
  }, [context, namespace, labels, resourceName, resourceDef])

  if (runCommands.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Run Command">
        <div class={classes.empty}>
          <p>No run commands configured.</p>
          <p class={classes.hint}>
            Add commands to your config file under <code>resources.run</code>
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run Command">
      <Alert type="error" label="Error" message={error}/>
      <div class={classes.commandList}>
        {needsResourceDef && isLoadingDef && (
          <div class={classes.loading}>Loading resource details...</div>
        )}
        {runCommands.map((cmd, index) => {
          const substitutedCommand = substituteCommand(
            cmd.command, context, namespace, labels, resourceName, resourceDef ?? undefined
          )
          return (
            <div key={index} class={classes.commandItem}>
              <div class={classes.commandHeader}>
                <span class={classes.commandName}>{cmd.name}</span>
                <div class={classes.commandActions}>
                  <button
                    class={classes.actionButton}
                    onClick={() => handleExecute(cmd)}
                    title={readOnly ? 'Disabled in read-only mode' : 'Execute in terminal'}
                    disabled={readOnly}
                  >
                    Execute
                  </button>
                  <button
                    class={classes.actionButton}
                    onClick={() => handleCopy(cmd)}
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <pre class={classes.commandPreview}>{substitutedCommand}</pre>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
