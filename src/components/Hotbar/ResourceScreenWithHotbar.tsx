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

// Layout for a resource screen paired with the hotbar sidebar. Owns the
// hotbar's derived props (labels, known contexts, add/save state) so App.tsx
// only has to wire the useHotbar controller.

import type { JSX } from 'preact'
import { useMemo } from 'preact/hooks'
import classes from './ResourceScreenWithHotbar.module.scss'
import { Hotbar } from './Hotbar.tsx'
import type { HotbarController } from './useHotbar.ts'
import type { NavigationNode } from '../../navigation/navigationTypes.ts'
import { isSameScreen } from '../../navigation/hotbarTypes.ts'
import type { DashboardConfig } from '../../pages/Dashboard/Dashboard.tsx'
import { getAllContexts, getNamespaceLabels } from '../../pages/Dashboard/configHelpers.ts'

interface ResourceScreenWithHotbarProps {
  /** The resource screen to render (list / detail / logs) */
  screen: JSX.Element
  /** Hotbar state + actions from useHotbar */
  hotbar: HotbarController
  /** The current navigation node (drives the add/save affordances) */
  currentNode: NavigationNode
  dashboardConfig: DashboardConfig
}

export function ResourceScreenWithHotbar({
  screen,
  hotbar,
  currentNode,
  dashboardConfig,
}: ResourceScreenWithHotbarProps) {
  // Config-derived values; recomputed only when the config changes
  const knownContexts = useMemo(() => getAllContexts(dashboardConfig), [dashboardConfig])
  const namespaceLabels = useMemo(() => getNamespaceLabels(dashboardConfig), [dashboardConfig])

  return (
    <div class={classes.resourceLayout}>
      <div class={classes.resourceScreen}>{screen}</div>
      <Hotbar
        entries={hotbar.entries}
        open={hotbar.open}
        onToggle={hotbar.toggle}
        onJump={hotbar.jump}
        onRemove={hotbar.remove}
        onRename={hotbar.rename}
        onAddCurrent={hotbar.addCurrent}
        canAddCurrent={currentNode.resourceType !== 'containers'}
        currentAlreadySaved={hotbar.entries.some(e => isSameScreen(e, currentNode))}
        namespaceLabels={namespaceLabels}
        knownContexts={knownContexts}
      />
    </div>
  )
}
