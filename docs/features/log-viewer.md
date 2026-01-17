# Log Viewer

The Log Viewer provides real-time log streaming from pods and containers with powerful viewing options.

## Overview

Access the Log Viewer by pressing `L` on any pod, deployment, or container. 
Logs stream in real-time, letting you monitor application output as it happens.

<!-- TODO: Add log viewer screenshot -->
<!-- ![Log Viewer](../public/images/log-viewer.png) -->

## Features

### Real-Time Streaming

Logs stream live from your containers:

- New log entries appear instantly
- Auto-scroll keeps you at the latest output
- Pause streaming to inspect specific entries

### Syntax Highlighting

Log output is automatically syntax highlighted:

- JSON log entries are formatted and colored
- Best effort for log levels (INFO, WARN, ERROR) and other fields like timestamp to be color-coded

<!-- TODO: Add syntax highlighting screenshot -->
<!-- ![Log Highlighting](../public/images/log-highlighting.png) -->

### Formatting & Copy

Click on the `Format` button to format JSON lines. This also soft wraps inner json fields 
like `message` and `stack_trace` making it easier to inspect the contents.

### View Options

Customize how logs are displayed:

#### Wrap Lines (`W`)
Toggle line wrapping for long log entries:
- **On**: Long lines wrap to fit the window
- **Off**: Horizontal scroll for long lines

#### Show Timestamps (`T`)
Toggle timestamp display:
- **On**: Each line shows its timestamp
- **Off**: Clean view without timestamps

#### Auto-Scroll (`A`)
Toggle automatic scrolling:
- **On**: View follows new log entries
- **Off**: Stay at current position while reviewing

### Copy Logs (`C`)

Copy the visible log content to your clipboard for sharing or analysis.

<!-- TODO: Add log viewer demo video -->
<!-- <video controls width="100%">
  <source src="../public/videos/log-viewer-demo.mp4" type="video/mp4">
</video> -->

## Keyboard Shortcuts

| Shortcut                | Action                        |
|-------------------------|-------------------------------|
| `W`                     | Toggle line wrap              |
| `T`                     | Toggle timestamps             |
| `A`                     | Toggle auto-scroll            |
| `C`                     | Copy logs to clipboard        |
| `Ctrl+R`                | Restart log stream            |
| `Esc`                   | Close log viewer              |
| `↑` `↓`                 | Scroll (when auto-scroll off) |
| `Page Up` / `Page Down` | Fast scroll                   |

## Tips

::: tip Following Multiple Containers
For multi-container pods, open separate log viewers by navigating to each container individually.
:::
