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

# Enable metrics-server addon (required for kubectl top / Metrics API)
echo ""
echo "Enabling metrics-server addon..."
minikube addons enable metrics-server -p "$PROFILE_NAME"

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
    "ns-team-stellar-domains"
    "ns-team-stellar-operations"
    "ns-team-stellar-data-stores"
    "ns-team-stellar-schema-services"
    "ns-team-stellar-workflow-schedulers"
    "ns-team-tenant-stellar-observability"
    "stellar-web-kappa-live"
    "stellar-web-gamma-live"
    "stellar-web-omicron-live"
    "stellar-web-kappa-preview"
    "global-monitoring"
    "global-proxy-controllers"
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

# Deploy to ns-team-stellar-domains
echo "  Deploying domains-api-service to ns-team-stellar-domains..."
helm upgrade --install domains-api-service "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-domains \
    --set replicaCount=3 \
    --set fullnameOverride=domains-api-service \
    --set httpProxy.fqdn=domains-api-service.stellar.local \
    --wait

echo "  Deploying domains-api-service to ns-team-stellar-domains..."
helm upgrade --install domains-backend-service "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-domains \
    --set replicaCount=8 \
    --set fullnameOverride=domains-backend-service \
    --set httpProxy.fqdn=domains-backend-service.stellar.local \
    --wait

# Deploy to ns-team-stellar-operations
echo "  Deploying prometheus-service to ns-team-stellar-operations..."
helm upgrade --install prometheus-service "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-operations \
    --set replicaCount=2 \
    --set fullnameOverride=prometheus-service \
    --set httpProxy.fqdn=prometheus-service.stellar.local \
    --wait

echo "  Deploying grafana-service to ns-team-stellar-operations..."
helm upgrade --install grafana-service "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-operations \
    --set replicaCount=1 \
    --set fullnameOverride=grafana-service \
    --set httpProxy.fqdn=grafana-service.stellar.local \
    --wait

# Deploy to ns-team-stellar-workflow-schedulers
echo "  Deploying workflow-scheduler-worker to ns-team-stellar-workflow-schedulers..."
helm upgrade --install workflow-scheduler-worker "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-workflow-schedulers \
    --set replicaCount=6 \
    --set fullnameOverride=workflow-scheduler-worker \
    --set httpProxy.fqdn=workflow.stellar.local \
    --set logInterval=5 \
    --wait

echo "  Deploying workflow-scheduler-coordinator to ns-team-stellar-workflow-schedulers..."
helm upgrade --install workflow-scheduler-coordinator "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-workflow-schedulers \
    --set replicaCount=1 \
    --set fullnameOverride=workflow-scheduler-coordinator \
    --set httpProxy.fqdn=workflow.stellar.local \
    --set logInterval=5 \
    --set image.repository=notabox \
    --set image.tag=1.2.3
    # Wrong image name is intentional, so we can test agent
    # Do not wait, because the idea is it will fail, because of wrong image name

# Deploy to stellar-web-gamma-live
echo "  Deploying schema-resolver-service to stellar-web-gamma-live..."
helm upgrade --install schema-resolver-service "$SCRIPT_DIR/charts/stellar-service" \
    --namespace stellar-web-gamma-live \
    --set replicaCount=3 \
    --set fullnameOverride=schema-resolver-service \
    --set httpProxy.fqdn=identity.stellar.local \
    --wait

# Deploy to ns-team-stellar-data-stores
echo "  Deploying schema-db to ns-team-stellar-data-stores..."
helm upgrade --install schema-db "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-data-stores \
    --set replicaCount=3 \
    --set fullnameOverride=schema-db \
    --set httpProxy.fqdn=metadata.stellar.local \
    --wait

echo "  Deploying domain-db to ns-team-stellar-data-stores..."
helm upgrade --install domain-db "$SCRIPT_DIR/charts/stellar-service" \
    --namespace ns-team-stellar-data-stores \
    --set replicaCount=5 \
    --set fullnameOverride=domain-db \
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
  - name: live-kappa-nebula237-live-kappa
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-omicron-nebula12-live-omicron
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
  - name: preview-kappa-nebula27-preview-kappa
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: sandbox-kappa-nebula24-sandbox-kappa
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}

  # Cosmos clusters (simulated)
  - name: live-kappa-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-kappa-cosmos-1
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-omicron-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-omicron-cosmos-1
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: live-gamma-cosmos-0
    cluster:
      server: ${MINIKUBE_SERVER}
      certificate-authority-data: ${CA_DATA}
  - name: preview-kappa-cosmos-0
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
  - name: live-kappa-nebula237-live-kappa
    context:
      cluster: live-kappa-nebula237-live-kappa
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-omicron-nebula12-live-omicron
    context:
      cluster: live-omicron-nebula12-live-omicron
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-gamma-nebula24-live-gamma
    context:
      cluster: live-gamma-nebula24-live-gamma
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-delta-nebula08-live-delta
    context:
      cluster: live-delta-nebula08-live-delta
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-epsilon-nebula14-live-epsilon
    context:
      cluster: live-epsilon-nebula14-live-epsilon
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-zeta-nebula07-live-zeta
    context:
      cluster: live-zeta-nebula07-live-zeta
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-eta-nebula15-live-eta
    context:
      cluster: live-eta-nebula15-live-eta
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: live-theta-nebula10-live-theta
    context:
      cluster: live-theta-nebula10-live-theta
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: preview-kappa-nebula27-preview-kappa
    context:
      cluster: preview-kappa-nebula27-preview-kappa
      user: stellar-user
      namespace: ns-team-stellar-domains
  - name: sandbox-kappa-nebula24-sandbox-kappa
    context:
      cluster: sandbox-kappa-nebula24-sandbox-kappa
      user: stellar-user
      namespace: ns-team-stellar-domains

  # Cosmos contexts
  - name: live-kappa-cosmos-0
    context:
      cluster: live-kappa-cosmos-0
      user: stellar-user
      namespace: stellar-web-kappa-live
  - name: live-kappa-cosmos-1
    context:
      cluster: live-kappa-cosmos-1
      user: stellar-user
      namespace: stellar-web-kappa-live
  - name: live-omicron-cosmos-0
    context:
      cluster: live-omicron-cosmos-0
      user: stellar-user
      namespace: stellar-web-omicron-live
  - name: live-omicron-cosmos-1
    context:
      cluster: live-omicron-cosmos-1
      user: stellar-user
      namespace: stellar-web-omicron-live
  - name: live-gamma-cosmos-0
    context:
      cluster: live-gamma-cosmos-0
      user: stellar-user
      namespace: stellar-web-gamma-live
  - name: preview-kappa-cosmos-0
    context:
      cluster: preview-kappa-cosmos-0
      user: stellar-user
      namespace: stellar-web-kappa-preview

current-context: live-kappa-nebula237-live-kappa
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
echo "  KUBECONFIG=\"$KUBECONFIG_FILE\" KUBBY_CONFIG=\"$SCRIPT_DIR/config/kubby_config.yaml\" pnpm tauri dev"
echo ""
echo "To tear down: ./scripts/local-k8s/teardown.sh"
