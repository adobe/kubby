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

import {
  navigateToResourceList,
  waitForApp,
  ensureResourceType,
} from '../helpers/navigation'
import { pressAltH } from '../helpers/keyboard'
import { byAriaLabel, buttonByText, byTitleContaining, breadcrumb } from '../helpers/selectors'
import { DEFAULT_CONTEXT, DEFAULT_NAMESPACE, SHORT_WAIT, DEFAULT_TIMEOUT } from '../helpers/constants'

/** The collapse button only exists when the panel is expanded. */
async function isHotbarOpen(): Promise<boolean> {
  const hide = await byAriaLabel('Hide hotbar')
  return hide.isExisting()
}

async function openHotbar() {
  if (await isHotbarOpen()) return
  const show = await byAriaLabel('Show hotbar')
  await show.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
  await show.click()
  await (await byAriaLabel('Hide hotbar')).waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
}

async function waitForBreadcrumb(resourceType: string) {
  await browser.waitUntil(
    async () => (await (await breadcrumb()).getText()).toLowerCase().includes(resourceType),
    { timeout: DEFAULT_TIMEOUT, timeoutMsg: `Breadcrumb did not show ${resourceType}` },
  )
}

describe('Hotbar', () => {
  before(async () => {
    await waitForApp()
  })

  it('saves the current screen as a slot and jumps back to it', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('pods')
    await openHotbar()

    // Save the current screen (skipped if a previous run already saved it)
    const addButton = await buttonByText('Add current screen')
    if (await addButton.isExisting()) {
      await addButton.click()
      await browser.pause(SHORT_WAIT)
    }

    // A slot that jumps to pods in the current context/namespace should exist
    const slot = await byTitleContaining(`Jump to pods in ${DEFAULT_CONTEXT}`)
    await slot.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })

    // Move to a different resource type, then jump back to pods via the slot
    await ensureResourceType('deployments')
    await waitForBreadcrumb('deployments')

    await (await byTitleContaining(`Jump to pods in ${DEFAULT_CONTEXT}`)).click()
    await waitForBreadcrumb('pods')

    // Cleanup: remove the slot so the test stays self-contained
    await slot.moveTo()
    const removeBtn = await byAriaLabel('Remove pods')
    if (await removeBtn.isExisting()) {
      await removeBtn.click()
      await browser.pause(SHORT_WAIT)
    }
    expect(await (await byTitleContaining(`Jump to pods in ${DEFAULT_CONTEXT}`)).isExisting()).toBe(false)
  })

  it('toggles open and closed with Opt+H', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await openHotbar()
    expect(await isHotbarOpen()).toBe(true)

    await pressAltH()
    await browser.pause(SHORT_WAIT)
    expect(await isHotbarOpen()).toBe(false)

    await pressAltH()
    await browser.pause(SHORT_WAIT)
    expect(await isHotbarOpen()).toBe(true)
  })
})
