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
  selectFirstRow,
} from '../helpers/navigation'
import { byAriaLabel, byRole, buttonByText } from '../helpers/selectors'
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

function readOnlySwitch() {
  return byRole('switch')
}

async function isReadOnlyOn(): Promise<boolean> {
  return (await (await readOnlySwitch()).getAttribute('aria-checked')) === 'true'
}

/** Flip the read-only toggle to the desired state (no-op if already there). */
async function setReadOnly(on: boolean) {
  const sw = await readOnlySwitch()
  await sw.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
  if ((await isReadOnlyOn()) !== on) {
    await sw.click()
    await browser.pause(SHORT_WAIT)
  }
}

describe('Read-only toggle', () => {
  before(async () => {
    await waitForApp()
  })

  it('gates mutating actions based on the read-only toggle', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')
    // A selection is required for the action buttons (Delete, etc.) to appear
    await selectFirstRow()
    await openHotbar()

    const original = await isReadOnlyOn()

    // Read-only OFF: the Delete action is enabled
    await setReadOnly(false)
    const deleteBtn = await buttonByText('Delete')
    await deleteBtn.waitForExist({ timeout: DEFAULT_TIMEOUT })
    expect(await deleteBtn.isEnabled()).toBe(true)
    expect(await isReadOnlyOn()).toBe(false)

    // Read-only ON: the switch flips and Delete becomes disabled
    await setReadOnly(true)
    expect(await isReadOnlyOn()).toBe(true)
    expect(await (await buttonByText('Delete')).isEnabled()).toBe(false)

    // Read-only OFF again: Delete is enabled once more
    await setReadOnly(false)
    expect(await (await buttonByText('Delete')).isEnabled()).toBe(true)

    // Restore the original state so other specs are unaffected
    await setReadOnly(original)
  })
})
