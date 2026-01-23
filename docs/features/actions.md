# Actions

Kubby provides quick actions for common Kubernetes operations, accessible via keyboard shortcuts or the action bar.

## Overview

Actions let you perform operations on resources without writing kubectl commands. 
Each action is designed to be fast, safe, and provide clear feedback.

<!-- TODO: Add actions bar screenshot -->
<!-- ![Actions Bar](../public/images/actions-bar.png) -->

## Available Actions

### Scale

**Shortcut:** `S` (on Deployments)

Adjust the number of replicas for a deployment:

1. Press `S` on a deployment
2. Enter the desired replica count
3. Confirm to apply

<!-- TODO: Add scale modal screenshot -->
<!-- ![Scale Modal](../public/images/scale-modal.png) -->

The scale dialog shows:
- Current replica count
- HorizontalPodScalers, PodDisruptionBudgets if found 
- Input for new replica count as well for related resources

### Rolling Restart

**Shortcut:** `R` (on Deployments)

Perform a rolling restart of all pods in a deployment:

1. Press `R` on a deployment
2. Review the confirmation and information:
   1. related HorizontalPodScaler and PodDisruptionBudget if found
   2. current status summary
3. Confirm to initiate restart

<!-- TODO: Add rolling restart screenshot -->
<!-- ![Rolling Restart](../public/images/rolling-restart.png) -->

### Edit

**Shortcut:** `E`

Edit any resource's YAML definition:

1. Press `E` on a resource
2. Your configured editor opens with the resource YAML
3. Make changes and save
4. Close the editor to apply changes

::: tip Editor Configuration
Kubby uses your system's default editor. Set the `KUBE_EDITOR` or `EDITOR` environment variable to customize.
:::

### Delete

**Shortcut:** `Del`

Delete a resource from the cluster:

1. Press `Del` on a resource
2. Review the confirmation dialog
3. Confirm deletion

<!-- TODO: Add delete confirmation screenshot -->
<!-- ![Delete Confirmation](../public/images/delete-confirm.png) -->

::: warning Destructive Action
Deletion is permanent. Always verify you're deleting the correct resource.
:::

### Describe

**Shortcut:** `D`

View detailed information about a resource:

1. Press `D` on any resource
2. Opens the Resource Detail view
3. Shows full resource specification and status

### View Logs

**Shortcut:** `L`

Stream logs from pods or containers:

1. Press `L` on a pod, deployment, or container
2. Opens the Log Viewer
3. Logs stream in real-time

### Port Forward

**Shortcut:** `F`

Create a tunnel to access pods or services locally:

1. Press `F` on a pod, container, or service
2. Select the port to forward
3. Enter a local port (or accept the default)
4. Confirm to start the forward

Press `F` again to see opened ports and remove them. 

# Shell Access

Shell Access lets you open interactive terminal sessions directly into containers running in your cluster.

Access Shell by pressing `S` on a pod or container. 
This opens an external terminal with a session inside the container, equivalent to `kubectl exec -it`.

<!-- TODO: Add shell screenshot -->
<!-- ![Shell Access](../public/images/shell.png) -->

::: tip Minimal Images
Many production containers use minimal base images without debugging tools. 
Consider using [ephemeral debug containers](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/#ephemeral-container) 
for advanced debugging.
Kubby supports custom run command you can use them to launch any image, 
see [Custom Run Commands](/configuration#custom-run-commands) in configuration for more details.
:::

### Jump

**Shortcut:** `J`

Navigate to related resources:

1. Press `J` on a resource with related items
2. Select from the dropdown (e.g., Pods for a Deployment)
3. View opens filtered to related resources

### Run Custom Command

**Shortcut:** `U` (when available)

Execute custom commands defined for specific resource types:

1. Press `U` on a resource with custom commands
2. Select from available commands
3. Command executes against the resource

The custom commands can be configured in [Kubby config](/configuration). 

### AI Agent

See [AI Assistant Command](/features/ai-assistant).


## Action Bar

The action bar at the bottom of the screen shows available actions for the currently selected resource. 
Actions vary by resource type:

| Resource   | Available Actions                                                   |
|------------|---------------------------------------------------------------------|
| Deployment | Pods, Describe, Edit, Jump, Logs, Rolling Restart, Scale, Delete    |
| Pod        | Containers, Describe, Edit, Jump, Logs, Port-Forward, Shell, Delete |
| Service    | Pods, Describe, Edit, Jump, Port-Forward, Delete                    |
| ConfigMap  | Describe, Edit, Jump, Delete                                        |
| Secret     | Describe, Edit, Jump, Delete                                        |
| Other      | Describe, Delete                                                    |

## Safety Features

### Confirmation Dialogs

Destructive actions require confirmation.

### Read-Only Mode

Usefully for when connected to production or sensitive clusters:
- Modifying actions can be disabled
- Visual indicators show read-only state
- Prevents accidental changes

Can be configured in [Kubby config](/configuration).
