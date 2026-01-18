# Kubby

<img src="docs/public/images/light/kubby_banner.png" height="192" alt="Kubby Logo"/>

A fast, keyboard-driven desktop app for managing Kubernetes clusters.

## User Documentation

User documentation is only available on dev for now. Run:
```sh
make docs && make docs-preview
```

### External Dependencies

Kubby requires `kubectl` to be installed on your system. The app searches for kubectl in common locations:
- `/usr/local/bin/kubectl`
- `/opt/homebrew/bin/kubectl` (Apple Silicon)
- `/usr/bin/kubectl`
- `~/.local/bin/kubectl`
- User's shell `PATH`

### Environment Variables

The following environment variables are read from your shell configuration (`.bashrc`, `.zshrc`, etc.):

| Variable | Description |
|----------|-------------|
| `KUBECONFIG` | Path to kubeconfig file(s). Supports non-standard locations and multiple configs. |
| `KUBE_EDITOR` | Preferred editor for `kubectl edit` operations. |
| `EDITOR` | Fallback editor if `KUBE_EDITOR` is not set. |
| `TERMINAL` | Preferred terminal emulator (macOS/Linux). Falls back to iTerm/Terminal.app on macOS. |
| `PATH` | Used to locate `kubectl` and editor executables. |

**Note:** Packaged apps don't inherit shell environment by default. Kubby reads these from your login shell to ensure consistent behavior between development and installed versions.

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
