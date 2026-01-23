# Features Overview

Kubby provides a comprehensive set of features for managing Kubernetes clusters efficiently.

## Core Features

### [Dashboard](/features/dashboard)
Get a list of all your clusters and namespaces organized in groups in a 2D matrix.

<!-- TODO: Add dashboard screenshot -->
<!-- ![Dashboard](../public/images/dashboard.png) -->

### [Resource List](/features/resource-list)
Browse any Kubernetes resource type with filtering, sorting, and quick actions. 
Works with all standard and custom resources.

<!-- TODO: Add resource list screenshot -->
<!-- ![Resource List](../public/images/resource-list.png) -->

### [Resource Detail](/features/resource-detail)
Inspect resources in detail with multiple view modes: Tree (compact hierarchical view), YAML, and JSON. 
Edit or copy resources directly from the detail view.

<!-- TODO: Add resource detail screenshot -->
<!-- ![Resource Detail](../public/images/resource-detail.png) -->

### [Log Viewer](/features/log-viewer)
Stream logs in real-time from pods and containers. Features syntax highlighting, formatting and auto-scroll.

<!-- TODO: Add log viewer screenshot -->
<!-- ![Log Viewer](../public/images/log-viewer.png) -->

## Operations

### [Actions](/features/actions)
Perform common operations like scaling deployments, rolling restarts, editing resources, port-forward 
and more with single keystrokes.

### [AI Assistant](/features/ai-assistant)
Launch an AI coding assistant with your current Kubernetes context pre-configured. 
Supports Cursor, Claude Code, Augment, and Codex CLI tools.

## Design Principles

Kubby is built around these core principles:

1. **Keyboard-First**: Every action is accessible via keyboard shortcuts
2. **Speed**: Native performance with instant feedback
3. **Simplicity**: Clean interface that shows what matters
4. **Safety**: Destructive actions require confirmation
