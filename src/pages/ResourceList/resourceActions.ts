import { invoke } from '@tauri-apps/api/core'

/**
 * Action codes that can be executed on resources
 */
export type ActionCode =
  | 'pods'           // Navigate to pods (from deployment)
  | 'containers'     // Navigate to containers (from pod)
  | 'describe'       // Describe resource
  | 'edit'           // Edit resource in external editor
  | 'logs'           // View logs
  | 'replica_sets'   // Navigate to replica sets (from deployment)
  | 'rolling_restart'// Rolling restart deployment
  | 'scale'          // Scale deployment
  | 'delete'         // Delete resource
  | 'port_forward'   // Start port forwarding
  | 'show_port_forward' // Show active port forwards
  | 'shell'          // Open shell to pod/container
  | 'run'            // Open run modal
  | 'ai'             // Open AI assistant

/**
 * Actions that modify resources (blocked in read-only mode)
 */
export const MODIFICATION_ACTIONS: ActionCode[] = [
  'edit', 'delete', 'rolling_restart', 'shell', 'run', 'scale', 'port_forward'
]

/**
 * Context needed to execute actions
 */
export interface ActionContext {
  context: string
  namespace: string
  resourceType: string
  resourceName: string
  /** For containers view, the parent pod name */
  parentResourceName?: string
  /** For delete: skip grace period and force-remove the resource */
  force?: boolean
}

/**
 * Result of an action execution
 */
export interface ActionResult {
  success: boolean
  error?: string
}

/** Active port forward information */
export interface ActivePortForward {
  id: string
  context: string
  namespace: string
  resourceType: string
  resourceName: string
  containerName: string | null
  localPort: number
  targetPort: number
}

/**
 * Open a shell to a pod or container
 */
export async function executeShell(ctx: ActionContext): Promise<ActionResult> {
  const { context, namespace, resourceType, resourceName, parentResourceName } = ctx
  const normalizedType = resourceType.toLowerCase()
  
  let command: string
  
  if (normalizedType === 'containers' && parentResourceName) {
    // For containers view: exec into specific container
    command = `kubectl exec -it ${parentResourceName} -c ${resourceName} --context ${context} -n ${namespace} -- /bin/sh`
  } else if (normalizedType === 'pods' || normalizedType === 'pod') {
    // For pods: exec into pod (first container)
    command = `kubectl exec -it ${resourceName} --context ${context} -n ${namespace} -- /bin/sh`
  } else {
    return { success: false, error: 'Shell is only available for pods and containers' }
  }
  
  try {
    await invoke('open_terminal_with_command', { command })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Edit a resource in external editor
 */
export async function executeEdit(ctx: ActionContext): Promise<ActionResult> {
  const { context, namespace, resourceType, resourceName } = ctx
  
  try {
    await invoke('edit_resource', {
      resourceType,
      resourceName,
      context,
      namespace,
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Delete a resource
 */
export async function executeDelete(ctx: ActionContext): Promise<ActionResult> {
  const { context, namespace, resourceType, resourceName, force = false } = ctx
  
  try {
    await invoke('delete_resource', {
      resourceType,
      resourceName,
      context,
      namespace,
      force,
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Rolling restart a deployment
 */
export async function executeRollingRestart(ctx: ActionContext): Promise<ActionResult> {
  const { context, namespace, resourceName } = ctx
  
  try {
    await invoke('rolling_restart_deployment', {
      deploymentName: resourceName,
      context,
      namespace,
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Check if an action is available for a given resource type
 */
export function isActionAvailable(action: ActionCode, resourceType: string): boolean {
  const normalizedType = resourceType.toLowerCase()
  
  switch (action) {
    case 'shell':
      return normalizedType === 'pods' || normalizedType === 'pod' || normalizedType === 'containers'
    case 'pods':
    case 'replica_sets':
    case 'rolling_restart':
    case 'scale':
      return normalizedType === 'deployments' || normalizedType === 'deployment'
    case 'containers':
      return normalizedType === 'pods' || normalizedType === 'pod'
    case 'port_forward':
    case 'show_port_forward':
      return normalizedType === 'pods' || normalizedType === 'pod' || 
             normalizedType === 'containers' || normalizedType === 'container' ||
             normalizedType === 'services' || normalizedType === 'service'
    case 'logs':
      return normalizedType === 'pods' || normalizedType === 'pod' || 
             normalizedType === 'containers' ||
             normalizedType === 'deployments' || normalizedType === 'deployment'
    case 'describe':
    case 'edit':
    case 'delete':
      // Available for most resource types (but not containers)
      return normalizedType !== 'containers'
    case 'run':
    case 'ai':
      return true // Availability depends on config, handled elsewhere
    default:
      return false
  }
}
