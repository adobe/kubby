import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { Modal } from '../Modal/Modal.tsx'
import { Button } from '../Button/Button.tsx'
import { Alert } from '../Alert/Alert.tsx'
import classes from './PortForwardModal.module.scss'

/** Container port information */
interface ContainerPort {
  port: number
  protocol: string
  name: string | null
}

/** Port forward target (container with its ports) */
interface PortForwardTarget {
  containerName: string
  ports: ContainerPort[]
}

/** Response from get_port_forward_targets */
interface PortForwardTargetsResponse {
  targets: PortForwardTarget[]
  resourceType: string
  resourceName: string
}

/** Active port forward information */
interface ActivePortForward {
  id: string
  context: string
  namespace: string
  resourceType: string
  resourceName: string
  containerName: string | null
  localPort: number
  targetPort: number
}

/** Selection state for a port */
interface PortSelection {
  containerName: string
  port: number
  protocol: string
  localPort: number
  selected: boolean
}

interface PortForwardModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called when the modal should be closed */
  onClose: () => void
  /** Current context */
  context: string
  /** Current namespace */
  namespace: string
  /** Resource type (service, pod, or container) */
  resourceType: string
  /** Resource name */
  resourceName: string
  /** Parent resource name (pod name for containers) */
  parentResourceName?: string
  /** Whether in read-only mode */
  readOnly: boolean
}

/**
 * Compute the default local port for a container port.
 * For ports under 1000, double it (e.g., 80 -> 8080, 91 -> 9191).
 * For ports 1000 and above, use the same port.
 */
function computeLocalPort(containerPort: number): number {
  if (containerPort < 1000) {
    return containerPort * 100 + containerPort
  }
  return containerPort
}

/**
 * Modal for managing port forwards.
 * Shows available ports for a resource and allows starting/stopping port forwards.
 */
export function PortForwardModal({
  isOpen,
  onClose,
  context,
  namespace,
  resourceType,
  resourceName,
  parentResourceName,
  readOnly,
}: PortForwardModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [targets, setTargets] = useState<PortForwardTarget[]>([])
  const [activeForwards, setActiveForwards] = useState<ActivePortForward[]>([])
  const [portSelections, setPortSelections] = useState<PortSelection[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Focus first input when modal opens and loading completes
  useEffect(() => {
    if (isOpen && !isLoading && !loadingError && portSelections.length > 0) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        firstInputRef.current?.focus()
        firstInputRef.current?.select()
      }, 0)
    }
  }, [isOpen, isLoading, loadingError, portSelections.length])

  // Fetch targets and active forwards when modal opens
  useEffect(() => {
    if (!isOpen || !resourceName) return

    let cancelled = false

    async function fetchData() {
      setIsLoading(true)
      setLoadingError(null)
      setAddError(null)
      setTargets([])
      setActiveForwards([])
      setPortSelections([])

      try {
        // Fetch targets and active forwards in parallel
        const [targetsResponse, forwards] = await Promise.all([
          invoke<PortForwardTargetsResponse>('get_port_forward_targets', {
            context,
            namespace,
            resourceType,
            resourceName,
            parentResourceName,
          }),
          invoke<ActivePortForward[]>('list_active_port_forwards', {
            context,
            namespace,
            resourceType: resourceType.toLowerCase(),
            resourceName,
          }),
        ])

        if (cancelled) return

        setTargets(targetsResponse.targets)
        setActiveForwards(forwards)

        // Build initial port selections
        const selections: PortSelection[] = []
        let isFirst = true
        for (const target of targetsResponse.targets) {
          // If container has no exposed ports, add an empty row for manual entry
          if (target.ports.length === 0) {
            selections.push({
              containerName: target.containerName,
              port: 80, // Default port
              protocol: 'TCP',
              localPort: computeLocalPort(80),
              selected: isFirst,
            })
            isFirst = false
          } else {
            for (const port of target.ports) {
              // Check if this port is already forwarded
              const isForwarded = forwards.some(
                f => f.targetPort === port.port && 
                     (f.containerName === target.containerName || f.containerName === null)
              )
              
              if (!isForwarded) {
                selections.push({
                  containerName: target.containerName,
                  port: port.port,
                  protocol: port.protocol,
                  localPort: computeLocalPort(port.port),
                  selected: isFirst, // First port is selected by default
                })
                isFirst = false
              }
            }
          }
        }
        setPortSelections(selections)
      } catch (e) {
        if (cancelled) return
        setLoadingError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [isOpen, context, namespace, resourceType, resourceName, parentResourceName])

  // Handle checkbox toggle
  const handleTogglePort = useCallback((containerName: string, port: number) => {
    setPortSelections(prev =>
      prev.map(sel =>
        sel.containerName === containerName && sel.port === port
          ? { ...sel, selected: !sel.selected }
          : sel
      )
    )
  }, [])

  // Handle local port change
  const handleLocalPortChange = useCallback((containerName: string, port: number, localPort: string) => {
    const parsed = parseInt(localPort, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      setPortSelections(prev =>
        prev.map(sel =>
          sel.containerName === containerName && sel.port === port
            ? { ...sel, localPort: parsed }
            : sel
        )
      )
    }
  }, [])

  // Handle container port change - also updates local port using computeLocalPort
  const handleContainerPortChange = useCallback((containerName: string, oldPort: number, newPortStr: string) => {
    const parsed = parseInt(newPortStr, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      setPortSelections(prev =>
        prev.map(sel =>
          sel.containerName === containerName && sel.port === oldPort
            ? { ...sel, port: parsed, localPort: computeLocalPort(parsed) }
            : sel
        )
      )
    }
  }, [])

  // Handle adding port forwards
  const handleAdd = useCallback(async () => {
    const selectedPorts = portSelections.filter(sel => sel.selected)

    setIsAdding(true)
    setAddError(null)

    try {
      // Start all selected port forwards
      const results = await Promise.all(
        selectedPorts.map(sel =>
          invoke<ActivePortForward>('start_port_forward', {
            context,
            namespace,
            resourceType,
            resourceName,
            containerPort: sel.port,
            localPort: sel.localPort,
            containerName: sel.containerName !== resourceName ? sel.containerName : null,
            parentResourceName,
          })
        )
      )

      // Update active forwards
      setActiveForwards(prev => [...prev, ...results])
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsAdding(false)
      setTimeout(() => {
        onClose()
      })
    }
  }, [portSelections, context, namespace, resourceType, resourceName, parentResourceName, onClose])

  const handleStopAll = useCallback(async () => {
    return Promise.all(activeForwards.map(f => handleStop(f.id)))
  }, [activeForwards, targets])

  // Handle stopping a port forward
  const handleStop = useCallback(async (id: string) => {
    try {
      await invoke('stop_port_forward', { id })
      
      // Find the stopped forward to add it back to selections
      const stoppedForward = activeForwards.find(f => f.id === id)
      
      setActiveForwards(prev => prev.filter(f => f.id !== id))
      
      // Add the port back to selections if it exists in targets
      if (stoppedForward) {
        const target = targets.find(t => 
          t.containerName === stoppedForward.containerName || 
          (stoppedForward.containerName === null && t.ports.some(p => p.port === stoppedForward.targetPort))
        )
        if (target) {
          const portInfo = target.ports.find(p => p.port === stoppedForward.targetPort)
          if (portInfo) {
            setPortSelections(prev => [
              ...prev,
              {
                containerName: target.containerName,
                port: portInfo.port,
                protocol: portInfo.protocol,
                localPort: stoppedForward.localPort,
                selected: false,
              },
            ])
          }
        }
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    }
  }, [activeForwards, targets])

  // Handle Enter key to add
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isAdding && !isLoading && !readOnly) {
      e.preventDefault()
      handleAdd()
    }
  }, [isAdding, isLoading, readOnly, handleAdd])

  // Group port selections by container
  const selectionsByContainer = useMemo(() => {
    const grouped: Record<string, PortSelection[]> = {}
    for (const sel of portSelections) {
      if (!grouped[sel.containerName]) {
        grouped[sel.containerName] = []
      }
      grouped[sel.containerName].push(sel)
    }
    return grouped
  }, [portSelections])

  const hasSelectedPorts = portSelections.some(sel => sel.selected)
  const hasAvailablePorts = portSelections.length > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Port Forward"
      onKeyDown={handleKeyDown}
    >
      <div class={classes.content}>
        {isLoading && (
          <div class={classes.loading}>Loading port information...</div>
        )}

        <Alert type="error" label="Loading Error" message={loadingError} />
        <Alert type="error" label="Error" message={addError} />

        {!isLoading && !loadingError && (
          <>

            {/* Existing Port Forwards Section */}
            {activeForwards.length > 0 && (
              <section class={classes.section}>
                <div class={classes.sectionHeader}>
                  <h3 class={classes.sectionTitle}>Existing Port Forwards</h3>
                  <Button
                    label="Stop All"
                    onClick={() => handleStopAll()}
                    disabled={readOnly}
                    tooltip={readOnly ? 'Disabled in read-only mode' : 'Stop all port forwards'}
                    className={classes.stopButton}
                    tabIndex={0}
                  />
                </div>
                <table class={classes.forwardsTable}>
                  <thead>
                  <tr>
                    <th>Container</th>
                    <th>Port</th>
                    <th>Local</th>
                    <th></th>
                  </tr>
                  </thead>
                  <tbody>
                  {activeForwards.map(forward => (
                    <tr key={forward.id}>
                      <td>{forward.containerName || resourceName}</td>
                      <td>{forward.targetPort}</td>
                      <td>{forward.localPort}</td>
                      <td class={classes.stopCell}>
                        <Button
                          label="Stop"
                          onClick={() => handleStop(forward.id)}
                          disabled={readOnly}
                          tooltip={readOnly ? 'Disabled in read-only mode' : 'Stop port forward'}
                          className={classes.stopButton}
                          tabIndex={0}
                        />
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Add Port Forward Section */}
            {hasAvailablePorts && (
              <section class={classes.section}>
                <h3 class={classes.sectionTitle}>Add Port Forwards</h3>
                <div class={classes.containerList}>
                  {Object.entries(selectionsByContainer).map(([containerName, selections], containerIdx) => (
                    <div key={containerName} class={classes.container}>
                      <div class={classes.containerHeader}>
                        <span class={classes.containerName}>{containerName}</span>
                      </div>
                      <div class={classes.portList}>
                        {selections.map((sel, idx) => (
                          <div key={`${sel.containerName}-${idx}`} class={classes.portRow}>
                            <label class={classes.portCheckbox}>
                              <input
                                type="checkbox"
                                checked={sel.selected}
                                onChange={() => handleTogglePort(sel.containerName, sel.port)}
                                disabled={readOnly}
                                tabIndex={0}
                              />
                              <span class={classes.portLabel}>Container:</span>
                            </label>
                            <div class={classes.containerPortInput}>
                              <input
                                ref={containerIdx === 0 && idx === 0 ? firstInputRef : undefined}
                                type="number"
                                value={sel.port}
                                min={1}
                                max={65535}
                                onChange={(e) => handleContainerPortChange(
                                  sel.containerName,
                                  sel.port,
                                  (e.target as HTMLInputElement).value
                                )}
                                disabled={readOnly}
                                class={classes.portField}
                                tabIndex={0}
                              />
                              <span class={classes.protocol}>/{sel.protocol}</span>
                            </div>
                            <div class={classes.localPortInput}>
                              <span class={classes.localPortLabel}>Local:</span>
                              <input
                                type="number"
                                value={sel.localPort}
                                min={1}
                                max={65535}
                                onChange={(e) => handleLocalPortChange(
                                  sel.containerName,
                                  sel.port,
                                  (e.target as HTMLInputElement).value
                                )}
                                disabled={readOnly}
                                class={classes.portField}
                                tabIndex={0}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!hasAvailablePorts && activeForwards.length === 0 && (
              <div class={classes.emptyState}>
                No ports available for port forwarding.
              </div>
            )}
          </>
        )}

        <div class={classes.actions}>
          <Button
            label="Cancel"
            shortcut="Esc"
            onClick={onClose}
            disabled={isAdding}
            tabIndex={0}
          />
          <Button
            label={isAdding ? 'Adding...' : 'Add & Close'}
            shortcut="Enter"
            onClick={handleAdd}
            disabled={isAdding || isLoading || !hasSelectedPorts || readOnly}
            tabIndex={0}
            className={classes.addButton}
            tooltip={readOnly ? 'Disabled in read-only mode' : undefined}
          />
        </div>
      </div>
    </Modal>
  )
}
