import {useEffect, useState, useCallback} from 'preact/hooks'
import {invoke} from '@tauri-apps/api/core'
import {Modal} from '../Modal/Modal.tsx'
import {Button} from '../Button/Button.tsx'
import classes from './RollingRestartModal.module.scss'
import {Alert} from '../Alert/Alert.tsx'

interface DeploymentInfo {
  replicas: number
  readyReplicas: number
  availableReplicas: number
  unavailableReplicas: number
  strategy: string
  maxSurge: string | number | null
  maxUnavailable: string | number | null
  minReadySeconds: number
  progressDeadlineSeconds: number
}

interface HpaInfo {
  minReplicas: number
  maxReplicas: number
}

interface PdbInfo {
  minAvailable: string | number | null
  maxUnavailable: string | number | null
}

interface RollingRestartModalProps {
  isOpen: boolean
  onClose: () => void
  deploymentName: string
  context: string
  namespace: string
}

/**
 * Extract deployment info from raw kubectl JSON response
 */
function parseDeploymentInfo(data: Record<string, unknown>): DeploymentInfo {
  const spec = (data.spec || {}) as Record<string, unknown>
  const status = (data.status || {}) as Record<string, unknown>
  const strategy = (spec.strategy || {}) as Record<string, unknown>
  const rollingUpdate = (strategy.rollingUpdate || {}) as Record<string, unknown>
  const strategyType = (strategy.type as string) ?? 'RollingUpdate'

  return {
    replicas: (spec.replicas as number) ?? 1,
    readyReplicas: (status.readyReplicas as number) ?? 0,
    availableReplicas: (status.availableReplicas as number) ?? 0,
    unavailableReplicas: (status.unavailableReplicas as number) ?? 0,
    strategy: strategyType,
    // Kubernetes defaults for RollingUpdate strategy are 25%
    maxSurge: (rollingUpdate.maxSurge as string | number | null) ?? (strategyType === 'RollingUpdate' ? '25%' : null),
    maxUnavailable: (rollingUpdate.maxUnavailable as string | number | null) ?? (strategyType === 'RollingUpdate' ? '25%' : null),
    minReadySeconds: (spec.minReadySeconds as number) ?? 0,
    progressDeadlineSeconds: (spec.progressDeadlineSeconds as number) ?? 600,
  }
}

/**
 * Extract HPA info from raw kubectl JSON response
 * Returns null if maxReplicas is missing (shouldn't happen as it's required)
 */
function parseHpaInfo(data: Record<string, unknown>): HpaInfo | null {
  const spec = (data.spec || {}) as Record<string, unknown>
  // maxReplicas is a required field in HPA spec
  const maxReplicas = spec.maxReplicas as number | undefined
  if (maxReplicas === undefined) return null

  return {
    minReplicas: (spec.minReplicas as number) ?? 1,
    maxReplicas,
  }
}

/**
 * Extract PDB info from raw kubectl JSON response
 */
function parsePdbInfo(data: Record<string, unknown>): PdbInfo {
  const spec = (data.spec || {}) as Record<string, unknown>
  return {
    minAvailable: spec.minAvailable as string | number | null ?? null,
    maxUnavailable: spec.maxUnavailable as string | number | null ?? null,
  }
}

/**
 * Modal for confirming rolling restart of a deployment.
 * Shows deployment details, HPA, and PDB info before restart.
 */
export function RollingRestartModal({
                                      isOpen,
                                      onClose,
                                      deploymentName,
                                      context,
                                      namespace,
                                    }: RollingRestartModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(null)
  const [hpaInfo, setHpaInfo] = useState<HpaInfo | null>(null)
  const [pdbInfo, setPdbInfo] = useState<PdbInfo | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)

  // Fetch deployment details when modal opens
  useEffect(() => {
    if (!isOpen || !deploymentName) return

    let cancelled = false

    async function fetchDetails() {
      setIsLoading(true)
      setLoadingError(null)
      setRestartError(null)
      setDeploymentInfo(null)
      setHpaInfo(null)
      setPdbInfo(null)

      try {
        // Fetch deployment, HPA, and PDB in parallel
        const [deploymentData, hpaData, pdbData] = await Promise.all([
          invoke<Record<string, unknown>>('get_resource_detail', {
            resourceType: 'deployment',
            resourceName: deploymentName,
            context,
            namespace,
          }),
          invoke<Record<string, unknown> | null>('get_hpa_for_target', {
            targetKind: 'Deployment',
            targetName: deploymentName,
            context,
            namespace,
          }),
          invoke<Record<string, unknown> | null>('get_pdb_for_deployment', {
            deploymentName,
            context,
            namespace,
          }),
        ])

        if (cancelled) return

        setDeploymentInfo(parseDeploymentInfo(deploymentData))
        if (hpaData) {
          setHpaInfo(parseHpaInfo(hpaData))
        }
        if (pdbData) {
          setPdbInfo(parsePdbInfo(pdbData))
        }
      } catch (e) {
        if (cancelled) return
        setLoadingError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchDetails()

    return () => {
      cancelled = true
    }
  }, [isOpen, deploymentName, context, namespace])

  const handleConfirm = useCallback(async () => {
    setIsRestarting(true)
    setRestartError(null)

    try {
      await invoke('rolling_restart_deployment', {
        deploymentName,
        context,
        namespace,
      })
      // Close immediately after initiating restart (fire-and-forget)
      onClose()
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : String(e))
      setIsRestarting(false)
    }
  }, [deploymentName, context, namespace, onClose])

  // Handle Enter key to confirm
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isRestarting && !isLoading && deploymentInfo) {
      e.preventDefault()
      handleConfirm()
    }
  }, [isRestarting, isLoading, deploymentInfo, handleConfirm])

  const formatValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '-'
    return String(value)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rolling Restart"
      onKeyDown={handleKeyDown}
    >
      <div class={classes.content}>
        <p class={classes.message}>
          Are you sure you want to perform a rolling restart on deployment <strong>{deploymentName}</strong>?
        </p>

        {isLoading && (
          <div class={classes.loading}>Loading deployment details...</div>
        )}

        <Alert type={'error'} label={'Loading Error'} message={loadingError}/>
        <Alert type={'error'} label={'Execution Error'} message={restartError}/>

        {deploymentInfo && !isLoading && (
          <div class={classes.details}>
            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>Deployment</h3>
              <dl class={classes.grid}>
                <dt>Replicas</dt>
                <dd>{deploymentInfo.replicas}</dd>
                <dt>Strategy</dt>
                <dd>{deploymentInfo.strategy}</dd>
                {deploymentInfo.strategy === 'RollingUpdate' && (
                  <>
                    <dt>Max Surge</dt>
                    <dd>{formatValue(deploymentInfo.maxSurge)}</dd>
                    <dt>Max Unavailable</dt>
                    <dd>{formatValue(deploymentInfo.maxUnavailable)}</dd>
                  </>
                )}
                <dt>Min Ready Seconds</dt>
                <dd>{deploymentInfo.minReadySeconds}s</dd>
                <dt>Progress Deadline</dt>
                <dd>{deploymentInfo.progressDeadlineSeconds}s</dd>
              </dl>
            </section>

            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>PodDisruptionBudget</h3>
              {pdbInfo
                ? (
                  <dl class={classes.grid}>
                    {pdbInfo.minAvailable !== null && (
                      <>
                        <dt>Min Available</dt>
                        <dd>{formatValue(pdbInfo.minAvailable)}</dd>
                      </>
                    )}
                    {pdbInfo.maxUnavailable !== null && (
                      <>
                        <dt>Max Unavailable</dt>
                        <dd>{formatValue(pdbInfo.maxUnavailable)}</dd>
                      </>
                    )}
                  </dl>)
                : <p class={classes.notFound}>No PDB found</p>
              }
            </section>

            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>Status</h3>
              <dl class={classes.grid}>
                <dt>Ready</dt>
                <dd>{deploymentInfo.readyReplicas} / {deploymentInfo.replicas}</dd>
                <dt>Available</dt>
                <dd>{deploymentInfo.availableReplicas}</dd>
                <dt>Unavailable</dt>
                <dd>{deploymentInfo.unavailableReplicas}</dd>
              </dl>
            </section>

            {hpaInfo && (
              <section class={classes.section}>
                <h3 class={classes.sectionTitle}>HorizontalPodAutoscaler</h3>
                <dl class={classes.grid}>
                  <dt>Min Replicas</dt>
                  <dd>{hpaInfo.minReplicas}</dd>
                  <dt>Max Replicas</dt>
                  <dd>{hpaInfo.maxReplicas}</dd>
                </dl>
              </section>
            )}
          </div>
        )}

        <div class={classes.actions}>
          <Button
            label="Cancel"
            shortcut="Esc"
            onClick={onClose}
            disabled={isRestarting}
            tabIndex={0}
          />
          <Button
            label={isRestarting ? 'Restarting...' : 'Restart'}
            shortcut="Enter"
            onClick={handleConfirm}
            disabled={isRestarting || isLoading || !deploymentInfo}
            tabIndex={0}
            className={classes.restartButton}
          />
        </div>
      </div>
    </Modal>
  )
}
