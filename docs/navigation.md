# Navigation

Learn how to navigate Kubby efficiently using keyboard shortcuts and UI elements.

## Navigation Model

Kubby uses a hierarchical navigation model:

```
Context → Namespace → Resource Type → Resource → Detail/Logs/Shell
```

You can navigate forward by drilling into resources, and backward using `Esc`.

## Global Navigation

These controls are available from anywhere in the app:

### Context Selector (`Opt+C`)

Switch between Kubernetes contexts (clusters):

1. Press `Opt+C` to open the context selector
2. Type to filter available contexts
3. Press `Enter` to select
4. The view refreshes with the new context

<!-- TODO: Add context selector screenshot -->
<!-- ![Context Selector](./public/images/context-selector.png) -->

### Namespace Selector (`Opt+N`)

Switch namespaces within the current context:

1. Press `Opt+N` to open the namespace selector
2. Type to filter namespaces
3. Select "All Namespaces" to view across all namespaces
4. Press `Enter` to select

### Resource Type Selector (`Opt+R`)

Switch to a different resource type:

1. Press `Opt+R` to open the resource type selector
2. Type to filter (e.g., "deploy", "pod", "svc")
3. Press `Enter` to view that resource type

### Quick Resource Switch (`:`)

k9s-style resource switching:

1. Press `:` to open the command input
2. Type the resource type (e.g., `pods`, `deploy`, `svc`)
3. Press `Enter` to switch

## View Navigation

### Dashboard

The Dashboard shows multiple resource tables. Navigate between them:

| Shortcut | Action |
|----------|--------|
| `Tab` | Move to next table |
| `Shift+Tab` | Move to previous table |
| `←` `→` | Navigate columns |
| `↑` `↓` | Navigate rows |
| `Enter` | Open selected resource |

### Resource List

Single resource type view with full-width table:

| Shortcut | Action |
|----------|--------|
| `↑` `↓` | Navigate resources |
| `Enter` | Primary action (varies by type) |
| `J` | Jump to related resources |
| `Esc` | Go back to Dashboard |

### Resource Detail

Detailed view of a single resource:

| Shortcut | Action |
|----------|--------|
| `Y` / `T` / `J` | Switch view mode |
| `↑` `↓` | Scroll content |
| `Page Up` / `Page Down` | Fast scroll |
| `Esc` | Go back |

### Log Viewer

Streaming log view:

| Shortcut | Action |
|----------|--------|
| `↑` `↓` | Scroll (when auto-scroll off) |
| `A` | Toggle auto-scroll |
| `Esc` | Close log viewer |

## Back Navigation

Press `Esc` to go back one level:

- From Resource Detail → Resource List
- From Log Viewer → Previous view
- From Resource List → Dashboard
- Closes any open modal or dialog

## Refresh

Press `Ctrl+R` to refresh the current view:

- Dashboard: Refreshes all resource tables
- Resource List: Reloads the resource list
- Resource Detail: Fetches latest resource state
- Log Viewer: Restarts the log stream

## Filter Input

Most views have a filter input for searching:

1. Start typing to filter by name
2. Filter applies instantly
3. Press `Esc` to clear the filter
4. Works across all visible resources

## Navigation Flow Examples

### View Pod Logs

```
Dashboard → Select Deployment → Enter (view pods) → Select Pod → L (logs)
```

### Scale a Deployment

```
Dashboard → Select Deployment → S (scale) → Enter count → Enter (confirm)
```

### Port Forward to a Service

```
Opt+R → type "svc" → Enter → Select Service → F (port-forward) → Configure → Enter
```

### Jump to Related Resources

```
Select Deployment → J (jump) → Select "Pods" → View matching pods
```

## Tips

::: tip Staying Oriented
The header always shows your current context, namespace, and resource type so you know where you are.
:::

::: tip Quick Return to Dashboard
From any view, press `Esc` repeatedly to return to the Dashboard.
:::

::: tip Filtering is Fast
The filter input searches as you type with no delay. Use it liberally to find resources quickly.
:::
