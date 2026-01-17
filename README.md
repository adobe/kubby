# Kubby

<img src="docs/public/images/light/kubby_banner.png" height="192" alt="Kubby Logo"/>

A fast, keyboard-driven desktop app for managing Kubernetes clusters.

## User Documentation

## Development

### Setup

Follow up Tauri prerequisites docs: https://v2.tauri.app/start/prerequisites/#macos.

After cloning, run the setup script to configure git hooks:

```sh
./scripts/setup-hooks.sh
```

This enables automatic version bumping on each commit (semver).

### Dev

```sh
pnpm tauri dev
# or:
make dev
# for docs:
make docs-dev
```

### Build 

```sh
pnpm tauri build
# or:
make build
# for docs:
make docs
make docs-preview
# and clean build artifacts:
make clean     
```

### Release

Build, tag, and publish to GitHub:
```sh
make release
```
