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

/**
 * Configuration for related resources that can be navigated to from a source resource.
 * Used by the "Jump..." dropdown in the shortcuts bar.
 */

import type { ResourceFilter } from '../../kubectl/filterTypes.ts'
import { createSpecFilter, createLabelFilter, parseLabelSelectorString } from '../../kubectl/filterTypes.ts'
import type { LabelSelector } from '../../kubectl/resourceTypes.ts'

/** Filter type for related resource navigation */
export type RelatedFilterType = 'spec' | 'label' | 'name'

/** Configuration for a related resource */
export interface RelatedResource {
  /** Unique identifier for this relation */
  code: string
  /** Display label in the dropdown */
  label: string
  /** Target resource type to navigate to */
  targetResourceType: string
  /** Type of filter to use */
  filterType: RelatedFilterType
  /** For spec filters: the JSON path to filter by */
  specPath?: string
  /** For spec filters: optional kind path to also filter by resource kind */
  specKindPath?: string
  /** For label filters: the label key to use from the source resource */
  labelKey?: string
  /** Display label for the filter chip (e.g., "for Deployment") */
  displayLabel?: string
}

/** Related resources configuration per source resource type */
const RELATED_RESOURCES: Record<string, RelatedResource[]> = {
  deployments: [
    {
      code: 'rollouts',
      label: 'Rollouts',
      targetResourceType: 'rollouts',
      filterType: 'name',
      displayLabel: 'for',
    },
    {
      code: 'replicasets',
      label: 'ReplicaSets',
      targetResourceType: 'replicasets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'hpa',
      label: 'HorizontalPodAutoscalers',
      targetResourceType: 'horizontalpodautoscalers',
      filterType: 'spec',
      specPath: 'spec.scaleTargetRef.name',
      specKindPath: 'spec.scaleTargetRef.kind',
      displayLabel: 'for',
    },
    {
      code: 'pdb',
      label: 'PodDisruptionBudgets',
      targetResourceType: 'poddisruptionbudgets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'secrets',
      label: 'Secrets',
      targetResourceType: 'secrets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'httpproxies',
      label: 'HTTPProxies',
      targetResourceType: 'httpproxies',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'services',
      label: 'Services',
      targetResourceType: 'services',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  deployment: [
    // Same as deployments (singular form)
    {
      code: 'rollouts',
      label: 'Rollouts',
      targetResourceType: 'rollouts',
      filterType: 'name',
      displayLabel: 'for',
    },
    {
      code: 'replicasets',
      label: 'ReplicaSets',
      targetResourceType: 'replicasets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'hpa',
      label: 'HorizontalPodAutoscalers',
      targetResourceType: 'horizontalpodautoscalers',
      filterType: 'spec',
      specPath: 'spec.scaleTargetRef.name',
      specKindPath: 'spec.scaleTargetRef.kind',
      displayLabel: 'for',
    },
    {
      code: 'pdb',
      label: 'PodDisruptionBudgets',
      targetResourceType: 'poddisruptionbudgets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'secrets',
      label: 'Secrets',
      targetResourceType: 'secrets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'httpproxies',
      label: 'HTTPProxies',
      targetResourceType: 'httpproxies',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'services',
      label: 'Services',
      targetResourceType: 'services',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  rollouts: [
    {
      code: 'deployments',
      label: 'Deployment',
      targetResourceType: 'deployments',
      filterType: 'name',
      displayLabel: 'for',
    },
    {
      code: 'replicasets',
      label: 'ReplicaSets',
      targetResourceType: 'replicasets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'hpa',
      label: 'HorizontalPodAutoscalers',
      targetResourceType: 'horizontalpodautoscalers',
      filterType: 'spec',
      specPath: 'spec.scaleTargetRef.name',
      specKindPath: 'spec.scaleTargetRef.kind',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  rollout: [
    {
      code: 'deployments',
      label: 'Deployment',
      targetResourceType: 'deployments',
      filterType: 'name',
      displayLabel: 'for',
    },
    {
      code: 'replicasets',
      label: 'ReplicaSets',
      targetResourceType: 'replicasets',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'hpa',
      label: 'HorizontalPodAutoscalers',
      targetResourceType: 'horizontalpodautoscalers',
      filterType: 'spec',
      specPath: 'spec.scaleTargetRef.name',
      specKindPath: 'spec.scaleTargetRef.kind',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  pods: [
    {
      code: 'deployments',
      label: 'Deployments',
      targetResourceType: 'deployments',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'rollouts',
      label: 'Rollouts',
      targetResourceType: 'rollouts',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'services',
      label: 'Services',
      targetResourceType: 'services',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  pod: [
    {
      code: 'deployments',
      label: 'Deployments',
      targetResourceType: 'deployments',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'rollouts',
      label: 'Rollouts',
      targetResourceType: 'rollouts',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'services',
      label: 'Services',
      targetResourceType: 'services',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  replicasets: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  replicaset: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  services: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
    {
      code: 'endpoints',
      label: 'Endpoints',
      targetResourceType: 'endpoints',
      filterType: 'name',
      displayLabel: 'for',
    },
  ],
  service: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
    {
      code: 'endpoints',
      label: 'Endpoints',
      targetResourceType: 'endpoints',
      filterType: 'name',
      displayLabel: 'for',
    },
  ],
  statefulsets: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
    {
      code: 'pvc',
      label: 'PVCs',
      targetResourceType: 'persistentvolumeclaims',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
  ],
  statefulset: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
    {
      code: 'pvc',
      label: 'PersistentVolumeClaims',
      targetResourceType: 'persistentvolumeclaims',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
  ],
  daemonsets: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  daemonset: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  jobs: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'job-name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  job: [
    {
      code: 'pods',
      label: 'Pods',
      targetResourceType: 'pods',
      filterType: 'label',
      labelKey: 'job-name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  cronjobs: [
    {
      code: 'jobs',
      label: 'Jobs',
      targetResourceType: 'jobs',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  cronjob: [
    {
      code: 'jobs',
      label: 'Jobs',
      targetResourceType: 'jobs',
      filterType: 'label',
      labelKey: 'app.kubernetes.io/name',
      displayLabel: 'for',
    },
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  configmaps: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  secrets: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  persistentvolumeclaims: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
  ingresses: [
    {
      code: 'events',
      label: 'Events',
      targetResourceType: 'events',
      filterType: 'spec',
      specPath: 'involvedObject.name',
      specKindPath: 'involvedObject.kind',
      displayLabel: 'for',
    },
  ],
}

/**
 * Get related resources for a given source resource type.
 */
export function getRelatedResources(resourceType: string): RelatedResource[] {
  const normalized = resourceType.toLowerCase()
  const resources = RELATED_RESOURCES[normalized] || []
  return [...resources].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Map Kubernetes resource type to its API kind name for field selectors.
 * This is needed because involvedObject.kind uses the Kind (singular, PascalCase).
 */
function resourceTypeToKind(resourceType: string): string {
  const normalized = resourceType.toLowerCase()
  const mapping: Record<string, string> = {
    deployments: 'Deployment',
    deployment: 'Deployment',
    rollouts: 'Rollout',
    rollout: 'Rollout',
    pods: 'Pod',
    pod: 'Pod',
    services: 'Service',
    service: 'Service',
    replicasets: 'ReplicaSet',
    replicaset: 'ReplicaSet',
    statefulsets: 'StatefulSet',
    statefulset: 'StatefulSet',
    daemonsets: 'DaemonSet',
    daemonset: 'DaemonSet',
    jobs: 'Job',
    job: 'Job',
    cronjobs: 'CronJob',
    cronjob: 'CronJob',
    configmaps: 'ConfigMap',
    configmap: 'ConfigMap',
    secrets: 'Secret',
    secret: 'Secret',
    persistentvolumeclaims: 'PersistentVolumeClaim',
    persistentvolumeclaim: 'PersistentVolumeClaim',
    ingresses: 'Ingress',
    ingress: 'Ingress',
    horizontalpodautoscalers: 'HorizontalPodAutoscaler',
    horizontalpodautoscaler: 'HorizontalPodAutoscaler',
    poddisruptionbudgets: 'PodDisruptionBudget',
    poddisruptionbudget: 'PodDisruptionBudget',
    endpoints: 'Endpoints',
    events: 'Event',
    event: 'Event',
  }
  return mapping[normalized] || resourceType
}

/**
 * Build filters for navigating to a related resource.
 * 
 * @param relation The related resource configuration
 * @param sourceResourceType The source resource type (for kind filtering)
 * @param sourceResourceName The name of the source resource
 * @param sourceLabels Labels from the source resource (for label-based filtering)
 * @returns Array of filters to apply to the target resource
 */
export function buildFiltersForRelation(
  relation: RelatedResource,
  sourceResourceType: string,
  sourceResourceName: string,
  sourceLabels: LabelSelector[],
  sourcePodSelector?: string
): ResourceFilter[] {
  const filters: ResourceFilter[] = []

  switch (relation.filterType) {
    case 'spec': {
      // Use spec filter with the resource name
      if (relation.specPath) {
        filters.push(createSpecFilter(relation.specPath, sourceResourceName, relation.displayLabel))
      }
      // Add kind filter if specified
      if (relation.specKindPath) {
        const kind = resourceTypeToKind(sourceResourceType)
        filters.push(createSpecFilter(relation.specKindPath, kind))
      }
      break
    }

    case 'label': {
      // Use label filter - find the label value from source labels
      if (relation.labelKey) {
        const label = sourceLabels.find(l => l.key === relation.labelKey)
        if (label) {
          filters.push(createLabelFilter(relation.labelKey, label.value))
        } else {
          // Fallback to app.kubernetes.io/name if the specified key isn't found
          const appLabel = sourceLabels.find(l => l.key === 'app.kubernetes.io/name')
            ?? sourceLabels.find(l => l.key === 'app')
          if (appLabel) {
            filters.push(createLabelFilter(appLabel.key, appLabel.value))
          } else if (sourcePodSelector) {
            // Final fallback: use the source's computed pod selector (e.g. Argo Rollouts)
            for (const pair of parseLabelSelectorString(sourcePodSelector)) {
              filters.push(createLabelFilter(pair.key, pair.value))
            }
          }
        }
      }
      break
    }

    case 'name': {
      // Filter by metadata.name (e.g., endpoints have same name as service)
      filters.push(createSpecFilter('metadata.name', sourceResourceName, relation.displayLabel))
      break
    }
  }

  return filters
}
