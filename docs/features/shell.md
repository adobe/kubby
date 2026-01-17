# Shell Access

Shell Access lets you open interactive terminal sessions directly into containers running in your cluster.

## Overview

Access Shell by pressing `S` on a pod or container. This opens an interactive terminal session inside the container, equivalent to `kubectl exec -it`.

<!-- TODO: Add shell screenshot -->
<!-- ![Shell Access](../public/images/shell.png) -->

## Features

### Interactive Terminal

Full terminal emulation inside Kubby:

- Standard shell environment (typically `/bin/sh` or `/bin/bash`)
- Color support for commands that use it
- Proper terminal sizing and resize handling

### Container Selection

For pods with multiple containers:

- Select which container to connect to
- Sidecar containers are accessible
- Init containers (if still running) can be accessed

### Shell Detection

Kubby attempts to use the best available shell:

1. First tries `/bin/bash` for a full-featured experience
2. Falls back to `/bin/sh` if bash isn't available
3. Works with minimal container images

<!-- TODO: Add shell demo video -->
<!-- <video controls width="100%">
  <source src="../public/videos/shell-demo.mp4" type="video/mp4">
</video> -->

## Usage

### Opening a Shell

1. Navigate to a pod in the Resource List
2. Press `S` to open a shell
3. If multiple containers exist, select one
4. The terminal opens with an active session

### Working in the Shell

Once connected, you have a standard shell environment:

- Run commands as you would in any terminal
- Navigate the filesystem
- View and edit files
- Run debugging tools

### Closing the Shell

- Type `exit` in the shell
- Press `Esc` to close the shell view
- The shell session ends when you navigate away

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `S` | Open shell (from pod or container) |
| `Esc` | Close shell view |

## Tips

::: tip Debugging Containers
Use shell access to:
- Inspect configuration files
- Check environment variables with `env`
- Test network connectivity with `curl` or `wget`
- View process lists with `ps`
:::

::: tip Minimal Images
Many production containers use minimal base images without debugging tools. Consider using [ephemeral debug containers](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container) for advanced debugging.
:::

::: warning Read-Only Filesystems
Some containers have read-only filesystems. File modifications may fail in these cases.
:::
