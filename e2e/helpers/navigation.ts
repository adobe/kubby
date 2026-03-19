/**
 * Navigation helpers for e2e tests.
 * Each test is self-contained — these helpers bring the app to a known state.
 */
import { pressKey, pressAltC, pressAltN, pressAltR, arrowDown, pressCtrlR } from './keyboard'
import { breadcrumb, selectedRow, dialogElement } from './selectors'
import {
  SHORT_WAIT,
  LONG_WAIT,
  KEY_DELAY,
  DEFAULT_TIMEOUT,
  K8S_TIMEOUT,
  DEFAULT_CONTEXT,
  DEFAULT_NAMESPACE,
} from './constants'

export async function waitForApp() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const nav = await breadcrumb()
    const visible = await nav.isDisplayed().catch(() => false)
    if (visible) return
    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
  }
  const nav = await breadcrumb()
  await nav.waitForDisplayed()
}

export async function navigateToDashboard() {
  for (let i = 0; i < 10; i++) {
    const dashText = await $(`//nav[@aria-label="Navigation breadcrumb"]//button[text()="Dashboard"]`)
    const isDashboardActive = await dashText.isExisting()

    const dialog = await dialogElement()
    if (await dialog.isExisting()) {
      await pressKey('Escape')
      await browser.pause(SHORT_WAIT)
      continue
    }

    const separator = await $(`//nav[@aria-label="Navigation breadcrumb"]//span[contains(text(),"›")]`)
    if (isDashboardActive && !(await separator.isExisting())) {
      return
    }

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
  }
  throw new Error('Could not navigate back to Dashboard')
}

export async function navigateToResourceList(
  context = DEFAULT_CONTEXT,
  namespace = DEFAULT_NAMESPACE,
) {
  await navigateToDashboard()
  await browser.pause(SHORT_WAIT)

  const cell = await $(`button[data-context="${context}"][data-namespace="${namespace}"]`)
  await cell.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
  await cell.click()

  await waitForResourcesLoaded()
}

export async function waitForResourcesLoaded() {
  await browser.waitUntil(
    async () => {
      const footer = await $('[role="status"]')
      return footer.isDisplayed()
    },
    { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Resources did not load in time' },
  )
}

export async function waitForModalClosed(timeout = DEFAULT_TIMEOUT) {
  await browser.waitUntil(
    async () => {
      const dialog = await dialogElement()
      return !(await dialog.isExisting())
    },
    { timeout, timeoutMsg: 'Modal did not close in time' },
  )
}

export async function waitForModalOpen(titleText?: string) {
  await browser.waitUntil(
    async () => {
      const dialog = await dialogElement()
      if (!(await dialog.isDisplayed())) return false
      if (titleText) {
        const title = await $('#modal-title')
        const text = await title.getText()
        return text.includes(titleText)
      }
      return true
    },
    { timeout: DEFAULT_TIMEOUT, timeoutMsg: `Modal "${titleText ?? ''}" did not open in time` },
  )
}

export async function waitForModalReady() {
  await browser.waitUntil(
    async () => {
      const loading = await browser.execute(() =>
        document.querySelector('[role="dialog"]')?.textContent?.includes('Loading') ?? true,
      )
      return !loading
    },
    { timeout: K8S_TIMEOUT, timeoutMsg: 'Modal content did not finish loading' },
  )
}

async function blurActiveElement() {
  await browser.execute(() => {
    (document.activeElement as HTMLElement)?.blur()
  })
}

async function setComboboxValue(label: string, value: string) {
  const selector = `div[aria-label="${label}"] input`
  const containerSel = `div[aria-label="${label}"]`

  // Focus the input and select all text (scoped to this input only)
  await browser.execute((sel: string) => {
    const el = document.querySelector(sel) as HTMLInputElement
    if (el) {
      el.focus()
      el.select()
    }
  }, selector)
  await browser.pause(KEY_DELAY)

  // Delete selected text via real keyboard event (triggers proper Downshift state update)
  await browser.keys(['Backspace'])
  await browser.pause(SHORT_WAIT)

  // Type value character by character (opens the dropdown via real keyboard events)
  for (const char of value) {
    await browser.keys([char])
    await browser.pause(KEY_DELAY)
  }

  await browser.pause(SHORT_WAIT)

  // Click the matching dropdown item directly
  await browser.execute((cSel: string, val: string) => {
    const container = document.querySelector(cSel)
    const ul = container?.querySelector('ul')
    if (!ul) return { clicked: false, reason: 'no_ul' }
    const items = Array.from(ul.querySelectorAll('li'))
    const match = items.find(li => li.textContent?.trim().toLowerCase() === val.toLowerCase())
    if (match) {
      (match as HTMLElement).click()
      return { clicked: true, text: match.textContent }
    }
    const partial = items.find(li => li.textContent?.trim().toLowerCase().includes(val.toLowerCase()))
    if (partial) {
      (partial as HTMLElement).click()
      return { clicked: true, text: partial.textContent, partial: true }
    }
    return { clicked: false, reason: 'no_match', available: items.map(li => li.textContent?.substring(0, 30)) }
  }, containerSel, value)

  await browser.pause(SHORT_WAIT)
}

export async function ensureContext(context: string) {
  await pressAltC()
  await browser.pause(SHORT_WAIT)
  await setComboboxValue('Context', context)
  await waitForResourcesLoaded()
  await blurActiveElement()
}

export async function ensureNamespace(namespace: string) {
  await pressAltN()
  await browser.pause(SHORT_WAIT)
  await setComboboxValue('Namespace', namespace)
  await waitForResourcesLoaded()
  await blurActiveElement()
}

export async function ensureResourceType(resourceType: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const navBefore = await browser.execute(() =>
      document.querySelector('[aria-label="Navigation breadcrumb"]')?.textContent ?? '',
    )
    if (navBefore.toLowerCase().includes(resourceType.toLowerCase())) {
      await blurActiveElement()
      return
    }

    await pressAltR()
    await browser.pause(SHORT_WAIT)

    try {
      await setComboboxValue('Resource', resourceType)

      await browser.waitUntil(
        async () => {
          const navText = await browser.execute(() =>
            document.querySelector('[aria-label="Navigation breadcrumb"]')?.textContent ?? '',
          )
          return navText.toLowerCase().includes(resourceType.toLowerCase())
        },
        { timeout: DEFAULT_TIMEOUT, timeoutMsg: `Nav did not change to ${resourceType}` },
      )
      await waitForResourcesLoaded()
      await blurActiveElement()
      return
    } catch {
      await pressKey('Escape')
      await browser.pause(SHORT_WAIT)
    }
  }
  throw new Error(`Could not switch resource type to ${resourceType} after 3 attempts`)
}

export async function selectFirstRow() {
  await browser.execute(() => {
    (document.activeElement as HTMLElement)?.blur()
  })
  await browser.pause(KEY_DELAY)
  // Home always selects the first row (index 0), unlike ArrowDown which increments
  await pressKey('Home')
  await browser.pause(LONG_WAIT)
}

export async function getSelectedRowText(): Promise<string> {
  const row = await selectedRow()
  return row.getText()
}

export async function refreshAndWait() {
  await pressCtrlR()
  await browser.pause(SHORT_WAIT)
  await waitForResourcesLoaded()
}

export async function waitForNoAlert() {
  await browser.pause(SHORT_WAIT)
  const alerts = await $$('[role="alert"]')
  for (const alert of alerts) {
    const text = await alert.getText()
    if (text.toLowerCase().includes('error')) {
      throw new Error(`Unexpected error alert: ${text}`)
    }
  }
}

export async function waitForTextInPage(text: string, timeout = DEFAULT_TIMEOUT) {
  await browser.waitUntil(
    async () => {
      const el = await $(`//*[contains(text(),"${text}")]`)
      return el.isDisplayed()
    },
    { timeout, timeoutMsg: `Text "${text}" not found in page` },
  )
}

export async function waitForTextGone(text: string, timeout = K8S_TIMEOUT) {
  await browser.waitUntil(
    async () => {
      const el = await $(`//*[text()="${text}"]`)
      return !(await el.isExisting())
    },
    { timeout, timeoutMsg: `Text "${text}" still present after timeout` },
  )
}

export { DEFAULT_CONTEXT, DEFAULT_NAMESPACE } from './constants'
