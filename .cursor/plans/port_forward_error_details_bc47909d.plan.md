---
name: Surface kubectl error details consistently
overview: Audit found multiple places where kubectl stderr is silently discarded or frontend error messages are generic. Fix port forward death errors (original issue) and bring consistency to all other kubectl error paths.
todos:
  - id: pf-stderr-buffer
    content: "port_forward.rs: Add Arc<Mutex<Vec<String>>> stderr buffer to PortForwardProcess, capture lines in drain task, and add errorMessage to DeadPortForward"
    status: completed
  - id: pf-frontend
    content: "usePortForwardAction.tsx + ResourceList.tsx: Thread errorMessage from DeadPortForward through the callback and into the Alert"
    status: completed
  - id: pf-startup-stderr
    content: "port_forward.rs: On timeout/exit during startup, drain remaining stderr lines and include them in the error"
    status: completed
  - id: frontend-shell-error
    content: "ResourceList.tsx: Show shell action errors to user instead of console.error only"
    status: completed
  - id: frontend-log-history
    content: "LogViewer.tsx: Surface fetch_historical_logs failure in UI"
    status: completed
  - id: frontend-run-modal
    content: "RunModal.tsx: Show errors for get_resource_detail and open_terminal_with_command"
    status: completed
  - id: frontend-resource-types
    content: "ResourceList.tsx: Surface get_resource_types failure in UI"
    status: completed
isProject: false
---

# Surface kubectl error details consistently

## Audit Summary

A full audit of every kubectl invocation (Rust) and every `invoke()` call (frontend) revealed the port forward issue is one of several places where error details are lost. The fixes below are grouped into the main port-forward issue and then the additional consistency gaps.

## A. Port Forward Death -- stderr lost (original issue)

### Problem

After a port forward starts successfully, background tasks drain stdout/stderr but **discard** all lines. When the process later dies, `DeadPortForward` only carries `exit_code`. The frontend constructs a generic message with no kubectl details.

### Fix: Rust backend ([port_forward.rs](src-tauri/src/port_forward.rs))

- Add `use std::sync::Arc;` to imports.
- Add `stderr_buffer: Arc<Mutex<Vec<String>>>` field to `PortForwardProcess` (line 42).
- Replace the stderr drain task (line 469) to push each line into the shared buffer (cap at ~50 lines).
- Add `error_message: Option<String>` (serde: `errorMessage`) to `DeadPortForward` (line 24).
- In `cleanup_dead_processes_and_store` (line 595): when a dead process is found, read `process.stderr_buffer`, filter out noise lines (e.g. "Handling connection for ..."), join into a string, and set `error_message`.
- Reorder the success path so the buffer `Arc` is created first, cloned into the drain spawn, and the original stored in `PortForwardProcess`.

### Fix: Rust -- port-forward startup edge cases ([port_forward.rs](src-tauri/src/port_forward.rs))

On the `Ok(Err(e))` path (line 473) and the `Err(_)` timeout path (line 479), the error message often lacks stderr context (e.g. "Port forward failed with exit code: ..."). Before killing the child, drain any remaining stderr lines and append them to the error string.

### Fix: Frontend

- **[usePortForwardAction.tsx](src/pages/ResourceList/actions/usePortForwardAction.tsx)**: Add `errorMessage: string | null` to `DeadPortForward` interface. Pass it to `onPortForwardFailed`.
- **[usePortForwardAction.tsx](src/pages/ResourceList/actions/usePortForwardAction.tsx)**: Update callback type signature: `onPortForwardFailed?: (resourceName, localPort, targetPort, errorMessage?) => void`.
- **[ResourceList.tsx](src/pages/ResourceList/ResourceList.tsx)**: Update `handlePortForwardFailed` (line 299) to accept and display `errorMessage`. When present, show it as the primary message content rather than the generic "failed unexpectedly" string. Increase auto-clear timeout from 10s to 30s since longer messages need more reading time.

---

## B. Other kubectl error consistency gaps

### B1. Shell action -- errors not shown ([ResourceList.tsx](src/pages/ResourceList/ResourceList.tsx) line 421)

Currently `console.error('Shell failed:', result.error)` only. Use the existing `portForwardError` / generic error state to display `result.error` in the UI via an Alert. Or add a dedicated `actionError` state since "Port Forward Failed" label doesn't fit shell errors.

**Proposed:** Add a general `actionError` state (replaces `portForwardError` for a unified error banner) and set it from the shell failure path. Reuse the same auto-clearing pattern.

### B2. Historical log fetch -- errors not shown ([LogViewer.tsx](src/pages/LogViewer/LogViewer.tsx) line 607)

Currently `console.error` only. The component already has an `error` state and `Alert`. Set `setError(...)` with the backend message so the user sees why log history failed to load.

### B3. RunModal -- errors not shown ([RunModal.tsx](src/components/RunModal/RunModal.tsx) lines 160, 183)

Both `get_resource_detail` and `open_terminal_with_command` failures are `console.error` only. Add an `error` state to the component, set it on catch, and render an `Alert` in the modal.

### B4. Resource types fetch -- errors not shown ([ResourceList.tsx](src/pages/ResourceList/ResourceList.tsx) line 544)

`get_resource_types` failure silently sets an empty list. The page already renders a loading error `Alert`. Use the existing `error` state from `useResourceLoader` or add a small secondary alert to surface this.

---

## Not changing (intentional by design)

- **HPA/PDB list** (`resources.rs` lines 165, 234): `Ok(None)` on failure is correct -- these are optional enrichment. `kubectl get hpa` returns non-zero when no HPAs exist; treating as empty is the right behavior.
- **CRD column defaults** (`resource_columns.rs`): Fallback to AGE-only columns is acceptable UX for CRD auto-detection.
- **Metrics refresh** (`ResourceList.tsx`): Metrics are optional and silently retry. Errors are already in `MetricsCacheStatus.error` on the Rust side for debugging.
- `**config current-context`** (`config.rs`): Returns empty string on failure which is handled downstream.
- `**open_file_in_editor`** (`Onboarding.tsx`, `DashboardShortcutsBar.tsx`): Not kubectl-related; low priority.
- `**stop_log_stream`**: Cleanup/teardown; failure is non-actionable.

---

## C. E2E Tests

Audited all specs under `e2e/specs/`: `dashboard.spec.ts`, `describe.spec.ts`, `logs.spec.ts`, `resource-list.spec.ts`.

**No existing e2e tests need updating.** All tests cover happy paths and use `waitForNoAlert()` (in [e2e/helpers/navigation.ts](e2e/helpers/navigation.ts)) which throws if any `[role="alert"]` contains "error". Since our changes only surface new alerts on **failure** paths (not success paths), existing assertions are unaffected.

**Key constraint during implementation:** All new error alerts must use `role="alert"` (they already do via the `Alert` component). Ensure no error alerts are inadvertently shown on success paths, as that would break `waitForNoAlert` in multiple specs.

The port-forward e2e test (`resource-list.spec.ts` "port forward: add and stop") only tests the happy path (open modal, start, stop). A dead-forward error test would require simulating a pod crash during an active forward, which is impractical in the current e2e setup (real cluster, no fault injection). No new e2e test added.