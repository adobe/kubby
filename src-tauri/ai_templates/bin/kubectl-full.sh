#!/bin/bash
# Kubby kubectl pass-through wrapper
# This script simply passes all arguments to the real kubectl

# Find the real kubectl
REAL_KUBECTL=""
for dir in /usr/local/bin /opt/homebrew/bin /usr/bin /opt/local/bin /snap/bin; do
    if [[ -x "$dir/kubectl" ]]; then
        REAL_KUBECTL="$dir/kubectl"
        break
    fi
done

if [[ -z "$REAL_KUBECTL" ]]; then
    echo "Error: kubectl not found" >&2
    exit 1
fi

exec "$REAL_KUBECTL" "$@"
