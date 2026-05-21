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

import { navigateToDashboard, waitForApp } from '../helpers/navigation'
import { pressKey } from '../helpers/keyboard'
import { byTitle, breadcrumb } from '../helpers/selectors'
import { SHORT_WAIT } from '../helpers/constants'

describe('Dashboard', () => {
  before(async () => {
    await waitForApp()
  })

  beforeEach(async () => {
    await navigateToDashboard()
  })

  it('navigate in group with keyboard', async () => {
    const nav = await breadcrumb()
    const navText = await nav.getText()
    expect(navText).toContain('Dashboard')

    const initialAttr = await browser.execute(() => {
      const el = document.activeElement as HTMLElement
      return { row: el?.dataset?.row, col: el?.dataset?.col, tag: el?.tagName }
    })
    expect(initialAttr.tag).toBe('BUTTON')

    const startRow = initialAttr.row
    const startCol = initialAttr.col

    await pressKey('ArrowDown')
    const afterDown = await browser.execute(() => {
      const el = document.activeElement as HTMLElement
      return { row: el?.dataset?.row, col: el?.dataset?.col }
    })
    expect(Number(afterDown.row)).toBeGreaterThan(Number(startRow))
    expect(afterDown.col).toBe(startCol)

    await pressKey('ArrowRight')
    const afterRight = await browser.execute(() => {
      const el = document.activeElement as HTMLElement
      return { row: el?.dataset?.row, col: el?.dataset?.col }
    })
    expect(Number(afterRight.col)).toBeGreaterThan(Number(afterDown.col))
  })

  it('navigate between groups', async () => {
    const getGroupName = () => browser.execute(() => {
      const el = document.activeElement as HTMLElement
      const section = el?.closest('section')
      const th = section?.querySelector('th')
      return th?.textContent?.trim() ?? ''
    })

    const initialGroup = await getGroupName()
    expect(initialGroup.length).toBeGreaterThan(0)

    await pressKey('Tab')
    await browser.pause(SHORT_WAIT)

    const nextGroup = await getGroupName()
    expect(nextGroup.length).toBeGreaterThan(0)
    expect(nextGroup).not.toBe(initialGroup)
  })

  it('filter namespaces', async () => {
    const searchbox = await $('[role="searchbox"]')
    await searchbox.click()
    await browser.pause(SHORT_WAIT)
    await searchbox.setValue('stellar-domains')
    await browser.pause(SHORT_WAIT)

    const domainsRow = await byTitle('ns-team-stellar-domains')
    await expect(domainsRow).toBeDisplayed()

    const opsRow = await byTitle('ns-team-stellar-operations')
    expect(await opsRow.isDisplayed().catch(() => false)).toBe(false)

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)

    const opsRowAfter = await byTitle('ns-team-stellar-operations')
    await expect(opsRowAfter).toBeDisplayed()
  })

  it('filter contexts', async () => {
    const searchbox = await $('[role="searchbox"]')
    await searchbox.click()
    await browser.pause(SHORT_WAIT)
    await searchbox.setValue('omicron')
    await browser.pause(SHORT_WAIT)

    const omicronCtx = await byTitle('live-omicron-nebula12-live-omicron')
    await expect(omicronCtx).toBeDisplayed()

    const kappaCtx = await byTitle('live-kappa-nebula237-live-kappa')
    expect(await kappaCtx.isDisplayed().catch(() => false)).toBe(false)

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)

    const kappaCtxAfter = await byTitle('live-kappa-nebula237-live-kappa')
    await expect(kappaCtxAfter).toBeDisplayed()
  })
})
