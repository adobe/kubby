---
name: Fix modal UX issues
overview: "Fix two UX/accessibility bugs in the Modal component: (1) text selection drag outside modal incorrectly closes it, and (2) arrow keys navigate between inputs instead of moving the cursor within text inputs."
todos:
  - id: fix-overlay-close
    content: "Fix overlay close: track mousedown origin so drag-from-input doesn't trigger onClose"
    status: completed
  - id: fix-arrow-keys
    content: "Fix arrow key navigation: skip ArrowLeft/ArrowRight focus movement when active element is a text input or textarea"
    status: completed
isProject: false
---

# Fix Modal Dialog UX and Accessibility Issues

All changes are in `[src/components/Modal/Modal.tsx](src/components/Modal/Modal.tsx)`.

## Issue 1: Text selection drag outside modal closes the dialog

**Root cause:** The overlay uses a simple `onClick={onClose}` (line 127). When a user starts selecting text inside an input, drags the cursor outside the modal onto the overlay, and releases the mouse button, the browser fires a `click` event on the overlay, which triggers `onClose`.

**Fix:** Track where the `mousedown` originated. Only close the modal if the `mousedown` **started on the overlay itself** (not inside the modal panel). This way, a drag-to-select that ends on the overlay is harmless.

- Add a `useRef<boolean>` (e.g. `mouseDownOnOverlay`) to track whether the mousedown started on the overlay.
- Add `onMouseDown` to the overlay `div` that sets the ref to `true` only when `e.target === e.currentTarget` (i.e. the click landed directly on the overlay, not on a child that bubbled up).
- Add `onMouseDown` with `stopPropagation` to the inner `.modal` div so mousedowns inside the panel never reach the overlay's handler.
- Change the overlay's `onClick` to check `mouseDownOnOverlay.current` before calling `onClose`, and reset the ref afterward.
- Remove the `onClick={(e) => e.stopPropagation()}` from the inner `.modal` div since mousedown tracking makes it unnecessary (or keep it as a safety belt).

## Issue 2: Arrow keys move focus between text inputs instead of navigating text

**Root cause:** In `handleCaptureKeyDown` (lines 44-88), `ArrowLeft`/`ArrowRight` unconditionally move focus to the previous/next focusable element. This prevents normal cursor movement inside text inputs and textareas.

**Fix:** Before handling arrow navigation, check if the currently focused element is a text-entry element (`input` with a text-like type, or `textarea`). If so, skip the arrow-key focus navigation and let the default browser behavior (cursor movement) proceed.

Specifically, inside the `if ((isTab || isArrowNav) && modalRef.current)` block, before the `if (isArrowNav)` branch (line 63), add a guard:

```typescript
if (isArrowNav) {
  const active = document.activeElement as HTMLElement
  const isTextInput = active?.tagName === 'TEXTAREA' ||
    (active?.tagName === 'INPUT' && isTextLikeInput(active as HTMLInputElement))
  if (isTextInput) {
    return // let browser handle cursor movement
  }
  // ... existing arrow navigation logic
}
```

Where `isTextLikeInput` checks `input.type` against text-like types (`text`, `search`, `url`, `tel`, `password`, `email`, `number`, or empty/undefined).