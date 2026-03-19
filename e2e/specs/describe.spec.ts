import {
  navigateToResourceList,
  waitForApp,
  waitForNoAlert,
  waitForTextInPage,
  ensureResourceType,
} from '../helpers/navigation'
import { pressKey } from '../helpers/keyboard'
import { byText } from '../helpers/selectors'
import {
  DEFAULT_CONTEXT,
  DEFAULT_NAMESPACE,
  TEST_DEPLOYMENT,
  SHORT_WAIT,
  LONG_WAIT,
  DEFAULT_TIMEOUT,
} from '../helpers/constants'

async function navigateToDescribe(resourceType = 'deployments', resourceName = TEST_DEPLOYMENT) {
  await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

  if (resourceType !== 'deployments') {
    await ensureResourceType(resourceType)
  }

  await pressKey('/')
  await browser.pause(SHORT_WAIT)
  const search = await $('[role="searchbox"]')
  await search.setValue(resourceName)
  await pressKey('Enter')
  await browser.pause(SHORT_WAIT)

  await browser.execute(() => { (document.activeElement as HTMLElement)?.blur() })
  await pressKey('d')
  await browser.pause(LONG_WAIT)

  await waitForTextInPage(resourceName)
}

describe('Describe / Detail', () => {
  before(async () => {
    await waitForApp()
  })

  it('open describe', async () => {
    await navigateToDescribe()

    const nameEl = await byText(TEST_DEPLOYMENT)
    await expect(nameEl).toBeDisplayed()

    const treeTab = await $(`//button[@role="tab" and @aria-selected="true" and contains(.,"Tree")]`)
    await expect(treeTab).toBeDisplayed()
  })

  it('filter in describe', async () => {
    await navigateToDescribe()

    await pressKey('/')
    await browser.pause(SHORT_WAIT)

    const highlightInput = await $('[role="searchbox"]')
    await highlightInput.setValue('replicas')
    await browser.pause(SHORT_WAIT)

    const matches = await $$('[data-highlight-match="true"]')
    expect(matches.length).toBeGreaterThan(0)

    const countText = await browser.execute(() => {
      const spans = document.querySelectorAll('span')
      for (const span of spans) {
        const text = span.textContent?.trim() ?? ''
        if (/^\d+\/\d+$/.test(text)) return text
      }
      return ''
    })
    expect(countText).toMatch(/\d+\/\d+/)

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
  })

  it('view YAML', async () => {
    await navigateToDescribe()

    await pressKey('y')
    await browser.pause(SHORT_WAIT)

    const yamlTab = await $(`//button[@role="tab" and @aria-selected="true" and contains(.,"Yaml")]`)
    await expect(yamlTab).toBeDisplayed()

    const apiVersion = await byText('apiVersion')
    await expect(apiVersion).toBeDisplayed()
  })

  it('view JSON', async () => {
    await navigateToDescribe()

    await pressKey('j')
    await browser.pause(SHORT_WAIT)

    const jsonTab = await $(`//button[@role="tab" and @aria-selected="true" and contains(.,"Json")]`)
    await expect(jsonTab).toBeDisplayed()

    const hasJsonContent = await browser.execute(() => {
      const body = document.body.textContent ?? ''
      return body.includes('"apiVersion"') || body.includes('apiVersion')
    })
    expect(hasJsonContent).toBe(true)
  })

  it('copy', async () => {
    await navigateToDescribe()

    await pressKey('y')
    await browser.pause(SHORT_WAIT)

    await pressKey('c')
    await browser.pause(SHORT_WAIT)

    await waitForNoAlert()
  })

  it('open edit, close', async () => {
    await navigateToDescribe()

    await pressKey('e')
    await browser.pause(LONG_WAIT)

    await waitForNoAlert()
  })

  it('secrets decode', async () => {
    // Use navigateToDescribe which has the proven blur+pressKey('d') flow
    await navigateToDescribe('secrets', 'domains-api-service-secrets')

    await browser.waitUntil(
      async () => browser.execute(() => /\[\d+ chars\]/.test(document.body.textContent ?? '')),
      { timeout: DEFAULT_TIMEOUT, timeoutMsg: 'Secret [N chars] markers did not appear' },
    )

    await pressKey('x')
    await browser.pause(LONG_WAIT)

    const hasDecodedMarker = await browser.execute(() => {
      const body = document.body.textContent ?? ''
      return /\[\d+ chars\]/.test(body)
    })
    expect(hasDecodedMarker).toBe(false)
  })
})
