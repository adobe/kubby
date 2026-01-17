---
layout: home

hero:
  name: Kubby
  text: Kubernetes Cluster Manager
  tagline: A fast, keyboard-driven desktop app for managing Kubernetes clusters
  image:
    src: /images/dark/kubby_banner.png
    alt: Kubby Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View Features
      link: /features/

features:
  - icon:
      light: images/light/jet-fighter-solid-full.svg
      dark: images/dark/jet-fighter-solid-full.svg
    title: Fast & Native
    details: Native performance with view caching for quick navigation. Instant startup and responsive UI.
  - icon:
      light: images/light/keyboard-solid-full.svg
      dark: images/dark/keyboard-solid-full.svg
    title: Keyboard-First
    details: Rich UI with keyboard-first navigation. Comprehensive keyboard shortcuts inspired by k9s.
  - icon:
      light: images/light/cubes-solid-full.svg
      dark: images/dark/cubes-solid-full.svg
    title: Multi-Cluster Support
    details: Fast navigation to any cluster and namespace from startup screen, even without rights for namespace listing. Preserve the current resource view when switching between contexts and namespaces.
  - icon:
      light: images/light/scroll-solid-full.svg
      dark: images/dark/scroll-solid-full.svg
    title: Live Logs and Details
    details: Stream logs in real-time with powerful filtering and syntax highlighting.
  - icon:
      light: images/light/plug-circle-bolt-solid-full.svg
      dark: images/dark/plug-circle-bolt-solid-full.svg
    title: Actions
    details: Easily perform actions such as scale, rolling restarts and manage port forwards to pods and services.
  - icon:
      light: images/light/terminal-solid-full.svg
      dark: images/dark/terminal-solid-full.svg
    title: Shell-Out
    details: Open shell windows. Configurable run commands with current context placeholder replacement.
---

## What is Kubby?

Kubby is a desktop application for managing a flotilla Kubernetes clusters.
It provides a fast, intuitive interface for common Kubernetes operations without requiring you to remember complex
`kubectl` commands. Under the hoods it executed `kubectl` with your local configuration. 
Kubby is heavily influenced by [k9s](https://k9scli.io/) with some enhancements that makes it easier to work in
more restricted setups and richer UI for logs and resource details.

### Why Kubby?

- **Visual & Keyboard**: See your cluster resources at a glance while preserving keyboard-first navigation
- **Quick Actions**: Perform common operations like scaling, restarting, and editing with single keystrokes
- **Real-time Updates**: Watch resources update live as changes occur in your cluster
- **Rich UI**: Compact view of resources with full details when needed

[//]: # (![Kubby Screenshot]&#40;/images/hero-screenshot.png&#41;)
