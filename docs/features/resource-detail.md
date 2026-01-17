# Resource Detail

The Resource Detail view provides in-depth information about any Kubernetes resource with multiple viewing formats.

## Overview

Access the Resource Detail by pressing `D` (Describe) on any resource,
or by navigating into a resource from the list view. This view shows the complete resource specification and status.

<!-- TODO: Add resource detail screenshot -->
<!-- ![Resource Detail](../public/images/resource-detail.png) -->

## View Modes

Toggle between three view modes to see your resource data in the format that works best:

### Tree View (`T`)

Default compact hierarchical tree representation of the resource:

- Collapsible sections
- Quick click-into navigation through nested structures
- Great for viewing complex resources

<!-- TODO: Add tree view screenshot -->
<!-- ![Tree View](../public/images/detail-tree.png) -->

### YAML View (`Y`)

The view shows the resource as YAML with syntax highlighting:

- Full resource specification
- Color-coded syntax
- Easy to read and copy

<!-- TODO: Add YAML view screenshot -->
<!-- ![YAML View](../public/images/detail-yaml.png) -->

### JSON View (`J`)

Raw JSON format:

- Standard JSON representation
- Syntax highlighted
- Useful for copying to other tools

<!-- TODO: Add JSON view screenshot -->
<!-- ![JSON View](../public/images/detail-json.png) -->

## Features

### Syntax Highlighting

All view modes feature syntax highlighting for better readability:

- Keys and values are color-coded
- Numbers, strings, and booleans are distinguished
- Comments and annotations are highlighted

### Copy to Clipboard

Press `C` to copy the current view content to your clipboard:

- Copies the full resource in the current format (YAML/JSON)
- Useful for sharing or editing externally

### Edit Mode

Press `E` to edit the resource:

- Opens in your configured external editor (configured with `KUBE_EDITOR`, `EDITOR` or system default)
- Changes are applied when you save and close
- Validation errors are displayed if the update fails

### Refresh

The view has an automatic refresh so any changes are updated live.
You can still press `Ctrl+R` to manually refresh the resource detail and fetch the latest state from the cluster.

## Keyboard Shortcuts

| Shortcut | Action              |
|----------|---------------------|
| `T`      | Switch to Tree view |
| `Y`      | Switch to YAML view |
| `J`      | Switch to JSON view |
| `E`      | Edit resource       |
| `C`      | Copy to clipboard   |
| `Ctrl+R` | Refresh             |
| `Esc`    | Go back             |

## Tips

::: tip Quick Editing
The Tree view lets you see the structure at a glance before switching to complete YAML 
for the actual resource definition.
:::

::: tip Keyboard Scrolling
Use standard scrolling keys (`Page Up`, `Page Down`, `Home`, `End`) to navigate long resource definitions.
:::
