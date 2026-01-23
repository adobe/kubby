# AI Assistant

Kubby AI Assistant feature is very lightweight and pragmatic.
If configured, it lets you launch an external AI coding tool of your choice with your current Kubernetes context,
enabling natural language queries and assistance for managing your cluster.
If not configured the button and action are not visible in the UI and you can simply ignore the feature.

## Overview

Press `A` to launch your configured AI assistant. Kubby prepares a workspace with your current context, namespace, and
selected resource, then opens your preferred AI tool.

## Supported Tools

Kubby supports five AI coding assistants:

| Tool         | Config Value   | Description                         |
|--------------|----------------|-------------------------------------|
| Cursor Agent | `cursor-agent` | Cursor's CLI agent (terminal-based) |
| Cursor IDE   | `cursor`       | Opens a new Cursor window           |
| Claude Code  | `claude`       | Anthropic's Claude CLI              |
| Augment      | `augment`      | Augment's auggie CLI                |
| Codex        | `codex`        | OpenAI's Codex CLI                  |

## Configuration

Add the `ai` section to your `kubby_config.yaml`:

```yaml
ai:
  tool: cursor-agent    # Which AI tool to launch
  name: Agent           # Custom button label (default: "AI")
  readOnly: true        # Restrict kubectl to safe commands, defaults to true if not set
```

Once configured, the button appears in the shortcuts bar with your custom name (or "AI" by default).
Hovering shows the actual tool being used.

### Configuration Options

| Option     | Type    | Default    | Description                                                                  |
|------------|---------|------------|------------------------------------------------------------------------------|
| `tool`     | string  | (required) | AI tool to launch: `cursor-agent`, `cursor`, `claude`, `augment`, or `codex` |
| `name`     | string  | `"AI"`     | Custom button label (e.g., "Agent" for Cursor Agent)                         |
| `readOnly` | boolean | `true`     | Restrict kubectl to read-only commands                                       |

## Read-Only Mode

When `readOnly: true` (the default), Kubby creates a kubectl wrapper that:

**Allows only safe commands:**

- `get`, `describe`, `logs`, `explain`, `top`
- `api-resources`, `api-versions`, `cluster-info`
- `config view`, `config get-contexts`, `config current-context`
- `version`, `auth can-i`, `diff`

**Blocks modifying commands:**

- `apply`, `delete`, `edit`, `patch`
- `scale`, `rollout`, `exec`, `run`
- Context/namespace switching (`config use-context`, `config set-context`)

**Locks context and namespace:**

- The wrapper only allows kubectl commands targeting the configured context and namespace
- Prevents the AI from accidentally operating on the wrong cluster

You can inspect the `kubectl` wrapper script in `~/.kubby/ai/bin/kubectl`. 

::: tip Safety First
Enable read-only mode for production clusters. 
The AI can still help you understand resources and debug issues.
⚠️ As with any AI tool, be mindfully that this is not a 100% safe protection, the current models are very smart 
and can escape any protection by directly modifying files or system configuration.
:::

## How It Works

When you press `A`, Kubby:

1. **Creates the AI workspace** at `~/.kubby/ai/` with configuration files for your chosen tool
2. **Writes `context.md`** containing the current context, namespace, resource type, and selected resource
3. **Configures the kubectl wrapper** based on your read-only setting
4. **Launches your AI tool** with the Kubby bin directory prepended to PATH

The kubectl wrapper at `~/.kubby/ai/bin/kubectl` transparently intercepts all `kubectl` commands via PATH. The AI uses
kubectl normally without needing special instructions about the wrapper.

## Workspace Structure

```
~/.kubby/ai/
├── context.md          # Current Kubernetes context (updated each launch)
├── bin/
│   └── kubectl         # Wrapper script (prepended to PATH, intercepts kubectl)
├── .cursor/
│   └── mcp.json        # MCP configuration for Cursor
├── .cursorrules        # Instructions for Cursor
├── CLAUDE.md           # Instructions for Claude Code
├── AGENTS.md           # Instructions for Codex
└── augment.yaml        # Configuration for Augment
```

The `bin/kubectl` wrapper is prepended to PATH so it intercepts all `kubectl` calls transparently. When
`readOnly: true`, the wrapper enforces security policies:

- Only allows safe, read-only kubectl commands
- Blocks commands that modify resources
- Locks context and namespace to prevent accidental cross-cluster operations

## Usage

### Basic Usage

1. Navigate to a resource in the Resource List
2. Press `A` to launch the AI assistant
3. The AI opens with your current context pre-loaded
4. Ask questions like:
    - "What's the current replica count for this deployment?"
    - "Show me the recent events for this pod"
    - "Why is this pod in CrashLoopBackOff?"

### Other example Queries

With context on a deployment:

- "Scale this deployment to 5 replicas" (requires readOnly: false)
- "What images are the containers using?"
- "Show me the resource limits"

With context on a pod:

- "Are errors in logs in the last hour?"
- "What's consuming the most memory?"
- "Describe the pod's restart history"

## Tips

::: tip Context-Aware Assistance
The AI knows your current context, namespace, and selected resource. You don't need to specify them in your questions.
:::

::: tip Tool Installation
Make sure your chosen AI tool's CLI is installed and available in your PATH.
`git` is required to initialize Kubby `ai` folder.
Other tools may be needed depending on the AI tool.
:::

