/**
 * Linearization system for TreeView
 * 
 * Path patterns:
 * - ** matches any path (multiple segments)
 * - * matches a single segment or part of a segment
 * - . denotes the node to serialize at the end
 */

// Linearized part types for proper formatting
export type LinearizedPart = 
  | { type: 'key'; value: string }      // Formatted like object keys (blue)
  | { type: 'string'; value: string }   // Formatted like string values (green)
  | { type: 'number'; value: number }   // Formatted like number values (orange)
  | { type: 'boolean'; value: boolean } // Formatted like boolean values (purple)
  | { type: 'text'; value: string }     // Plain/dimmed text for labels
  | { type: 'separator' }               // Visual separator (|)
  | { type: 'table'; headers: string[]; rows: LinearizedPart[][] } // Table with headers and rows

export type LinearizedResult = LinearizedPart[]

export type LinearizerFn = (data: unknown, key: string) => LinearizedResult | null

export interface LinearizerConfig {
  pattern: string
  linearize: LinearizerFn
}

// Helper functions to create parts
export const key = (value: string): LinearizedPart => ({ type: 'key', value })
export const str = (value: string): LinearizedPart => ({ type: 'string', value })
export const num = (value: number): LinearizedPart => ({ type: 'number', value })
export const bool = (value: boolean): LinearizedPart => ({ type: 'boolean', value })
export const text = (value: string): LinearizedPart => ({ type: 'text', value })
export const sep = (): LinearizedPart => ({ type: 'separator' })
export const table = (headers: string[], rows: LinearizedPart[][]): LinearizedPart => 
  ({ type: 'table', headers, rows })

/**
 * Match a path against a pattern
 * Pattern syntax:
 * - ** matches zero or more segments
 * - * matches exactly one segment (or part within a segment)
 * - . matches exactly one segment (used to denote the target node)
 * 
 * Example: "**\/env\/." matches paths like "spec/containers/0/env/0"
 * where "0" is the child node under "env" that will be linearized
 */
export function matchPath(path: string[], pattern: string): boolean {
  const patternParts = pattern.split('/').filter(p => p !== '')
  
  return matchPatternParts(path, patternParts, 0, 0)
}

function matchPatternParts(
  path: string[], 
  pattern: string[], 
  pathIdx: number, 
  patternIdx: number
): boolean {
  // Both exhausted = match
  if (patternIdx >= pattern.length && pathIdx >= path.length) {
    return true
  }
  
  // Pattern exhausted but path remains = no match
  if (patternIdx >= pattern.length) {
    return false
  }
  
  const patternPart = pattern[patternIdx]
  
  // ** matches zero or more segments
  if (patternPart === '**') {
    // Try matching ** with zero segments
    if (matchPatternParts(path, pattern, pathIdx, patternIdx + 1)) {
      return true
    }
    // Try matching ** with one or more segments
    for (let i = pathIdx; i < path.length; i++) {
      if (matchPatternParts(path, pattern, i + 1, patternIdx + 1)) {
        return true
      }
    }
    return false
  }
  
  // Path exhausted but pattern remains (and it's not **)
  if (pathIdx >= path.length) {
    return false
  }
  
  // * or . matches exactly one segment
  if (patternPart === '*' || patternPart === '.') {
    return matchPatternParts(path, pattern, pathIdx + 1, patternIdx + 1)
  }
  
  // Pattern with wildcards like *Probe
  if (patternPart.includes('*')) {
    const regex = new RegExp('^' + patternPart.replace(/\*/g, '.*') + '$')
    if (regex.test(path[pathIdx])) {
      return matchPatternParts(path, pattern, pathIdx + 1, patternIdx + 1)
    }
    return false
  }
  
  // Exact match
  if (path[pathIdx] === patternPart) {
    return matchPatternParts(path, pattern, pathIdx + 1, patternIdx + 1)
  }
  
  return false
}

// ============================================================================
// Linearizer Functions
// ============================================================================

/**
 * Linearize environment variable
 * - Simple: name: "value"
 * - valueFrom secret: name: from secret secretName/key
 * - valueFrom fieldRef: name: from field fieldPath (apiVersion)
 */
export const linearizeEnvVar: LinearizerFn = (data, pathKey) => {
  if (typeof data !== 'object' || data === null) return null
  
  const env = data as Record<string, unknown>
  const name = env.name as string || pathKey
  
  // Simple value
  if ('value' in env) {
    const value = env.value
    if (typeof value === 'string') {
      return [key(name + ':'), str(value)]
    }
    if (typeof value === 'number') {
      return [key(name + ':'), num(value)]
    }
    if (typeof value === 'boolean') {
      return [key(name + ':'), bool(value)]
    }
  }
  
  // valueFrom
  if ('valueFrom' in env && typeof env.valueFrom === 'object' && env.valueFrom !== null) {
    const valueFrom = env.valueFrom as Record<string, unknown>
    
    // Secret key ref
    if ('secretKeyRef' in valueFrom) {
      const ref = valueFrom.secretKeyRef as Record<string, unknown>
      const secretName = ref.name as string || '?'
      const secretKey = ref.key as string || '?'
      return [key(name + ':'), text('from secret'), str(secretName), text('/'), str(secretKey)]
    }
    
    // Field ref
    if ('fieldRef' in valueFrom) {
      const ref = valueFrom.fieldRef as Record<string, unknown>
      const fieldPath = ref.fieldPath as string || '?'
      const apiVersion = ref.apiVersion as string
      const parts: LinearizedResult = [key(name + ':'), text('from field'), str(fieldPath)]
      if (apiVersion) {
        parts.push(text('('), str(apiVersion), text(')'))
      }
      return parts
    }
    
    // ConfigMap key ref
    if ('configMapKeyRef' in valueFrom) {
      const ref = valueFrom.configMapKeyRef as Record<string, unknown>
      const cmName = ref.name as string || '?'
      const cmKey = ref.key as string || '?'
      return [key(name + ':'), text('from configMap'), str(cmName), text('/'), str(cmKey)]
    }
    
    // Resource field ref
    if ('resourceFieldRef' in valueFrom) {
      const ref = valueFrom.resourceFieldRef as Record<string, unknown>
      const resource = ref.resource as string || '?'
      const container = ref.containerName as string
      const parts: LinearizedResult = [key(name + ':'), text('from resource'), str(resource)]
      if (container) {
        parts.push(text('('), str(container), text(')'))
      }
      return parts
    }
  }
  
  return null
}

/**
 * Linearize probe (livenessProbe, readinessProbe, startupProbe)
 */
export const linearizeProbe: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const probe = data as Record<string, unknown>
  const parts: LinearizedResult = []
  
  // HTTP Get
  if ('httpGet' in probe && typeof probe.httpGet === 'object' && probe.httpGet !== null) {
    const http = probe.httpGet as Record<string, unknown>
    const scheme = http.scheme as string || 'HTTP'
    const path = http.path as string || '/'
    const port = http.port
    parts.push(str(scheme), text('GET'), str(path + ':'), typeof port === 'number' ? num(port) : str(String(port ?? '?')))
  }
  
  // TCP Socket
  if ('tcpSocket' in probe && typeof probe.tcpSocket === 'object' && probe.tcpSocket !== null) {
    const tcp = probe.tcpSocket as Record<string, unknown>
    const port = tcp.port
    parts.push(text('TCP :'), typeof port === 'number' ? num(port) : str(String(port ?? '?')))
  }
  
  // Exec
  if ('exec' in probe && typeof probe.exec === 'object' && probe.exec !== null) {
    const exec = probe.exec as Record<string, unknown>
    const command = Array.isArray(exec.command) ? exec.command.join(' ') : '?'
    parts.push(text('exec:'), str(command))
  }
  
  // GRPC
  if ('grpc' in probe && typeof probe.grpc === 'object' && probe.grpc !== null) {
    const grpc = probe.grpc as Record<string, unknown>
    const port = grpc.port
    const service = grpc.service as string
    parts.push(text('gRPC :'), typeof port === 'number' ? num(port) : str(String(port ?? '?')))
    if (service) parts.push(str(service))
  }
  
  // Common timing params
  if (parts.length > 0) {
    const hasTimingBefore = parts.length > 0
    if ('initialDelaySeconds' in probe) {
      if (hasTimingBefore) parts.push(sep())
      parts.push(key('delay:'), num(probe.initialDelaySeconds as number), text('s'))
    }
    if ('periodSeconds' in probe) {
      parts.push(key('period:'), num(probe.periodSeconds as number), text('s'))
    }
    if ('timeoutSeconds' in probe) {
      parts.push(key('timeout:'), num(probe.timeoutSeconds as number), text('s'))
    }
    if ('successThreshold' in probe) {
      parts.push(key('success:'), num(probe.successThreshold as number))
    }
    if ('failureThreshold' in probe) {
      parts.push(key('failure:'), num(probe.failureThreshold as number))
    }
  }
  
  return parts.length > 0 ? parts : null
}

/**
 * Linearize container port
 * Example: TCP http 8080
 */
export const linearizePort: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const port = data as Record<string, unknown>
  const protocol = port.protocol as string || 'TCP'
  const name = port.name as string
  const containerPort = port.containerPort
  const hostPort = port.hostPort
  const portNumber = port.port

  const parts: LinearizedResult = [str(protocol)]
  if (name) parts.push(str(name))
  parts.push(typeof containerPort === 'number' ? num(containerPort) : str(String(containerPort ?? '')))
  if (hostPort) {
    parts.push(text('→'), typeof hostPort === 'number' ? num(hostPort) : str(String(hostPort)))
  }
  if (portNumber) {
    parts.push(text('→'), typeof portNumber === 'number' ? num(portNumber) : str(String(portNumber)))
  }
  
  return parts
}

/**
 * Linearize resources (limits/requests)
 */
export const linearizeResources: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const resources = data as Record<string, unknown>
  const parts: LinearizedResult = []
  
  // Limits
  if ('limits' in resources && typeof resources.limits === 'object' && resources.limits !== null) {
    const limits = resources.limits as Record<string, unknown>
    parts.push(key('limits:'))
    if ('cpu' in limits) parts.push(str(String(limits.cpu)), text('cpu'))
    if ('memory' in limits) parts.push(str(String(limits.memory)))
    if ('nvidia.com/gpu' in limits) parts.push(str(String(limits['nvidia.com/gpu'])), text('gpu'))
  }
  
  // Requests
  if ('requests' in resources && typeof resources.requests === 'object' && resources.requests !== null) {
    if (parts.length > 0) parts.push(sep())
    const requests = resources.requests as Record<string, unknown>
    parts.push(key('requests:'))
    if ('cpu' in requests) parts.push(str(String(requests.cpu)), text('cpu'))
    if ('memory' in requests) parts.push(str(String(requests.memory)))
    if ('nvidia.com/gpu' in requests) parts.push(str(String(requests['nvidia.com/gpu'])), text('gpu'))
  }
  
  return parts.length > 0 ? parts : null
}

/**
 * Linearize volume mount
 */
export const linearizeVolumeMount: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const mount = data as Record<string, unknown>
  const mountPath = mount.mountPath as string || '?'
  const name = mount.name as string || '?'
  const readOnly = mount.readOnly as boolean
  const subPath = mount.subPath as string
  
  const parts: LinearizedResult = [str(mountPath)]
  if (readOnly) parts.push(text('('), bool(true), text('ro)'))
  parts.push(text('from:'), str(name))
  if (subPath) parts.push(key('subPath:'), str(subPath))
  
  return parts
}

/**
 * Linearize volume
 */
export const linearizeVolume: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const volume = data as Record<string, unknown>
  const name = volume.name as string || '?'
  
  if ('configMap' in volume && typeof volume.configMap === 'object' && volume.configMap !== null) {
    const cm = volume.configMap as Record<string, unknown>
    return [key(name + ':'), text('configMap'), str(cm.name as string || '?')]
  }
  
  if ('secret' in volume && typeof volume.secret === 'object' && volume.secret !== null) {
    const secret = volume.secret as Record<string, unknown>
    return [key(name + ':'), text('secret'), str(secret.secretName as string || '?')]
  }
  
  if ('persistentVolumeClaim' in volume && typeof volume.persistentVolumeClaim === 'object') {
    const pvc = volume.persistentVolumeClaim as Record<string, unknown>
    return [key(name + ':'), text('pvc'), str(pvc.claimName as string || '?')]
  }
  
  if ('emptyDir' in volume) {
    const ed = volume.emptyDir as Record<string, unknown> | null
    const medium = ed?.medium as string
    const parts: LinearizedResult = [key(name + ':'), text('emptyDir')]
    if (medium) parts.push(text('('), str(medium), text(')'))
    return parts
  }
  
  if ('hostPath' in volume && typeof volume.hostPath === 'object' && volume.hostPath !== null) {
    const hp = volume.hostPath as Record<string, unknown>
    return [key(name + ':'), text('hostPath'), str(hp.path as string || '?')]
  }
  
  if ('projected' in volume) {
    return [key(name + ':'), text('projected')]
  }
  
  if ('downwardAPI' in volume) {
    return [key(name + ':'), text('downwardAPI')]
  }
  
  return null
}

/**
 * Linearize deployment strategy
 * Example: RollingUpdate maxSurge: 50% maxUnavailable: 50%
 */
export const linearizeStrategy: LinearizerFn = (data) => {
  if (typeof data !== 'object' || data === null) return null
  
  const strategy = data as Record<string, unknown>
  const type = strategy.type as string || 'RollingUpdate'
  const parts: LinearizedResult = [str(type)]
  
  if ('rollingUpdate' in strategy && typeof strategy.rollingUpdate === 'object' && strategy.rollingUpdate !== null) {
    const rollingUpdate = strategy.rollingUpdate as Record<string, unknown>
    
    if ('maxSurge' in rollingUpdate) {
      const maxSurge = rollingUpdate.maxSurge
      parts.push(key('maxSurge:'))
      if (typeof maxSurge === 'string' && maxSurge.endsWith('%')) {
        parts.push(num(parseInt(maxSurge)), text('%'))
      } else if (typeof maxSurge === 'number') {
        parts.push(num(maxSurge))
      } else {
        parts.push(str(String(maxSurge)))
      }
    }
    
    if ('maxUnavailable' in rollingUpdate) {
      const maxUnavailable = rollingUpdate.maxUnavailable
      parts.push(key('maxUnavailable:'))
      if (typeof maxUnavailable === 'string' && maxUnavailable.endsWith('%')) {
        parts.push(num(parseInt(maxUnavailable)), text('%'))
      } else if (typeof maxUnavailable === 'number') {
        parts.push(num(maxUnavailable))
      } else {
        parts.push(str(String(maxUnavailable)))
      }
    }
  }
  
  return parts.length > 1 ? parts : null
}

// ============================================================================
// Pod Status Linearizers
// ============================================================================

/**
 * Format a timestamp as duration since now (e.g., "2h", "5d", "3m")
 */
function formatDuration(timestamp: string | undefined): string {
  if (!timestamp) return '-'
  
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return '-'
  
  const now = Date.now()
  const diffMs = now - date.getTime()
  
  if (diffMs < 0) return '-'
  
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

/**
 * Get container state info from a container status object
 */
function getContainerState(state: Record<string, unknown> | undefined): { 
  state: string
  reason?: string
  exitCode?: number
  startedAt?: string 
} {
  if (!state) return { state: 'Unknown' }
  
  if ('running' in state && typeof state.running === 'object' && state.running !== null) {
    const running = state.running as Record<string, unknown>
    return { state: 'Running', startedAt: running.startedAt as string }
  }
  if ('waiting' in state && typeof state.waiting === 'object' && state.waiting !== null) {
    const waiting = state.waiting as Record<string, unknown>
    return { state: 'Waiting', reason: waiting.reason as string }
  }
  if ('terminated' in state && typeof state.terminated === 'object' && state.terminated !== null) {
    const terminated = state.terminated as Record<string, unknown>
    return { 
      state: 'Terminated', 
      reason: terminated.reason as string,
      exitCode: terminated.exitCode as number
    }
  }
  return { state: 'Unknown' }
}

/**
 * Truncate image name to show only the tag or last part
 */
function truncateImage(image: string): string {
  if (!image) return '?'
  // If it has a tag, show repo:tag
  const lastSlash = image.lastIndexOf('/')
  const shortImage = lastSlash >= 0 ? image.slice(lastSlash + 1) : image
  // Truncate if still too long
  return shortImage.length > 30 ? shortImage.slice(0, 27) + '...' : shortImage
}

/**
 * Linearize container statuses array as a single table
 * | Name | State | Started | Ready | Restarts | Age | Image |
 */
export const linearizeContainerStatuses: LinearizerFn = (data) => {
  if (!Array.isArray(data) || data.length === 0) return null
  
  // Check if first item looks like a container status
  const first = data[0] as Record<string, unknown>
  if (!('name' in first) || !('state' in first)) return null
  
  const rows: LinearizedPart[][] = data.map(item => {
    const container = item as Record<string, unknown>
    const name = container.name as string || '?'
    const stateObj = container.state as Record<string, unknown>
    const stateInfo = getContainerState(stateObj)
    const started = container.started as boolean
    const ready = container.ready as boolean
    const restartCount = container.restartCount as number ?? 0
    const image = truncateImage(container.image as string)
    
    // Build state cell with reason if present
    let stateCell: LinearizedPart
    if (stateInfo.reason) {
      stateCell = text(`${stateInfo.state} (${stateInfo.reason})`)
    } else if (stateInfo.state === 'Running') {
      stateCell = str(stateInfo.state)
    } else {
      stateCell = text(stateInfo.state)
    }
    
    // Age from startedAt (for running containers)
    const age = formatDuration(stateInfo.startedAt)
    
    return [
      str(name),
      stateCell,
      started ? bool(true) : bool(false),
      ready ? bool(true) : bool(false),
      restartCount > 0 ? num(restartCount) : text('0'),
      age !== '-' ? str(age) : text(age),
      str(image)
    ]
  })
  
  return [table(['Name', 'State', 'Started', 'Ready', 'Restarts', 'Age', 'Image'], rows)]
}

/**
 * Linearize conditions array as a single table
 * | Type | Status | Reason | Age |
 */
export const linearizeConditions: LinearizerFn = (data) => {
  if (!Array.isArray(data) || data.length === 0) return null
  
  // Check if first item looks like a condition
  const first = data[0] as Record<string, unknown>
  if (!('type' in first) || !('status' in first)) return null
  
  const rows: LinearizedPart[][] = data.map(item => {
    const condition = item as Record<string, unknown>
    const type = condition.type as string || '?'
    const condStatus = condition.status as string || '?'
    const reason = condition.reason as string
    const lastTransitionTime = condition.lastTransitionTime as string
    
    // Color code the status
    let statusCell: LinearizedPart
    if (condStatus === 'True') {
      statusCell = str(condStatus)
    } else if (condStatus === 'False') {
      statusCell = bool(false)
    } else {
      statusCell = text(condStatus)
    }
    
    const age = formatDuration(lastTransitionTime)
    
    return [
      str(type),
      statusCell,
      reason ? str(reason) : text('-'),
      age !== '-' ? str(age) : text(age)
    ]
  })
  
  return [table(['Type', 'Status', 'Reason', 'Age'], rows)]
}

// ============================================================================
// Default Linearizers Configuration
// ============================================================================

export const defaultLinearizers: LinearizerConfig[] = [
  // Array items - use /. to match each element
  { pattern: '**/env/.', linearize: linearizeEnvVar },
  { pattern: '**/ports/.', linearize: linearizePort },
  { pattern: '**/volumeMounts/.', linearize: linearizeVolumeMount },
  { pattern: '**/volumes/.', linearize: linearizeVolume },
  // Direct objects - match the object itself
  { pattern: '**/*Probe', linearize: linearizeProbe },
  { pattern: '**/resources', linearize: linearizeResources },
  { pattern: '**/strategy', linearize: linearizeStrategy },
  // Pod status linearizers - match entire arrays, not individual items
  { pattern: '**/containerStatuses', linearize: linearizeContainerStatuses },
  { pattern: '**/initContainerStatuses', linearize: linearizeContainerStatuses },
  { pattern: '**/conditions', linearize: linearizeConditions },
]

/**
 * Find a matching linearizer for a given path
 */
export function findLinearizer(
  path: string[], 
  linearizers: LinearizerConfig[] = defaultLinearizers
): LinearizerFn | null {
  for (const config of linearizers) {
    if (matchPath(path, config.pattern)) {
      return config.linearize
    }
  }
  return null
}
