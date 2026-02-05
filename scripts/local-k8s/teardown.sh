#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_NAME="stellar-local"
KUBECONFIG_FILE="$SCRIPT_DIR/config/kubeconfig.yaml"

echo "=========================================="
echo "  Stellar Local Kubernetes Teardown"
echo "=========================================="

# Delete minikube cluster
echo ""
echo "Deleting minikube cluster '$PROFILE_NAME'..."
if minikube status -p "$PROFILE_NAME" &> /dev/null; then
    minikube delete -p "$PROFILE_NAME"
    echo "Minikube cluster '$PROFILE_NAME' deleted."
else
    echo "Minikube cluster '$PROFILE_NAME' is not running."
fi

# Clean up generated kubeconfig
echo ""
echo "Cleaning up generated files..."
if [ -f "$KUBECONFIG_FILE" ]; then
    rm "$KUBECONFIG_FILE"
    echo "Removed $KUBECONFIG_FILE"
else
    echo "No kubeconfig file to remove."
fi

echo ""
echo "=========================================="
echo "  Teardown Complete!"
echo "=========================================="
