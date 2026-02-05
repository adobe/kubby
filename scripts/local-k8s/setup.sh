#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_NAME="stellar-local"
KUBECONFIG_FILE="$SCRIPT_DIR/config/kubeconfig.yaml"

echo "=========================================="
echo "  Stellar Local Kubernetes Setup"
echo "=========================================="

# Check prerequisites
echo ""
echo "Checking prerequisites..."

if ! command -v minikube &> /dev/null; then
    echo "Error: minikube is not installed. Please install it first."
    echo "  brew install minikube"
    exit 1
fi

if ! command -v helm &> /dev/null; then
    echo "Error: helm is not installed. Please install it first."
    echo "  brew install helm"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed. Please install it first."
    echo "  brew install kubectl"
    exit 1
fi

echo "All prerequisites satisfied."

# Start minikube
echo ""
echo "Starting minikube cluster '$PROFILE_NAME'..."
if minikube status -p "$PROFILE_NAME" &> /dev/null; then
    echo "Minikube cluster '$PROFILE_NAME' is already running."
else
    minikube start -p "$PROFILE_NAME" --memory=4096 --cpus=2 --driver=docker
fi

# Set kubectl context
echo ""
echo "Setting kubectl context..."
kubectl config use-context "$PROFILE_NAME"

# Install HTTPProxy CRD
echo ""
echo "Installing Contour HTTPProxy CRD..."
kubectl apply -f "$SCRIPT_DIR/crds/httpproxy-crd.yaml"

# Create namespaces
echo ""
echo "Creating namespaces..."
NAMESPACES=(
    "ns-team-stellar-graph-api"
    "ns-team-stellar-operations"
    "ns-team-stellar-metadata-management"
    "ns-team-stellar-namespace-api"
    "ns-team-stellar-workflow-orchestrator"
    "ns-team-tenant-stellar-observability-api"
    "stellar-identity-alpha-live"
    "stellar-identity-beta-live"
    "stellar-identity-alpha-preview"
    "monitoring"
    "ingress-controllers"
)

for ns in "${NAMESPACES[@]}"; do
    if kubectl get namespace "$ns" &> /dev/null; then
        echo "  Namespace '$ns' already exists."
    else
        kubectl create namespace "$ns"
        kubectl label namespace "$ns" name="$ns" --overwrite
        echo "  Created namespace '$ns'."
    fi
done

# Deploy sample workloads
echo ""
echo "Deploying sample workloads..."

# Deploy to ns-team-stellar-graph-api
echo "  Deploying graph-api to ns-team-stellar-graph-api..."
helm upgrade --install graph-api "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-graph-api \
    --set replicaCount=3 \
    --set fullnameOverride=graph-api \
    --set httpProxy.fqdn=graph-api.stellar.local \
    --wait

# Deploy to ns-team-stellar-operations
echo "  Deploying operations-api to ns-team-stellar-operations..."
helm upgrade --install operations-api "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-operations \
    --set replicaCount=2 \
    --set fullnameOverride=operations-api \
    --set httpProxy.fqdn=operations-api.stellar.local \
    --wait

# Deploy to ns-team-stellar-workflow-orchestrator
echo "  Deploying workflow-worker to ns-team-stellar-workflow-orchestrator..."
helm upgrade --install workflow-worker "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-workflow-orchestrator \
    --set replicaCount=2 \
    --set fullnameOverride=workflow-worker \
    --set httpProxy.fqdn=workflow.stellar.local \
    --set logInterval=5 \
    --wait

# Deploy to stellar-identity-alpha-live
echo "  Deploying identity-resolver to stellar-identity-alpha-live..."
helm upgrade --install identity-resolver "$SCRIPT_DIR/charts/stellar-service" \
    --namespace stellar-identity-alpha-live \
    --set replicaCount=3 \
    --set fullnameOverride=identity-resolver \
    --set httpProxy.fqdn=identity.stellar.local \
    --wait

# Deploy to ns-team-stellar-metadata-management
echo "  Deploying metadata-api to ns-team-stellar-metadata-management..."
helm upgrade --install metadata-api "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-metadata-management \
    --set replicaCount=2 \
    --set fullnameOverride=metadata-api \
    --set httpProxy.fqdn=metadata.stellar.local \
    --wait

# Generate kubeconfig with multiple contexts
echo ""
echo "Generating kubeconfig with multiple contexts..."

# Get minikube cluster info - use the actual server URL from kubectl config (handles Docker driver port forwarding)
MINIKUBE_SERVER=$(kubectl config view --raw -o jsonpath='{.clusters[?(@.name=="'$PROFILE_NAME'")].cluster.server}')
MINIKUBE_CA=$(kubectl config view --raw -o jsonpath='{.clusters[?(@.name=="'$PROFILE_NAME'")].cluster.certificate-authority}')
MINIKUBE_CLIENT_CERT=$(kubectl config view --raw -o jsonpath='{.users[?(@.name=="'$PROFILE_NAME'")].user.client-certificate}')
MINIKUBE_CLIENT_KEY=$(kubectl config view --raw -o jsonpath='{.users[?(@.name=="'$PROFILE_NAME'")].user.client-key}')

# Read the actual certificate data
CA_DATA=$(cat "$MINIKUBE_CA" | base64)
CLIENT_CERT_DATA=$(cat "$MINIKUBE_CLIENT_CERT" | base64)
CLIENT_KEY_DATA=$(cat "$MINIKUBE_CLIENT_KEY" | base64)

echo "  Using server: $MINIKUBE_SERVER"

cat > "$KUBECONFIG_FILE" << EOF
apiVersion: v1
kind: Config
preferences: {}

clusters:
  # Nebula clusters (simulated)
  - name: live-alpha-nebula237-live-alpha
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-beta-nebula12-live-beta
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-gamma-nebula24-live-gamma
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-delta-nebula08-live-delta
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-epsilon-nebula14-live-epsilon
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-zeta-nebula07-live-zeta
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-eta-nebula15-live-eta
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-theta-nebula10-live-theta
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: preview-alpha-nebula27-preview-alpha
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: sandbox-alpha-nebula24-sandbox-alpha
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}

  # Cosmos clusters (simulated)
  - name: live-alpha-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-alpha-cosmos-1
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-beta-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-beta-cosmos-1
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-gamma-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: preview-alpha-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}

users:
  - name: stellar-user
    user:
      client-certificate-data: ${CLIENT_CERT_DATA}
      client-key-data: ${CLIENT_KEY_DATA}

contexts:
  # Nebula contexts
  - name: live-alpha-nebula237-live-alpha
    context:
      cluster: live-alpha-nebula237-live-alpha
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-beta-nebula12-live-beta
    context:
      cluster: live-beta-nebula12-live-beta
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-gamma-nebula24-live-gamma
    context:
      cluster: live-gamma-nebula24-live-gamma
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-delta-nebula08-live-delta
    context:
      cluster: live-delta-nebula08-live-delta
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-epsilon-nebula14-live-epsilon
    context:
      cluster: live-epsilon-nebula14-live-epsilon
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-zeta-nebula07-live-zeta
    context:
      cluster: live-zeta-nebula07-live-zeta
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-eta-nebula15-live-eta
    context:
      cluster: live-eta-nebula15-live-eta
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: live-theta-nebula10-live-theta
    context:
      cluster: live-theta-nebula10-live-theta
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: preview-alpha-nebula27-preview-alpha
    context:
      cluster: preview-alpha-nebula27-preview-alpha
      user: stellar-user
      namespace: ns-team-stellar-graph-api
  - name: sandbox-alpha-nebula24-sandbox-alpha
    context:
      cluster: sandbox-alpha-nebula24-sandbox-alpha
      user: stellar-user
      namespace: ns-team-stellar-graph-api

  # Cosmos contexts
  - name: live-alpha-cosmos-0
    context:
      cluster: live-alpha-cosmos-0
      user: stellar-user
      namespace: stellar-identity-alpha-live
  - name: live-alpha-cosmos-1
    context:
      cluster: live-alpha-cosmos-1
      user: stellar-user
      namespace: stellar-identity-alpha-live
  - name: live-beta-cosmos-0
    context:
      cluster: live-beta-cosmos-0
      user: stellar-user
      namespace: stellar-identity-beta-live
  - name: live-beta-cosmos-1
    context:
      cluster: live-beta-cosmos-1
      user: stellar-user
      namespace: stellar-identity-beta-live
  - name: live-gamma-cosmos-0
    context:
      cluster: live-gamma-cosmos-0
      user: stellar-user
      namespace: stellar-identity-alpha-live
  - name: preview-alpha-cosmos-0
    context:
      cluster: preview-alpha-cosmos-0
      user: stellar-user
      namespace: stellar-identity-alpha-preview

current-context: live-alpha-nebula237-live-alpha
EOF

echo "Kubeconfig generated at: $KUBECONFIG_FILE"

# Summary
echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To use with kubby, run:"
echo ""
echo "  export KUBECONFIG=\"$KUBECONFIG_FILE\""
echo "  export KUBBY_CONFIG=\"$SCRIPT_DIR/config/kubby_config.yaml\""
echo "  kubby"
echo ""
echo "Or run with cargo:"
echo ""
echo "  KUBECONFIG=\"$KUBECONFIG_FILE\" KUBBY_CONFIG=\"$SCRIPT_DIR/config/kubby_config.yaml\" cargo tauri dev"
echo ""
echo "Deployed workloads:"
echo "  - graph-api (3 replicas) in ns-team-stellar-graph-api"
echo "  - operations-api (2 replicas) in ns-team-stellar-operations"
echo "  - workflow-worker (2 replicas) in ns-team-stellar-workflow-orchestrator"
echo "  - identity-resolver (3 replicas) in stellar-identity-alpha-live"
echo "  - metadata-api (2 replicas) in ns-team-stellar-metadata-management"
echo ""
echo "To tear down: ./scripts/local-k8s/teardown.sh"
