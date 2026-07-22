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

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  navigateToResourceList,
  waitForApp,
  selectFirstRow,
  waitForNoAlert,
  ensureResourceType,
} from '../helpers/navigation'
import { pressKey } from '../helpers/keyboard'
import { byText } from '../helpers/selectors'
import {
  DEFAULT_CONTEXT,
  DEFAULT_NAMESPACE,
  SHORT_WAIT,
  LONG_WAIT,
  DEFAULT_TIMEOUT,
  K8S_TIMEOUT,
} from '../helpers/constants'

const downloadsDir = path.join(os.homedir(), 'Downloads')

/** Snapshot of the .log files currently in ~/Downloads. */
function listLogFiles(): Set<string> {
  try {
    return new Set(fs.readdirSync(downloadsDir).filter((f) => f.endsWith('.log')))
  } catch {
    return new Set()
  }
}

/** Delete any .log files in ~/Downloads that are not in the `before` snapshot. */
function cleanupNewLogFiles(before: Set<string>) {
  for (const f of listLogFiles()) {
    if (!before.has(f)) {
      try {
        fs.unlinkSync(path.join(downloadsDir, f))
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/** Wait until the log viewer has streamed at least one line. */
async function waitForLogLines() {
  await browser.waitUntil(
    async () => {
      const text = await browser.execute(
        () => document.querySelector('[class*="lineCount"]')?.textContent ?? '',
      )
      const match = text.match(/(\d+)/)
      return match !== null && Number(match[1]) > 0
    },
    { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Log lines did not appear' },
  )
}

async function navigateToLogs() {
  await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

  await ensureResourceType('pods')

  await selectFirstRow()

  await pressKey('l')
  await browser.pause(LONG_WAIT)
}

describe('LogViewer', () => {
  before(async () => {
    await waitForApp()
  })

  it('open logs', async () => {
    await navigateToLogs()

    const logLabel = await byText('logs')
    await expect(logLabel).toBeDisplayed()

    await browser.waitUntil(
      async () => {
        const streaming = await $(`//*[contains(text(),"Streaming")]`)
        return streaming.isDisplayed()
      },
      { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Streaming indicator did not appear' },
    )

    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const el = document.querySelector('[class*="lineCount"]')
          return el?.textContent ?? ''
        })
        const match = text.match(/(\d+)/)
        return match !== null && Number(match[1]) > 0
      },
      { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Log lines did not appear' },
    )
  })

  it('filter by "sess"', async () => {
    await navigateToLogs()

    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const el = document.querySelector('[class*="lineCount"]')
          return el?.textContent ?? ''
        })
        const match = text.match(/(\d+)/)
        return match !== null && Number(match[1]) > 0
      },
      { timeout: DEFAULT_TIMEOUT },
    )

    const linesBefore = await browser.execute(() =>
      document.querySelector('[class*="lineCount"]')?.textContent ?? '',
    )

    await pressKey('/')
    await browser.pause(SHORT_WAIT)
    const search = await $('[role="searchbox"]')
    await search.setValue('sess')
    await browser.pause(LONG_WAIT)

    const linesAfter = await browser.execute(() =>
      document.querySelector('[class*="lineCount"]')?.textContent ?? '',
    )
    expect(linesAfter).not.toBe(linesBefore)
  })

  it('copy', async () => {
    await navigateToLogs()

    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const el = document.querySelector('[class*="lineCount"]')
          return el?.textContent ?? ''
        })
        const match = text.match(/(\d+)/)
        return match !== null && Number(match[1]) > 0
      },
      { timeout: DEFAULT_TIMEOUT },
    )

    await pressKey('c')
    await browser.pause(SHORT_WAIT)

    await waitForNoAlert()
  })

  it('download menu opens with both options and the previous-container checkbox', async () => {
    await navigateToLogs()
    await waitForLogLines()

    await pressKey('d')
    await browser.pause(SHORT_WAIT)

    const menu = await $('[role="dialog"][aria-label="Download logs"]')
    await expect(menu).toBeDisplayed()
    await expect(await $('button*=All logs')).toBeDisplayed()
    await expect(await $('button*=Visible logs')).toBeDisplayed()
    await expect(await $('[aria-label="Show logs from previous terminated container"]')).toExist()

    // Esc closes the menu but stays in the log viewer
    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
    await expect(menu).not.toBeDisplayed()
    await expect(await byText('logs')).toBeDisplayed()
  })

  it('download menu: "P" toggles the previous-container checkbox', async () => {
    await navigateToLogs()
    await waitForLogLines()

    await pressKey('d')
    await browser.pause(SHORT_WAIT)

    const checkbox = await $('[aria-label="Show logs from previous terminated container"]')
    expect(await checkbox.isSelected()).toBe(false)

    await pressKey('p')
    await browser.pause(SHORT_WAIT)
    expect(await checkbox.isSelected()).toBe(true)

    await pressKey('p')
    await browser.pause(SHORT_WAIT)
    expect(await checkbox.isSelected()).toBe(false)

    await pressKey('Escape')
  })

  it('download menu: "V" saves the visible logs to a file', async () => {
    await navigateToLogs()
    await waitForLogLines()

    const before = listLogFiles()

    await pressKey('d')
    await browser.pause(SHORT_WAIT)
    await pressKey('v')

    await browser.waitUntil(
      async () => (await $('//*[contains(text(),"Downloaded to")]')).isExisting(),
      { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Download confirmation did not appear' },
    )

    cleanupNewLogFiles(before)
  })

  it('download menu: "A" fetches and saves all logs from the cluster', async () => {
    await navigateToLogs()
    await waitForLogLines()

    const before = listLogFiles()

    await pressKey('d')
    await browser.pause(SHORT_WAIT)
    await pressKey('a')

    await browser.waitUntil(
      async () => (await $('//*[contains(text(),"Downloaded to")]')).isExisting(),
      { timeout: K8S_TIMEOUT, timeoutMsg: 'Download confirmation did not appear' },
    )

    cleanupNewLogFiles(before)
  })
})
