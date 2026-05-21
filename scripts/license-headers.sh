#!/bin/bash
# Add or update Apache 2.0 license headers in source files.
#
# Usage:
#   scripts/license-headers.sh           # add missing + replace outdated headers
#   scripts/license-headers.sh --check   # verify only; non-zero exit if drift
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BIN_DIR="$REPO_ROOT/bin"
CHECKER="$BIN_DIR/license-header-checker"
HEADER_FILE="$REPO_ROOT/LICENSE_HEADER.md"

# Source paths (recursively walked) and file extensions to cover.
SRC_PATHS=("src" "src-tauri/src" "e2e" "scripts" "docs/.vitepress")
EXTENSIONS=("ts" "tsx" "js" "jsx" "rs" "scss")
IGNORE="node_modules,dist,target,gen,docs/.vitepress/cache,docs/.vitepress/dist,bin"

if [ ! -f "$HEADER_FILE" ]; then
  echo "Error: $HEADER_FILE not found" >&2
  exit 1
fi

if [ ! -x "$CHECKER" ]; then
  echo "Installing license-header-checker into $BIN_DIR..."
  mkdir -p "$BIN_DIR"
  curl -fsSL https://raw.githubusercontent.com/lluissm/license-header-checker/master/install.sh \
    | bash -s -- v1.5.0 >/dev/null
  if [ ! -x "$CHECKER" ]; then
    echo "Error: install.sh did not produce $CHECKER" >&2
    exit 1
  fi
fi

MODE="apply"
if [ "${1:-}" = "--check" ]; then
  MODE="check"
fi

# Build flags. -a adds missing, -r replaces outdated. In check mode we still
# pass -a -r but pipe to a temp dir copy via dry-run-style verification: the
# tool has no native dry-run, so we rely on `git diff` after running.
FLAGS=("-a" "-r" "-i" "$IGNORE")

run_checker_on() {
  local src="$1"
  if [ ! -d "$src" ]; then
    return 0
  fi
  "$CHECKER" "${FLAGS[@]}" "$HEADER_FILE" "$src" "${EXTENSIONS[@]}" >/dev/null
}

for src in "${SRC_PATHS[@]}"; do
  run_checker_on "$src"
done

if [ "$MODE" = "check" ]; then
  if ! git diff --quiet -- "${SRC_PATHS[@]}" 2>/dev/null; then
    echo "Error: license headers are missing or outdated. Run 'make license' and commit." >&2
    git --no-pager diff --stat -- "${SRC_PATHS[@]}" >&2 || true
    exit 1
  fi
  echo "License headers OK."
else
  echo "License headers applied."
fi
