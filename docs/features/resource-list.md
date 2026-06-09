# Resource List

The Resource List view lets you browse and manage any type of Kubernetes resource with powerful filtering and actions.

## Overview

Access the Resource List by selecting a resource type from the header with the resource type selector (`Opt+R`). 
This view displays all resources of a specific type in your selected namespace.

<!-- TODO: Add resource list screenshot -->
<!-- ![Resource List](../public/images/resource-list.png) -->

## Features

### Resource Type Selector

Quickly switch between resource types:

- Press `Opt+R` (or `:`) to open the resource type selector
- Type to filter available resource types
- Supports all standard Kubernetes resources
- Works with Custom Resource Definitions (CRDs)

<!-- TODO: Add resource selector screenshot -->
<!-- ![Resource Selector](../public/images/resource-selector.png) -->

### Namespace Selector

Switch the active namespace from the header:

- Press `Opt+N` to focus the namespace selector
- Type to filter available namespaces
- Pick a namespace from the dropdown to switch

If a namespace has a [label](../configuration.md#namespace-labels) configured,
a short badge is shown as a prefix inside the selector, while the input itself
holds only the real namespace name. This keeps the field readable and means
copying the value yields the actual Kubernetes namespace name, not the helper
label. You can still filter by the label: type part of the label and the
dropdown narrows to the matching namespaces.

### Filtering

Filter resources by name using the filter input:

- Type `/` and then type any text filter
- Press `Esc` to clear the filter
- Filter applies instantly as you type

### Columns

Each resource type displays relevant columns.

### Context-Sensitive Actions

Actions available depend on the resource type selected, for example:

**Deployments:**
- View Pods (`Enter`)
- Describe (`D`)
- Edit (`E`)
- View Logs (`L`)
- Rolling Restart (`R`)
- Scale (`S`)
- Delete (`Del`)

**Pods:**
- View Containers (`Enter`)
- Describe (`D`)
- Edit (`E`)
- View Logs (`L`)
- Port Forward (`F`)
- Shell (`S`)
- Delete (`Del`)

**Services:**
- View Pods (`Enter`)
- Describe (`D`)
- Edit (`E`)
- Port Forward (`F`)
- Delete (`Del`)

### Jump to Related Resources

Press `J` to open the Jump menu and quickly navigate to related resources:

- From a Deployment → Jump to its ReplicaSets, HorizontalPodAutoscalers, HTTPProxies, etc.
- From a Service → Jump to Endpoints, Events, etc.

<!-- TODO: Add jump menu screenshot -->
<!-- ![Jump Menu](../public/images/jump-menu.png) -->

## Keyboard Shortcuts

| Shortcut       | Action                                         |
|----------------|------------------------------------------------|
| `↑` `↓`        | Navigate list                                  |
| `Ctrl+R`       | Refresh list manually                          |
| `Esc`          | Back to previous view                          |
| `Enter`        | Context-specific action (pods, containers)     |
| `D`            | Describe resource                              |
| `E`            | Edit resource                                  |
| `L`            | View logs                                      |
| `F`            | Port forward, view port forwards               |
| `S`            | Scale (deployments) / Shell (pods, containers) |
| `R`            | Rolling restart (deployments)                  |
| `Del`          | Delete resource                                |
| `J`            | Jump to related resource                       |
| `Opt+R` or `:` | Change resource type                           |
| `Opt+C`        | Change context                                 |
| `Opt+N`        | Change namespace                               |
| `/`            | Focus on filter input                          |

## Tips

::: tip Quick change Resource, Context, Namespace
Press `Opt+R` to open the quick resource switcher. Type the resource type name and press Enter.
Similarly, for Context and Namespace.
:::

::: tip Read-Only Mode
In read-only contexts, modifying actions (Edit, Delete, Scale) are disabled to prevent accidental changes.
You can set `readOnly: true` in configuration to start in readonly mode.
:::
