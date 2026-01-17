# Dashboard

The Dashboard provides a comprehensive overview of your Kubernetes cluster resources in a single view.

## Overview

When you launch Kubby you're presented with the Dashboard. It displays all your clusters
and namespaces organized in groups.

<!-- TODO: Add dashboard overview screenshot -->
<!-- ![Dashboard Overview](../public/images/dashboard-overview.png) -->

### Quick Navigation

From the Dashboard, you can quickly jump to a cluster (context) + namespace pair:

- Press `/` to filter by any text
- Press `Enter` to jump the deployments in that cluster and namespace

<!-- TODO: Add navigation demo video -->
<!-- <video controls width="100%">
  <source src="../public/videos/dashboard-navigation.mp4" type="video/mp4">
</video> -->

## Keyboard Shortcuts

| Shortcut        | Action                            |
|-----------------|-----------------------------------|
| `/`             | Filter by text                    |
| `Esc`           | Clears filters                    |
| `Tab`           | Move to next group                |
| `Shift+Tab`     | Move to previous group            |
| `←` `→` `↑` `↓` | Navigate within a group           |
| `Enter`         | Open selected cluster & namespace |

## Tips

::: tip Filtering
Use the filter input to quickly find resources by anything across all groups. 
The filtering works with multiple words separated by space and will try to match by each segment.
:::
