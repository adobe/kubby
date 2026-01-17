# Getting Started

This guide will help you install Kubby and connect to your first Kubernetes cluster.

## Prerequisites

Before using Kubby, ensure you have:

- **kubectl** installed and configured on your system
- At least one Kubernetes cluster configured in your `~/.kube/config`
- macOS 11 (Big Sur) or later

## Installation

### Download

Download the latest release from the [GitHub Releases](https://github.com/OneAdobe/kubby/releases) page.

1. Download the `.dmg` file for your Mac
2. Open the DMG and drag Kubby to your Applications folder
3. Launch Kubby from Applications

::: tip First Launch on macOS
On first launch, you may need to right-click the app and select "Open" to bypass Gatekeeper, since the app is not notarized.
:::

## Initial Setup

When you first launch Kubby, it will attempt to automatically detect your kubectl configuration 
and read all the contexts. Then for each of the contexts Kubby will also try to fetch the namespaces. 
This may fail if you do not have sufficient access rights, however you can still save a config file and edit it later.

<!-- TODO: Add onboarding screenshot -->
<!-- ![Onboarding Screen](./public/images/onboarding.png) -->

## Your First Steps

Once connected, you'll see the **Dashboard** view showing a list of all clusters (contexts) and namespaces.
Kubby is optimized for managing a large number of clusters, 
on the Dashboard it shows a searchable list of clusters and namespaces.

### Try These Actions

1. **Navigate the Dashboard**: Use `Tab` to move between resource tables, arrow keys to select items.
2. **View Deployments**: Press `Enter` to see the deployments for a specific context and namespace.
3. **View Pods**: Press `Enter` again on a deployment to see the pods for that deployment.
4. **Check Logs**: Select a pod and press `L` to view logs from all containers in that pod.
5. **Describe a Resource**: Press `D` on any resource to see detailed information.

## Next Steps

- Learn about all [Features](/features/)
- Master the [Keyboard Shortcuts](/shortcuts)
- Understand [Navigation](/navigation) patterns
