# Configuration

Kubby uses a YAML configuration file to define your dashboard layout, contexts, namespaces, and custom commands.

## Configuration File Location

The configuration file is located at:

```
~/.config/kubby/kubby_config.yaml
```

## First-Time Setup

When you first launch Kubby without a configuration file, the onboarding wizard will:

1. Detect your available Kubernetes contexts from `~/.kube/config`
2. Let you select which contexts to include
3. Discover namespaces for each context
4. Generate a starter configuration file

You can always edit this file manually to customize your setup.

## Configuration Structure

### Basic Example

```yaml
# Kubby Dashboard Configuration

# Global settings
readOnly: false              # Set to true to disable modifying actions
liveViewAutoRefresh: true    # Auto-refresh resource views
refreshRateSeconds: 2        # How often to refresh resource lists
metricsRefreshRateSeconds: 30  # How often to refresh metrics

contexts:
  groups:
    - name: "Production"
      contexts:
        - group: "US East"
          contexts:
            - name: "prod-us-east-1"
            - name: "prod-us-east-2"
        - group: "US West"
          contexts:
            - name: "prod-us-west-1"
      namespaces:
        - name: "default"
        - name: "app-frontend"
        - name: "app-backend"

    - name: "Development"
      contexts:
        - group: "Dev Clusters"
          contexts:
            - name: "dev-cluster"
      namespaces:
        - name: "default"
        - name: "dev"
```

## Configuration Options

### Global Settings

| Option                      | Type    | Default    | Description                                                                                                                                                                                                                           |
|-----------------------------|---------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `readOnly`                  | boolean | `false`    | Disable all modifying actions (edit, delete, scale, etc.)                                                                                                                                                                             |
| `liveViewAutoRefresh`       | boolean | `true`     | Automatically refresh resource views                                                                                                                                                                                                  |
| `refreshRateSeconds`        | number  | `2`        | Interval for refreshing resource lists                                                                                                                                                                                                |
| `metricsRefreshRateSeconds` | number  | `30`       | Interval for refreshing metrics data                                                                                                                                                                                                  |
| `kubectlTimeoutSeconds`     | number  | `10`       | Timeout for kubectl commands in seconds                                                                                                                                                                                               |
| `accentColor`               | string  | `"orange"` | Accent color for shortcut badges and dashboard bullets. Options: `auburn`, `blue`, `brown`, `coral`, `cyan`, `gray`, `green`, `indigo`, `lemon`, `lime`, `olive`, `orange`, `pine`, `pink`, `plum`, `purple`, `red`, `teal`, `yellow` |
| `contextNamePattern`        | string  | see below  | Default regex for parsing context names into `env`, `region`, `cluster` parts. Can be overridden per group.                                                                                                                           |
| `namespaceNamePattern`      | string  | -          | Default regex for parsing namespace names for dashboards into `lowlight`/`highlight` display parts. Can be overridden per group or namespace group. If omitted, auto-detects a common prefix.                                         |
| `ai`                        | object  | -          | AI assistant configuration (see [AI Assistant](/features/ai-assistant))                                                                                                                                                               |

### Contexts Configuration

The `contexts` section defines how your Kubernetes contexts are organized in the dashboard.

#### Groups

Groups are top-level organizational units. Each group creates a section in the dashboard:

```yaml
contexts:
  groups:
    - name: "Production"    # Display name for this group
      contexts: [...]       # Context definitions
      namespaces: [...]     # Namespace definitions
```

Each group also accepts an optional `contextNamePattern` to override how context names are parsed for display (
see [Context Name Parsing](#context-name-parsing) below), and an optional `namespaceNamePattern` to override how
namespace names are parsed for display (see [Namespace Name Parsing](#namespace-name-parsing) below).

#### Context Groups

Within each group, contexts can be organized into sub-groups (displayed as columns):

```yaml
contexts:
  - group: "US Region"      # Column header
    contexts:
      - name: "prod-us-east"   # Must match kubeconfig context name
      - name: "prod-us-west"
  - group: "EU Region"
    contexts:
      - name: "prod-eu-west"
```

#### Namespaces

Namespaces define the rows in your dashboard. They can be a simple list:

```yaml
namespaces:
  - name: "default"
  - name: "kube-system"
  - name: "app-namespace"
```

Or grouped for better organization:

```yaml
namespaces:
  - group: "System"
    namespaces:
      - name: "kube-system"
      - name: "kube-public"
  - group: "Applications"
    namespaces:
      - name: "frontend"
      - name: "backend"
```

#### Context-Specific Namespaces

You can restrict certain namespaces to specific contexts:

```yaml
namespaces:
  - name: "default"                    # Available in all contexts
  - name: "dev-only"
    contexts: ["dev-cluster"]          # Only shows for dev-cluster context
  - name: "prod-monitoring"
    contexts: ["prod-us-east", "prod-us-west"]  # Only for these contexts
```

## Context Name Parsing

Kubby parses context names into three display parts — **env**, **region**, and **cluster** — shown in the dashboard
column headers. The parsing is driven by a regex
with [named capture groups](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_capturing_group).

The built-in default pattern matches the `<env>-<region>-<cluster>` format:

```
^(?<env>[^-]+)-(?<region>[^-]+)-(?<cluster>.+)$
```

For example, `prod-va7-ethos320-prod-va7` → `env=prod`, `region=va7`, `cluster=ethos320-prod-va7`.

### Custom Patterns

If your context names follow a different format, configure a custom pattern at the root level (applies to all groups) or
per group (overrides the root):

```yaml
# Root-level default — applies to all groups unless overridden
contextNamePattern: "^(?<env>[^-]+)-(?<region>[^-]+)-(?<cluster>.+)$"

contexts:
  groups:
    - name: "Ethos Clusters"
      # Group-level override — takes priority over root
      contextNamePattern: "^(?<cluster>ethos[^-]+)-(?<env>[^-]+)-(?<region>.+)$"
      contexts: [...]
      namespaces: [...]

    - name: "AKS Clusters"
      # No contextNamePattern — uses root-level pattern
      contexts: [...]
      namespaces: [...]
```

**Priority order:** group-level → root-level → built-in default.

### Named Capture Groups

The pattern must define these three named groups (all are required for a match to apply):

| Group             | Description               | Example                |
|-------------------|---------------------------|------------------------|
| `(?<env>...)`     | Environment identifier    | `prod`, `stage`, `dev` |
| `(?<region>...)`  | Region or location        | `va7`, `us-east-1`     |
| `(?<cluster>...)` | Cluster name or remainder | `ethos11`, `aks-0`     |

::: tip Unmatched patterns
If the pattern doesn't match a context name, Kubby falls back to splitting on `-` and assigning the first part as `env`,
second as `region`, and the rest as `cluster`.
:::

## Namespace Name Parsing

Kubby can parse namespace names into two display parts — **lowlight** (dimmed, small) and **highlight** (bold, larger) —
shown in the dashboard row labels.

By default, if no pattern is configured, Kubby **auto-detects** a common prefix shared by all namespaces in the group
and renders it as the lowlight part.

### Custom Namespace Pattern

Configure a regex with named capture groups `(?<lowlight>...)` and `(?<highlight>...)` at any of three levels:

**Priority order:** namespace-group → dashboard group → root → auto-detect.

```yaml
# Root-level — applies to all namespace groups unless overridden
namespaceNamePattern: "^(?<lowlight>ns-team-[^-]+-)(?<highlight>.+)$"

contexts:
  groups:
    - name: "Services"
      # Group-level override — takes priority over root
      namespaceNamePattern: "^(?<lowlight>ns-team-ups-)(?<highlight>.+)$"
      namespaces:
        - group: "Lookup"
          # Namespace-group-level override — takes priority over group and root
          namespaceNamePattern: "^(?<lowlight>ns-team-ups-lookup-)(?<highlight>.+)$"
          namespaces:
            - name: ns-team-ups-lookup-prod
            - name: ns-team-ups-lookup-stage
```

### Named Capture Groups

| Group               | Description                      | Example                        |
|---------------------|----------------------------------|--------------------------------|
| `(?<lowlight>...)`  | Dimmed prefix part (optional)    | `ns-team-ups-`, `ns-team-`     |
| `(?<highlight>...)` | Bold main part (always rendered) | `lookup-prod`, `accessx-stage` |

- Both groups are optional in the match — if `lowlight` is absent, only `highlight` is shown.
- The render order follows the order they appear in the namespace string (left to right).
- Any extra named groups in the pattern are silently ignored.

::: tip Preserving separators
To keep a trailing dash as part of `lowlight`, include it in the group:

```
^(?<lowlight>ns-team-ups-)(?<highlight>.+)$
```

This renders `ns-team-ups-` dimmed and `lookup-prod` bold.
:::

::: tip Unmatched patterns
If the pattern doesn't match a namespace name, the full name is shown as `highlight` with no `lowlight`.
:::

## Custom Run Commands

Define custom kubectl commands that can be executed from the resource list using the `U` shortcut:

```yaml
resources:
  run:
    - name: "Debug Pod with Busybox"
      command: "kubectl debug --context $context --namespace $namespace $name -it --image=busybox -- sh"
      resources: ["pod"]    # Only show for pods

    - name: "Network Troubleshooting"
      command: "kubectl run net-debug --context $context --namespace $namespace --image=praqma/network-multitool --labels=$labels --restart=Never --command -- sleep infinity"
      resources: ["pod"]

    - name: "Port Forward 8080"
      command: "kubectl port-forward --context $context --namespace $namespace $name 8080:80"
      # No resources filter = available for all resource types

    - name: "Test Curl"
      command: "kubectl run test-curl --context $context --namespace $namespace --image=curlimages/curl --labels=$labels --restart=Never --command -- sleep infinity"
      resources: ["pod"]
```

### Command Placeholders

Use these placeholders in your custom commands:

| Placeholder | Description |
|-------------|-------------|
| `$context` | Current Kubernetes context |
| `$namespace` | Current namespace |
| `$name` | Name of the selected resource |
| `$labels` | Resource labels formatted as `key=value,key=value` |
| `${path.to.field}` | Deep path into the resource definition (see below) |

#### Deep Path Placeholders

You can reference any field from the Kubernetes resource definition using `${path.to.field}` syntax. This is useful for accessing nested values like spec fields, annotations, or status information.

Examples:

```yaml
resources:
  run:
    - name: "Ping HTTPProxy FQDN"
      command: "kubectl run ping-curl --image=curlimages/curl --rm -it --restart=Never --context $context --namespace $namespace -- curl -sSv https://${spec.virtualhost.fqdn}/ping"
      resources: ["httpproxy"]

    - name: "Check Service Port"
      command: "curl -v http://${spec.clusterIP}:${spec.ports.0.port}"
      resources: ["service"]

    - name: "Show Image"
      command: "echo Container image: ${spec.containers.0.image}"
      resources: ["pod"]
```

::: tip Syntax Difference
- Simple placeholders use `$name` syntax (e.g., `$context`, `$namespace`)
- Deep path placeholders use `${path}` syntax with braces (e.g., `${spec.virtualhost.fqdn}`)

This distinction avoids conflicts between the two placeholder types.
:::

### Resource Filtering

The `resources` field limits which resource types a command appears for:

```yaml
- name: "Pod-specific command"
  command: "..."
  resources: ["pod"]           # Only for pods

- name: "Deployment commands"
  command: "..."
  resources: ["deployment", "statefulset"]  # For deployments and statefulsets

- name: "Universal command"
  command: "..."
  # No resources field = available everywhere
```

## AI Assistant Configuration

Configure an AI coding assistant to help with Kubernetes operations. When configured, the button appears in the shortcuts bar with your custom name (or "AI" by default).

```yaml
ai:
  tool: cursor-agent    # Which AI tool to launch
  name: Agent           # Custom button label (default: "AI")
  readOnly: true        # Restrict kubectl to safe commands (default: true)
```

See more details in [AI Assistant][/features/ai-assistant].

### AI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tool` | string | (required) | AI tool: `cursor-agent`, `cursor`, `claude`, `augment`, or `codex` |
| `name` | string | `"AI"` | Custom button label (tooltip shows actual tool) |
| `readOnly` | boolean | `true` | Restrict kubectl to read-only commands |

### Supported Tools

| Tool | Config Value | Description |
|------|--------------|-------------|
| Cursor Agent | `cursor-agent` | Cursor's CLI agent (terminal-based) |
| Cursor IDE | `cursor` | Opens a new Cursor window |
| Claude Code | `claude` | Anthropic's Claude CLI |
| Augment | `augment` | Augment's auggie CLI |
| Codex | `codex` | OpenAI's Codex CLI |

::: tip Read-Only Mode
When `readOnly: true`, the AI can only use safe kubectl commands like `get`, `describe`, and `logs`. It cannot modify resources or switch to a different context/namespace. This is the recommended setting for production clusters.
:::

See [AI Assistant](/features/ai-assistant) for more details.

## Complete Example

```yaml
# Kubby Dashboard Configuration

readOnly: false
liveViewAutoRefresh: true
refreshRateSeconds: 2
metricsRefreshRateSeconds: 30
contextNamePattern: "^(?<env>[^-]+)-(?<region>[^-]+)-(?<cluster>.+)$"  # optional, shown for clarity

contexts:
  groups:
    - name: "Production"
      contexts:
        - group: "US East"
          contexts:
            - name: "prod-use1"
            - name: "prod-use2"
        - group: "US West"
          contexts:
            - name: "prod-usw2"
      namespaces:
        - group: "Core Services"
          namespaces:
            - name: "api-gateway"
            - name: "auth-service"
            - name: "user-service"
        - group: "Infrastructure"
          namespaces:
            - name: "monitoring"
            - name: "logging"

    - name: "Development"
      contexts:
        - group: "Dev"
          contexts:
            - name: "dev-cluster"
      namespaces:
        - name: "default"
        - name: "dev"
        - name: "staging"

resources:
  run:
    - name: "Debug with Busybox"
      command: "kubectl debug --context $context --namespace $namespace $name -it --image=busybox -- sh"
      resources: ["pod"]
    - name: "Network Debug Container"
      command: "kubectl run net-debug-$RANDOM --context $context --namespace $namespace --image=nicolaka/netshoot --restart=Never -it --rm -- /bin/bash"
      resources: ["pod"]
    - name: "Port Forward 8080:80"
      command: "kubectl port-forward --context $context --namespace $namespace $name 8080:80"

# AI Assistant (optional)
ai:
  tool: cursor-agent
  name: Agent
  readOnly: true
```

## Tips

::: tip Editing the Config
You can edit the configuration file directly with any text editor. Changes take effect after restarting Kubby.
:::

::: tip Read-Only Mode
Set `readOnly: true` for production clusters to prevent accidental modifications. This disables edit, delete, scale, and restart actions.
:::

::: tip Multiple Groups
Use multiple groups to separate environments (Production, Staging, Development) or teams in your organization.
:::

::: warning Context Names
Context names in the configuration must exactly match the names in your `~/.kube/config` file.
:::
