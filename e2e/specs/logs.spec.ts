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

  // #region agent log
  const preLog = await browser.execute(() => ({
    selectedIdx: document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-testid') ?? 'NONE',
    activeTag: document.activeElement?.tagName ?? 'NONE',
    navText: document.querySelector('[aria-label="Navigation breadcrumb"]')?.textContent ?? 'NONE',
  }))
  fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'logs.spec.ts:navigateToLogs',message:'before pressKey(l)',data:preLog,timestamp:Date.now(),hypothesisId:'H5_LOGS'})}).catch(()=>{});
  // #endregion

  await pressKey('l')
  await browser.pause(LONG_WAIT)

  // #region agent log
  const postLog = await browser.execute(() => ({
    bodySnippet: document.body?.textContent?.substring(0, 200) ?? 'NO_BODY',
    navText: document.querySelector('[aria-label="Navigation breadcrumb"]')?.textContent ?? 'NONE',
    hasLogViewer: !!document.querySelector('[class*="LogViewer"]'),
  }))
  fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'logs.spec.ts:navigateToLogs',message:'after pressKey(l)',data:postLog,timestamp:Date.now(),hypothesisId:'H5_LOGS'})}).catch(()=>{});
  // #endregion
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
