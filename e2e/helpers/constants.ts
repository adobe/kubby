/**
 * Shared timing and configuration constants for e2e tests.
 */

// --- Pause durations (ms) ---
export const KEY_DELAY = 50
export const SHORT_WAIT = 300
export const LONG_WAIT = 1_000

// --- Timeouts (ms) ---
export const DEFAULT_TIMEOUT = 3_000
export const K8S_TIMEOUT = 10_000
export const POLL_INTERVAL = 3_000

// --- Test data ---
export const DEFAULT_CONTEXT = 'live-kappa-nebula237-live-kappa'
export const ALT_CONTEXT = 'live-gamma-nebula24-live-gamma'
export const DEFAULT_NAMESPACE = 'ns-team-stellar-domains'
export const ALT_NAMESPACE = 'ns-team-stellar-operations'
export const TEST_DEPLOYMENT = 'domains-api-service'
