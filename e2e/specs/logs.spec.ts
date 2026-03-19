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
} from '../helpers/constants'

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
})
