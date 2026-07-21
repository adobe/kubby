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

/**
 * Shared timing and configuration constants for e2e tests.
 */

// --- Pause durations (ms) ---
export const KEY_DELAY = 50
export const SHORT_WAIT = 300
export const LONG_WAIT = 1_000

// --- Timeouts (ms) ---
export const DEFAULT_TIMEOUT = 3_000
export const K8S_TIMEOUT = 30_000
export const POLL_INTERVAL = 3_000

// --- Test data ---
export const DEFAULT_CONTEXT = 'live-kappa-nebula237-live-kappa'
export const ALT_CONTEXT = 'live-gamma-nebula24-live-gamma'
export const DEFAULT_NAMESPACE = 'ns-team-stellar-domains'
export const ALT_NAMESPACE = 'ns-team-stellar-operations'
export const TEST_DEPLOYMENT = 'domains-api-service'
