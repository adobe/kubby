/**
 * Global setup/teardown hooks for e2e test suite.
 */
import { waitForApp } from './navigation'

export async function beforeSuite() {
  await waitForApp()
}
