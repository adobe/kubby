# Kubby

Kubernetes App to Manage Clusters.

## Setup

Follow up Tauri prerequisites docs: https://v2.tauri.app/start/prerequisites/#macos.

After cloning, run the setup script to configure git hooks:

```sh
./scripts/setup-hooks.sh
```

This enables automatic version bumping on each commit (semver).

## Dev

```sh
pnpm tauri dev
# or:
make dev
```

## Build 

```sh
pnpm tauri build
# or:
make build
# and clean build artifacts:
make clean     
```

## Release

Build, tag, and publish to GitHub:
```sh
make release
```
