import {useCallback} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {writeText} from '@tauri-apps/plugin-clipboard-manager'
import {Modal} from '../Modal/Modal.tsx'
import classes from './RunModal.module.scss'
import type {LabelSelector} from '../../kubectl/resourceTypes.ts'

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
 * Substitute placeholders in command template
 */
function substituteCommand(
  command: string,
  context: string,
  namespace: string,
  labels: LabelSelector[],
  resourceName: string,
): string {
  const labelsStr = formatLabels(labels)
  return command
    .replace(/\$context/g, context)
    .replace(/\$namespace/g, namespace)
    .replace(/\$labels/g, labelsStr)
    .replace(/\$name/g, resourceName)
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
                           readOnly,
                         }: RunModalProps) {
  const handleExecute = useCallback(async (command: RunCommand) => {
    const substitutedCommand = substituteCommand(command.command, context, namespace, labels, resourceName)
    try {
      await invoke('open_terminal_with_command', {command: substitutedCommand})
      onClose()
    } catch (e) {
      console.error('Failed to open terminal:', e)
    }
  }, [context, namespace, labels, resourceName, onClose])

  const handleCopy = useCallback(async (command: RunCommand) => {
    const substitutedCommand = substituteCommand(command.command, context, namespace, labels, resourceName)
    try {
      await writeText(substitutedCommand)
    } catch (e) {
      console.error('Failed to copy to clipboard:', e)
    }
  }, [context, namespace, labels, resourceName])

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
      <div class={classes.commandList}>
        {runCommands.map((cmd, index) => {
          const substitutedCommand = substituteCommand(cmd.command, context, namespace, labels, resourceName)
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
