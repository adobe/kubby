import fs from 'node:fs'
import {
  navigateToResourceList,
  waitForApp,
  waitForResourcesLoaded,
  waitForModalClosed,
  waitForModalOpen,
  waitForModalReady,
  ensureContext,
  ensureNamespace,
  ensureResourceType,
  selectFirstRow,
  refreshAndWait,
  waitForNoAlert,
} from '../helpers/navigation'
import { pressKey, arrowDown, arrowUp, pressCtrlR } from '../helpers/keyboard'
import { breadcrumb, byText, selectedRow, byAriaLabel, buttonByText } from '../helpers/selectors'
import {
  DEFAULT_CONTEXT,
  DEFAULT_NAMESPACE,
  TEST_DEPLOYMENT,
  SHORT_WAIT,
  LONG_WAIT,
  K8S_TIMEOUT,
  POLL_INTERVAL, ALT_CONTEXT, ALT_NAMESPACE,
} from '../helpers/constants'

describe('ResourceList', () => {
  before(async () => {
    await waitForApp()
  })

  it('navigate with keyboard in items', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    await arrowDown(1)
    await browser.pause(SHORT_WAIT)

    const row1 = await selectedRow()
    const text1 = await row1.getText()
    expect(text1.length).toBeGreaterThan(0)

    await arrowDown(2)
    await browser.pause(SHORT_WAIT)
    const row3 = await selectedRow()
    const text3 = await row3.getText()
    expect(text3).not.toBe(text1)

    await arrowUp(1)
    await browser.pause(SHORT_WAIT)
    const row2 = await selectedRow()
    const text2 = await row2.getText()
    expect(text2).not.toBe(text3)

    expect(text1).not.toBe(text2)
  })

  it('refresh', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    const itemCountEl = await $('[role="status"]')
    const countBefore = await itemCountEl.getText()

    await pressCtrlR()
    await browser.pause(LONG_WAIT)
    await waitForResourcesLoaded()

    const countAfter = await $('[role="status"]').then(el => el.getText())
    expect(countAfter).toBe(countBefore)
  })

  it('switch context', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureContext(ALT_CONTEXT)
    const footer = await $('[role="status"]')
    await expect(footer).toBeDisplayed()
  })

  it('switch namespace', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureNamespace(ALT_NAMESPACE)
    const footer = await $('[role="status"]')
    await expect(footer).toBeDisplayed()
  })

  it('switch resource type to httpproxies and back', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    await ensureResourceType('httpproxies')
    await waitForResourcesLoaded()

    const nav = await breadcrumb()
    const navText = await nav.getText()
    expect(navText.toLowerCase()).toContain('httpprox')

    await ensureResourceType('deployments')
    await waitForResourcesLoaded()

    const navAfter = await breadcrumb()
    const navTextAfter = await navAfter.getText()
    expect(navTextAfter.toLowerCase()).toContain('deployment')
  })

  it('drill down: deployments -> pods -> containers -> back', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')

    await selectFirstRow()
    await pressKey('Enter')
    await waitForResourcesLoaded()

    const nav1 = await breadcrumb()
    const text1 = await nav1.getText()
    expect(text1.toLowerCase()).toContain('pods')

    await selectFirstRow()
    await pressKey('Enter')
    await waitForResourcesLoaded()

    const nav2 = await breadcrumb()
    const text2 = await nav2.getText()
    expect(text2.toLowerCase()).toContain('containers')

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
    await waitForResourcesLoaded()

    const nav3 = await breadcrumb()
    const text3 = await nav3.getText()
    expect(text3.toLowerCase()).toContain('pods')

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
    await waitForResourcesLoaded()

    const nav4 = await breadcrumb()
    const text4 = await nav4.getText()
    expect(text4.toLowerCase()).toContain('deployment')
  })

  it('rolling restart', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')

    await pressKey('/')
    await browser.pause(SHORT_WAIT)
    const search = await $('[role="searchbox"]')
    await search.setValue(TEST_DEPLOYMENT)
    await pressKey('Enter')
    await browser.pause(SHORT_WAIT)

    // Capture pod names before restart
    await pressKey('Enter')
    await waitForResourcesLoaded()
    const podsBefore = await $$('[role="grid"] tbody tr').then(
      async rows => {
        const names: string[] = []
        for (const r of rows.slice(0, 5)) {
          names.push(await r.getText())
        }
        return names
      }
    )
    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
    await waitForResourcesLoaded()

    await pressKey('/')
    await browser.pause(SHORT_WAIT)
    const search2 = await $('[role="searchbox"]')
    await search2.setValue(TEST_DEPLOYMENT)
    await pressKey('Enter')
    await browser.pause(SHORT_WAIT)

    await selectFirstRow()
    await pressKey('r')
    await waitForModalOpen('Rolling Restart')
    await waitForModalReady()

    await pressKey('Enter')
    await waitForModalClosed(K8S_TIMEOUT)
    await waitForNoAlert()

    // Verify: drill into pods and wait for at least one pod name to change
    await pressKey('Enter')
    await waitForResourcesLoaded()

    await browser.waitUntil(
      async () => {
        await refreshAndWait()
        const rows = await $$('[role="grid"] tbody tr')
        for (const r of rows.slice(0, 5)) {
          const text = await r.getText()
          const isNew = !podsBefore.some(old => text.startsWith(old.split('\t')[0]?.trim()))
          if (isNew) return true
        }
        return false
      },
      { timeout: K8S_TIMEOUT, interval: POLL_INTERVAL, timeoutMsg: 'Pod names did not change after rolling restart' },
    )

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
  })

  it('scale: increase replicas by 1', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')

    await pressKey('/')
    await browser.pause(SHORT_WAIT)
    const search = await $('[role="searchbox"]')
    await search.setValue(TEST_DEPLOYMENT)
    await pressKey('Enter')
    await browser.pause(SHORT_WAIT)

    await selectFirstRow()
    await pressKey('s')
    await waitForModalOpen('Scale Deployment')
    await waitForModalReady()

    const currentValue = await browser.execute(() => {
      const el = document.querySelector('[aria-label="Replicas"]') as HTMLInputElement
      return el?.value ?? '0'
    })
    const newValue = String(Number(currentValue) + 1)

    await browser.execute((val: string) => {
      const el = document.querySelector('[aria-label="Replicas"]') as HTMLInputElement
      if (!el) return
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, newValue)
    await browser.pause(SHORT_WAIT)

    // #region agent log
    const scaleState = await browser.execute(() => {
      const el = document.querySelector('[aria-label="Replicas"]') as HTMLInputElement
      const dialog = document.querySelector('[role="dialog"]')
      return {
        inputValue: el?.value ?? 'NONE',
        hasErrors: !!dialog?.querySelector('[class*="errorText"]'),
        dialogText: dialog?.textContent?.substring(0, 200) ?? 'NO_DIALOG',
      }
    })
    fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'resource-list.spec.ts:scale',message:'before Enter',data:scaleState,timestamp:Date.now(),hypothesisId:'H6_SCALE'})}).catch(()=>{});
    // #endregion

    await pressKey('Enter')
    await waitForModalClosed(K8S_TIMEOUT)
    await waitForNoAlert()

    await browser.waitUntil(
      async () => {
        await refreshAndWait()
        const row = await selectedRow()
        const text = await row.getText()
        return text.includes(`${newValue}/${newValue}`)
      },
      { timeout: K8S_TIMEOUT, interval: POLL_INTERVAL, timeoutMsg: `READY column did not show ${newValue}/${newValue}` },
    )
  })

  it('jump to events, back', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')
    await selectFirstRow()

    await pressKey('j')
    await browser.pause(SHORT_WAIT)

    const eventsItem = await $('[role="menuitem"]*=events')
    if (await eventsItem.isExisting()) {
      await eventsItem.click()
    } else {
      await pressKey('e')
    }
    await browser.pause(SHORT_WAIT)
    await waitForResourcesLoaded()

    const nav = await breadcrumb()
    const text = await nav.getText()
    expect(text.toLowerCase()).toContain('events')

    await pressKey('Escape')
    await browser.pause(SHORT_WAIT)
    await waitForResourcesLoaded()

    const nav2 = await breadcrumb()
    const text2 = await nav2.getText()
    expect(text2.toLowerCase()).toContain('deployment')
  })

  it('delete pod with force', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('pods')
    await selectFirstRow()

    const row = await selectedRow()
    const rowText = await row.getText()
    const podName = rowText.split(/\s+/)[0]

    // #region agent log
    const preDelete = await browser.execute(() => ({
      selectedIdx: document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-testid') ?? 'NONE',
      activeTag: document.activeElement?.tagName ?? 'NONE',
      resourceType: document.querySelector('[aria-label="Navigation breadcrumb"]')?.textContent ?? 'NONE',
    }))
    fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'resource-list.spec.ts:delete-pod',message:'before pressKey(Delete)',data:preDelete,timestamp:Date.now(),hypothesisId:'H4_DELETE'})}).catch(()=>{});
    // #endregion

    // Capture what key event WebKit produces for Delete
    await browser.execute(() => {
      const listener = (e: KeyboardEvent) => {
        const marker = document.createElement('div')
        marker.id = 'debug-delete-key'
        marker.dataset.key = e.key
        marker.dataset.code = e.code
        marker.dataset.keyCode = String(e.keyCode)
        document.body.appendChild(marker)
        document.removeEventListener('keydown', listener)
      }
      document.addEventListener('keydown', listener)
    })
    await pressKey('Delete')
    await browser.pause(SHORT_WAIT)

    // #region agent log
    const keyInfo = await browser.execute(() => {
      const marker = document.getElementById('debug-delete-key')
      if (!marker) return { found: false }
      const result = { found: true, key: marker.dataset.key, code: marker.dataset.code, keyCode: marker.dataset.keyCode }
      marker.remove()
      return result
    })
    fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'resource-list.spec.ts:delete-pod',message:'Delete key event info',data:keyInfo,timestamp:Date.now(),hypothesisId:'H4_DELETE'})}).catch(()=>{});
    // #endregion

    await waitForModalOpen('Delete Resource')

    const forceCheckbox = await byAriaLabel('Force delete')
    await forceCheckbox.click()

    await pressKey('Enter')
    await waitForModalClosed()
    await waitForNoAlert()

    await browser.waitUntil(
      async () => {
        await refreshAndWait()
        const el = await $(`//*[text()="${podName}"]`)
        return !(await el.isExisting())
      },
      { timeout: K8S_TIMEOUT, interval: POLL_INTERVAL, timeoutMsg: `Pod "${podName}" was not deleted` },
    )

    const footer = await $('[role="status"]')
    await expect(footer).toBeDisplayed()
  })

  it('port forward: add and stop', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('pods')

    await selectFirstRow()
    await pressKey('Enter')
    await waitForResourcesLoaded()

    await selectFirstRow()
    await pressKey('f')
    await waitForModalOpen('Port Forward')

    await browser.waitUntil(
      async () => {
        const loading = await browser.execute(() =>
          document.querySelector('[role="dialog"]')?.textContent?.includes('Loading') ?? true,
        )
        return !loading
      },
      { timeout: K8S_TIMEOUT, timeoutMsg: 'Port information did not finish loading' },
    )

    // #region agent log
    const modalInfo = await browser.execute(() => ({
      checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
      checkedCheckboxes: document.querySelectorAll('input[type="checkbox"]:checked').length,
      modalText: document.querySelector('[role="dialog"]')?.textContent?.substring(0, 300) ?? 'NO_DIALOG',
    }))
    fetch('http://127.0.0.1:7243/ingest/e58d2dda-67da-48f2-ba95-bd3d36d6253b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c6c2c7'},body:JSON.stringify({sessionId:'c6c2c7',location:'resource-list.spec.ts:port-forward',message:'port forward modal state',data:modalInfo,timestamp:Date.now(),hypothesisId:'H5_portfwd'})}).catch(()=>{});
    // #endregion

    const checkbox = await $('input[type="checkbox"]:checked')
    expect(await checkbox.isExisting()).toBe(true)

    await pressKey('Enter')
    await waitForModalClosed()
    await browser.pause(LONG_WAIT)

    await pressKey('f')
    await waitForModalOpen('Port Forward')

    const existingSection = await byText('Existing Port Forwards')
    await expect(existingSection).toBeDisplayed()

    const stopBtn = await buttonByText('Stop All')
    await expect(stopBtn).toBeDisplayed()

    await stopBtn.click()
    await browser.pause(LONG_WAIT)

    const existingAfter = await $(`//*[text()="Existing Port Forwards"]`)
    expect(await existingAfter.isExisting()).toBe(false)

    await pressKey('Escape')
    await waitForModalClosed()
  })

  it('open shell', async () => {
    const marker = '/tmp/kubby-e2e-shell'
    if (fs.existsSync(marker)) fs.unlinkSync(marker)

    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('pods')

    await selectFirstRow()
    await pressKey('Enter')
    await waitForResourcesLoaded()

    await selectFirstRow()
    await pressKey('s')
    await browser.pause(LONG_WAIT)

    await waitForNoAlert()
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('open agent', async () => {
    const marker = '/tmp/kubby-e2e-ai'
    if (fs.existsSync(marker)) fs.unlinkSync(marker)

    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')
    await selectFirstRow()

    await pressKey('a')
    await browser.pause(LONG_WAIT)

    await waitForNoAlert()
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('open edit', async () => {
    const marker = '/tmp/kubby-e2e-editor'
    if (fs.existsSync(marker)) fs.unlinkSync(marker)

    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)
    await ensureResourceType('deployments')
    await selectFirstRow()

    await pressKey('e')
    await browser.pause(LONG_WAIT)

    await waitForNoAlert()
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('go back to dashboard', async () => {
    await navigateToResourceList(DEFAULT_CONTEXT, DEFAULT_NAMESPACE)

    const dashBtn = await $(`//nav[@aria-label="Navigation breadcrumb"]//button[text()="Dashboard"]`)
    await dashBtn.click()
    await browser.pause(SHORT_WAIT)

    const separator = await $(`//nav[@aria-label="Navigation breadcrumb"]//span[contains(text(),"›")]`)
    expect(await separator.isExisting()).toBe(false)
  })
})
