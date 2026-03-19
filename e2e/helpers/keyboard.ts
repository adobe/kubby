/**
 * Keyboard interaction helpers for e2e tests.
 * Wraps WebdriverIO key actions with convenient utilities.
 */
import { KEY_DELAY } from './constants'

const isMac = process.platform === 'darwin'

export const MOD_KEY = isMac ? 'Meta' : 'Control'
export const ALT_KEY = 'Alt'

export async function pressKey(key: string) {
  await browser.keys([key])
}

export async function pressKeys(keys: string[]) {
  for (const key of keys) {
    await browser.keys([key])
    await browser.pause(KEY_DELAY)
  }
}

export async function pressModKey(modifier: string, key: string) {
  await browser.keys([modifier, key])
}

export async function pressCtrlR() {
  await pressModKey(MOD_KEY, 'r')
}

export async function pressAltC() {
  await pressModKey(ALT_KEY, 'c')
}

export async function pressAltN() {
  await pressModKey(ALT_KEY, 'n')
}

export async function pressAltR() {
  await pressModKey(ALT_KEY, 'r')
}

export async function arrowDown(times = 1) {
  for (let i = 0; i < times; i++) {
    await pressKey('ArrowDown')
    await browser.pause(KEY_DELAY)
  }
}

export async function arrowUp(times = 1) {
  for (let i = 0; i < times; i++) {
    await pressKey('ArrowUp')
    await browser.pause(KEY_DELAY)
  }
}

export async function typeText(text: string) {
  for (const char of text) {
    await browser.keys([char])
    await browser.pause(KEY_DELAY)
  }
}
