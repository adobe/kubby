import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/core'
import { Modal } from '../Modal/Modal.tsx'
import { Button } from '../Button/Button.tsx'
import classes from './ScaleModal.module.scss'
import { Alert } from '../Alert/Alert.tsx'

interface DeploymentInfo {
  replicas: number
  readyReplicas: number
  availableReplicas: number
  strategy: string
}

interface HpaInfo {
  name: string
  minReplicas: number
  maxReplicas: number
}

interface PdbInfo {
  name: string
  minAvailable: string | number | null
  maxUnavailable: string | number | null
}

interface ScaleModalProps {
  isOpen: boolean
  onClose: () => void
  deploymentName: string
  context: string
  namespace: string
  readOnly: boolean
}

interface ValidationErrors {
  replicas?: string
  hpaMin?: string
  hpaMax?: string
  pdbMinAvailable?: string
  pdbMaxUnavailable?: string
}

interface ValidationWarnings {
  replicasBelowMin?: string
  replicasAboveMax?: string
}

/**
 * Extract deployment info from raw kubectl JSON response
 */
function parseDeploymentInfo(data: Record<string, unknown>): DeploymentInfo {
  const spec = (data.spec || {}) as Record<string, unknown>
  const status = (data.status || {}) as Record<string, unknown>
  const strategy = (spec.strategy || {}) as Record<string, unknown>

  return {
    replicas: (spec.replicas as number) ?? 1,
    readyReplicas: (status.readyReplicas as number) ?? 0,
    availableReplicas: (status.availableReplicas as number) ?? 0,
    strategy: (strategy.type as string) ?? 'RollingUpdate',
  }
}

/**
 * Extract HPA info from raw kubectl JSON response
 */
function parseHpaInfo(data: Record<string, unknown>): HpaInfo | null {
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const spec = (data.spec || {}) as Record<string, unknown>
  const maxReplicas = spec.maxReplicas as number | undefined
  if (maxReplicas === undefined) return null

  return {
    name: (metadata.name as string) ?? '',
    minReplicas: (spec.minReplicas as number) ?? 1,
    maxReplicas,
  }
}

/**
 * Extract PDB info from raw kubectl JSON response
 */
function parsePdbInfo(data: Record<string, unknown>): PdbInfo | null {
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const spec = (data.spec || {}) as Record<string, unknown>
  const name = metadata.name as string
  if (!name) return null

  return {
    name,
    minAvailable: (spec.minAvailable as string | number | null) ?? null,
    maxUnavailable: (spec.maxUnavailable as string | number | null) ?? null,
  }
}

/**
 * Validate PDB value (can be number or percentage string like "50%")
 */
function isValidPdbValue(value: string): boolean {
  if (!value.trim()) return true // Empty is valid (means not set)
  // Check if it's a valid number
  if (/^\d+$/.test(value)) return true
  // Check if it's a valid percentage
  if (/^\d+%$/.test(value)) return true
  return false
}

/**
 * Modal for scaling a deployment.
 * Shows deployment details, HPA, and PDB info with editable fields.
 */
export function ScaleModal({
  isOpen,
  onClose,
  deploymentName,
  context,
  namespace,
  readOnly,
}: ScaleModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [scaleError, setScaleError] = useState<string | null>(null)
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(null)
  const [hpaInfo, setHpaInfo] = useState<HpaInfo | null>(null)
  const [pdbInfo, setPdbInfo] = useState<PdbInfo | null>(null)
  const [isScaling, setIsScaling] = useState(false)
  
  // Ref for replicas input to focus on load
  const replicasInputRef = useRef<HTMLInputElement>(null)

  // Editable form values
  const [replicas, setReplicas] = useState<string>('')
  const [hpaMinReplicas, setHpaMinReplicas] = useState<string>('')
  const [hpaMaxReplicas, setHpaMaxReplicas] = useState<string>('')
  const [pdbMinAvailable, setPdbMinAvailable] = useState<string>('')
  const [pdbMaxUnavailable, setPdbMaxUnavailable] = useState<string>('')

  // Track which PDB field was originally set
  const [originalPdbField, setOriginalPdbField] = useState<'minAvailable' | 'maxUnavailable' | null>(null)

  // Fetch deployment details when modal opens
  useEffect(() => {
    if (!isOpen || !deploymentName) return

    let cancelled = false

    async function fetchDetails() {
      setIsLoading(true)
      setLoadingError(null)
      setScaleError(null)
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

        const deployment = parseDeploymentInfo(deploymentData)
        setDeploymentInfo(deployment)
        setReplicas(String(deployment.replicas))

        if (hpaData) {
          const hpa = parseHpaInfo(hpaData)
          setHpaInfo(hpa)
          if (hpa) {
            setHpaMinReplicas(String(hpa.minReplicas))
            setHpaMaxReplicas(String(hpa.maxReplicas))
          }
        }

        if (pdbData) {
          const pdb = parsePdbInfo(pdbData)
          setPdbInfo(pdb)
          if (pdb) {
            if (pdb.minAvailable !== null) {
              setPdbMinAvailable(String(pdb.minAvailable))
              setOriginalPdbField('minAvailable')
            } else {
              setPdbMinAvailable('')
            }
            if (pdb.maxUnavailable !== null) {
              setPdbMaxUnavailable(String(pdb.maxUnavailable))
              setOriginalPdbField('maxUnavailable')
            } else {
              setPdbMaxUnavailable('')
            }
          }
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

  // Focus replicas input when loading completes
  useEffect(() => {
    if (!isLoading && deploymentInfo && replicasInputRef.current) {
      replicasInputRef.current.focus()
      replicasInputRef.current.select()
    }
  }, [isLoading, deploymentInfo])

  // Validation
  const validationErrors = useMemo<ValidationErrors>(() => {
    const errors: ValidationErrors = {}

    // Replicas validation
    const replicasNum = parseInt(replicas, 10)
    if (isNaN(replicasNum) || replicasNum < 0) {
      errors.replicas = 'Replicas must be 0 or greater'
    }

    // HPA validation (only if HPA exists)
    if (hpaInfo) {
      const minNum = parseInt(hpaMinReplicas, 10)
      const maxNum = parseInt(hpaMaxReplicas, 10)

      if (isNaN(minNum) || minNum < 1) {
        errors.hpaMin = 'minReplicas must be at least 1'
      }
      if (isNaN(maxNum) || maxNum < 1) {
        errors.hpaMax = 'maxReplicas must be at least 1'
      } else if (!isNaN(minNum) && maxNum < minNum) {
        errors.hpaMax = 'maxReplicas must be >= minReplicas'
      }
    }

    // PDB validation (only if PDB exists)
    if (pdbInfo) {
      if (pdbMinAvailable && !isValidPdbValue(pdbMinAvailable)) {
        errors.pdbMinAvailable = 'Invalid format (use number or percentage like "50%")'
      }
      if (pdbMaxUnavailable && !isValidPdbValue(pdbMaxUnavailable)) {
        errors.pdbMaxUnavailable = 'Invalid format (use number or percentage like "50%")'
      }
    }

    return errors
  }, [replicas, hpaInfo, hpaMinReplicas, hpaMaxReplicas, pdbInfo, pdbMinAvailable, pdbMaxUnavailable])

  // Warnings (non-blocking)
  const validationWarnings = useMemo<ValidationWarnings>(() => {
    const warnings: ValidationWarnings = {}

    if (hpaInfo && !validationErrors.replicas && !validationErrors.hpaMin && !validationErrors.hpaMax) {
      const replicasNum = parseInt(replicas, 10)
      const minNum = parseInt(hpaMinReplicas, 10)
      const maxNum = parseInt(hpaMaxReplicas, 10)

      if (!isNaN(replicasNum) && !isNaN(minNum) && replicasNum < minNum) {
        warnings.replicasBelowMin = 'Replicas is below HPA minReplicas - HPA will scale up'
      }
      if (!isNaN(replicasNum) && !isNaN(maxNum) && replicasNum > maxNum) {
        warnings.replicasAboveMax = 'Replicas is above HPA maxReplicas - HPA will scale down'
      }
    }

    return warnings
  }, [replicas, hpaInfo, hpaMinReplicas, hpaMaxReplicas, validationErrors])

  const hasValidationErrors = Object.keys(validationErrors).length > 0

  const handleScale = useCallback(async () => {
    if (hasValidationErrors || readOnly) return

    setIsScaling(true)
    setScaleError(null)

    try {
      // IMPORTANT: Apply HPA/PDB constraints BEFORE scaling the deployment
      // This ensures the new replica count is allowed by the autoscaler

      // 1. Patch HPA first (to allow the new replica count)
      if (hpaInfo) {
        const newMin = parseInt(hpaMinReplicas, 10)
        const newMax = parseInt(hpaMaxReplicas, 10)
        if (newMin !== hpaInfo.minReplicas || newMax !== hpaInfo.maxReplicas) {
          await invoke('patch_hpa', {
            hpaName: hpaInfo.name,
            minReplicas: newMin,
            maxReplicas: newMax,
            context,
            namespace,
          })
        }
      }

      // 2. Patch PDB if it exists and values changed
      if (pdbInfo) {
        const minAvailChanged = pdbMinAvailable !== (pdbInfo.minAvailable !== null ? String(pdbInfo.minAvailable) : '')
        const maxUnavailChanged = pdbMaxUnavailable !== (pdbInfo.maxUnavailable !== null ? String(pdbInfo.maxUnavailable) : '')

        if (minAvailChanged || maxUnavailChanged) {
          // Determine which field to use
          // If user set minAvailable, use that; otherwise use maxUnavailable
          const useMinAvailable = pdbMinAvailable.trim() !== ''
          
          await invoke('patch_pdb', {
            pdbName: pdbInfo.name,
            minAvailable: useMinAvailable ? pdbMinAvailable : null,
            maxUnavailable: !useMinAvailable && pdbMaxUnavailable.trim() !== '' ? pdbMaxUnavailable : null,
            context,
            namespace,
          })
        }
      }

      // 3. Scale deployment LAST (after constraints are updated)
      await invoke('scale_deployment', {
        deploymentName,
        replicas: parseInt(replicas, 10),
        context,
        namespace,
      })

      // Close immediately after scaling (fire-and-forget)
      onClose()
    } catch (e) {
      setScaleError(e instanceof Error ? e.message : String(e))
      setIsScaling(false)
    }
  }, [
    hasValidationErrors, readOnly, deploymentName, replicas, context, namespace,
    hpaInfo, hpaMinReplicas, hpaMaxReplicas,
    pdbInfo, pdbMinAvailable, pdbMaxUnavailable,
    onClose,
  ])

  // Handle Enter key to confirm
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isScaling && !isLoading && deploymentInfo && !readOnly && !hasValidationErrors) {
      e.preventDefault()
      handleScale()
    }
  }, [isScaling, isLoading, deploymentInfo, readOnly, hasValidationErrors, handleScale])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scale Deployment"
      onKeyDown={handleKeyDown}
    >
      <div class={classes.content}>
        <p class={classes.message}>
          Scale deployment <strong>{deploymentName}</strong>
        </p>

        {isLoading && (
          <div class={classes.loading}>Loading deployment details...</div>
        )}

        <Alert type="error" label="Loading Error" message={loadingError} />
        <Alert type="error" label="Scale Error" message={scaleError} />

        {deploymentInfo && !isLoading && (
          <div class={classes.details}>
            {/* Deployment Section */}
            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>Deployment</h3>
              <div class={classes.formGrid}>
                <label class={classes.label}>
                  <span>Replicas</span>
                  <input
                    ref={replicasInputRef}
                    type="number"
                    min="0"
                    value={replicas}
                    onInput={(e) => setReplicas((e.target as HTMLInputElement).value)}
                    class={`${classes.input} ${validationErrors.replicas ? classes.inputError : ''}`}
                    disabled={readOnly}
                  />
                  {validationErrors.replicas && (
                    <span class={classes.errorText}>{validationErrors.replicas}</span>
                  )}
                </label>
              </div>
              <dl class={classes.grid}>
                <dt>Ready</dt>
                <dd>{deploymentInfo.readyReplicas} / {deploymentInfo.replicas}</dd>
                <dt>Available</dt>
                <dd>{deploymentInfo.availableReplicas}</dd>
                <dt>Strategy</dt>
                <dd>{deploymentInfo.strategy}</dd>
              </dl>
            </section>

            {/* Status Section - Current vs Target */}
            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>Status</h3>
              <dl class={classes.grid}>
                <dt>Current Replicas</dt>
                <dd>{deploymentInfo.replicas}</dd>
                <dt>Target Replicas</dt>
                <dd class={parseInt(replicas, 10) !== deploymentInfo.replicas ? classes.changed : ''}>
                  {replicas || '0'}
                </dd>
              </dl>
              {(validationWarnings.replicasBelowMin || validationWarnings.replicasAboveMax) && (
                <div class={classes.warningBox}>
                  {validationWarnings.replicasBelowMin && (
                    <p class={classes.warningText}>{validationWarnings.replicasBelowMin}</p>
                  )}
                  {validationWarnings.replicasAboveMax && (
                    <p class={classes.warningText}>{validationWarnings.replicasAboveMax}</p>
                  )}
                </div>
              )}
            </section>

            {/* HPA Section */}
            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>HorizontalPodAutoscaler</h3>
              {hpaInfo ? (
                <div class={classes.formGrid}>
                  <label class={classes.label}>
                    <span>minReplicas</span>
                    <input
                      type="number"
                      min="1"
                      value={hpaMinReplicas}
                      onInput={(e) => setHpaMinReplicas((e.target as HTMLInputElement).value)}
                      class={`${classes.input} ${validationErrors.hpaMin ? classes.inputError : ''}`}
                      disabled={readOnly}
                    />
                    {validationErrors.hpaMin && (
                      <span class={classes.errorText}>{validationErrors.hpaMin}</span>
                    )}
                  </label>
                  <label class={classes.label}>
                    <span>maxReplicas</span>
                    <input
                      type="number"
                      min="1"
                      value={hpaMaxReplicas}
                      onInput={(e) => setHpaMaxReplicas((e.target as HTMLInputElement).value)}
                      class={`${classes.input} ${validationErrors.hpaMax ? classes.inputError : ''}`}
                      disabled={readOnly}
                    />
                    {validationErrors.hpaMax && (
                      <span class={classes.errorText}>{validationErrors.hpaMax}</span>
                    )}
                  </label>
                </div>
              ) : (
                <p class={classes.notFound}>No HPA found</p>
              )}
            </section>

            {/* PDB Section */}
            <section class={classes.section}>
              <h3 class={classes.sectionTitle}>PodDisruptionBudget</h3>
              {pdbInfo ? (
                <div class={classes.formGrid}>
                  <label class={classes.label}>
                    <span>minAvailable</span>
                    <input
                      type="text"
                      placeholder="e.g., 1 or 50%"
                      value={pdbMinAvailable}
                      onInput={(e) => {
                        setPdbMinAvailable((e.target as HTMLInputElement).value)
                        // Clear the other field when setting this one
                        if ((e.target as HTMLInputElement).value) {
                          setPdbMaxUnavailable('')
                        }
                      }}
                      class={`${classes.input} ${validationErrors.pdbMinAvailable ? classes.inputError : ''}`}
                      disabled={readOnly || originalPdbField === 'maxUnavailable'}
                    />
                    {validationErrors.pdbMinAvailable && (
                      <span class={classes.errorText}>{validationErrors.pdbMinAvailable}</span>
                    )}
                    {originalPdbField === 'maxUnavailable' && (
                      <span class={classes.hintText}>PDB uses maxUnavailable</span>
                    )}
                  </label>
                  <label class={classes.label}>
                    <span>maxUnavailable</span>
                    <input
                      type="text"
                      placeholder="e.g., 1 or 25%"
                      value={pdbMaxUnavailable}
                      onInput={(e) => {
                        setPdbMaxUnavailable((e.target as HTMLInputElement).value)
                        // Clear the other field when setting this one
                        if ((e.target as HTMLInputElement).value) {
                          setPdbMinAvailable('')
                        }
                      }}
                      class={`${classes.input} ${validationErrors.pdbMaxUnavailable ? classes.inputError : ''}`}
                      disabled={readOnly || originalPdbField === 'minAvailable'}
                    />
                    {validationErrors.pdbMaxUnavailable && (
                      <span class={classes.errorText}>{validationErrors.pdbMaxUnavailable}</span>
                    )}
                    {originalPdbField === 'minAvailable' && (
                      <span class={classes.hintText}>PDB uses minAvailable</span>
                    )}
                  </label>
                </div>
              ) : (
                <p class={classes.notFound}>No PDB found</p>
              )}
            </section>
          </div>
        )}

        <div class={classes.actions}>
          <Button
            label="Cancel"
            shortcut="Esc"
            onClick={onClose}
            disabled={isScaling}
            tabIndex={0}
          />
          <Button
            label={isScaling ? 'Scaling...' : 'Scale'}
            shortcut="Enter"
            onClick={handleScale}
            disabled={isScaling || isLoading || !deploymentInfo || readOnly || hasValidationErrors}
            tabIndex={0}
            className={classes.scaleButton}
            tooltip={
              readOnly
                ? 'Disabled in read-only mode'
                : hasValidationErrors
                  ? 'Fix validation errors first'
                  : undefined
            }
          />
        </div>
      </div>
    </Modal>
  )
}
