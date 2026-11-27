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
  waitForResourcesLoaded,
} from '../helpers/navigation'
import { pressAltR, pressKey } from '../helpers/keyboard'
import { breadcrumb } from '../helpers/selectors'
import {
  DEFAULT_CONTEXT,
  DEFAULT_NAMESPACE,
  SHORT_WAIT,
  KEY_DELAY,
} from '../helpers/constants'

const RESOURCE_SELECTOR = 'div[aria-label="Resource"]'
const USAGE_STORAGE_KEY = 'kubby-resource-type-usage'

/** Open the resource-type selector and type `text` into it (clearing first). */
async function typeInResourceSelector(text: string) {
  await pressAltR()
  await browser.pause(SHORT_WAIT)
  // Focus and clear the resource combobox input
  await browser.execute((sel: string) => {
    const el = document.querySelector(`${sel} input`) as HTMLInputElement | null
    if (el) {
      el.focus()
      el.select()
    }
  }, RESOURCE_SELECTOR)
  await browser.pause(KEY_DELAY)
  await browser.keys(['Backspace'])
  await browser.pause(SHORT_WAIT)
  for (const ch of text) {
    await browser.keys([ch])
    await browser.pause(KEY_DELAY)
  }
  await browser.pause(SHORT_WAIT)
}

/** Lower-cased text of every item currently shown in the resource dropdown. */
async function resourceMenuTexts(): Promise<string[]> {
  return browser.execute((sel: string) => {
    const ul = document.querySelector(`${sel} ul`)
    if (!ul) return [] as string[]
    return Array.from(ul.querySelectorAll('li')).map(
      (li) => (li.textContent ?? '').trim().toLowerCase(),
    )
  }, RESOURCE_SELECTOR)
}

/** Click the dropdown item whose text contains `match`. */
async function clickResourceMenuItem(match: string) {
  await browser.execute(
    (sel: string, m: string) => {
      const ul = document.querySelector(`${sel} ul`)
      const li = Array.from(ul?.querySelectorAll('li') ?? []).find((l) =>
        (l.textContent ?? '').toLowerCase().includes(m),
      )
      ;(li as HTMLElement | undefined)?.click()
    },
    RESOURCE_SELECTOR,
    match.toLowerCase(),
  )
}

describe('Resource search', () => {
  before(async () => {
    await waitForApp()
  })

  it('surfaces horizontalpodautoscalers when typing the "hpa" alias', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    await typeInResourceSelector('hpa')

    const texts = await resourceMenuTexts()
    const hpaItem = texts.find((t) => t.includes('horizontalpodautoscalers'))
    expect(hpaItem).toBeDefined()
    // The alias hint is rendered next to the type name ("hpa" is not a substring
    // of "horizontalpodautoscalers", so its presence proves the hint is shown).
    expect(hpaItem).toContain('hpa')

    await pressKey('Escape')
  })

  it('surfaces the right resource type for common short-name aliases', async () => {
    const cases: Array<[string, string]> = [
      ['svc', 'services'],
      ['cm', 'configmaps'],
      ['sa', 'serviceaccounts'],
    ]

    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    for (const [alias, type] of cases) {
      await typeInResourceSelector(alias)
      const texts = await resourceMenuTexts()
      expect(texts.some((t) => t.includes(type))).toBe(true)
      await pressKey('Escape')
      await browser.pause(SHORT_WAIT)
    }
  })

  it('navigates to a resource type selected by its alias', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    await typeInResourceSelector('svc')
    await clickResourceMenuItem('services')
    await waitForResourcesLoaded()

    const nav = await breadcrumb()
    expect((await nav.getText()).toLowerCase()).toContain('services')
  })

  it('ranks a recently-used resource type first', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    // Reset usage counts so ranking is deterministic for this test
    await browser.execute((key: string) => {
      localStorage.setItem(key, JSON.stringify({}))
    }, USAGE_STORAGE_KEY)

    // Use an alphabetically-late type via its alias, so ranking it first can
    // only come from usage (not alphabetical order)
    await typeInResourceSelector('sc')
    await clickResourceMenuItem('storageclasses')
    await waitForResourcesLoaded()

    // Reopen with an empty query — the just-used type should now rank first
    await typeInResourceSelector('')
    const texts = await resourceMenuTexts()
    expect(texts[0]).toContain('storageclasses')

    await pressKey('Escape')
  })
})
