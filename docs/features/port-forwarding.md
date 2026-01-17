# Port Forwarding

Port Forwarding lets you access services and pods running in your cluster from your local machine.

## Overview

Access Port Forwarding by pressing `F` on a pod, container, or service. This creates a tunnel from a local port to a port in your cluster, letting you access applications without exposing them externally.

<!-- TODO: Add port forward modal screenshot -->
<!-- ![Port Forward](../public/images/port-forward.png) -->

## Features

### Quick Setup

Configure port forwards with a simple dialog:

1. Select the target pod or service
2. Choose the container port to forward
3. Specify a local port (or use the same port)
4. Start the forward

### Multiple Forwards

Run multiple port forwards simultaneously:

- Forward different services at the same time
- Use different local ports to avoid conflicts
- Each forward runs independently

### Auto-Detection

Kubby automatically detects available ports:

- Container ports are listed for selection
- Service ports show their target ports
- Named ports display their names for clarity

<!-- TODO: Add port selection screenshot -->
<!-- ![Port Selection](../public/images/port-selection.png) -->

## Usage

### From a Pod

1. Navigate to the pod in the Resource List
2. Press `F` to open Port Forward dialog
3. Select the container (if multiple)
4. Choose the port to forward
5. Enter local port or accept default
6. Confirm to start

### From a Service

1. Navigate to the service in the Resource List
2. Press `F` to open Port Forward dialog
3. Select the service port
4. Enter local port or accept default
5. Confirm to start

### From a Container

1. Navigate into a pod to see containers
2. Select the container
3. Press `F` to open Port Forward dialog
4. Choose from available container ports

## Managing Forwards

Active port forwards persist while Kubby is running:

- View active forwards in the status area
- Stop individual forwards when no longer needed
- Forwards automatically stop when you close Kubby

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F` | Open port forward dialog |
| `Enter` | Confirm and start forward |
| `Esc` | Cancel dialog |

## Tips

::: tip Common Use Cases
- Access a database running in the cluster
- Test a service before exposing it
- Debug an application's HTTP endpoints
- Connect development tools to cluster services
:::

::: tip Port Conflicts
If a local port is already in use, Kubby will notify you. Choose a different local port to resolve the conflict.
:::

::: warning Security Note
Port forwards are only accessible from your local machine. They don't expose the service to your network.
:::
