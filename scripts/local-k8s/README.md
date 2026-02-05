# Local Kubernetes Testing Environment

A minikube-based local Kubernetes testing environment for kubby development and screenshots.

## Prerequisites

- [minikube](https://minikube.sigs.k8s.io/docs/start/)
- [helm](https://helm.sh/docs/intro/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Docker (as minikube driver)

```bash
# macOS
brew install minikube helm kubectl
```

## Quick Start

```bash
# Start the local environment
./scripts/local-k8s/setup.sh

# Use with kubby
export KUBECONFIG="$PWD/scripts/local-k8s/config/kubeconfig.yaml"
export KUBBY_CONFIG="$PWD/scripts/local-k8s/config/kubby_config.yaml"
kubby

# Or with cargo for development
KUBECONFIG="$PWD/scripts/local-k8s/config/kubeconfig.yaml" \
KUBBY_CONFIG="$PWD/scripts/local-k8s/config/kubby_config.yaml" \
cargo tauri dev

# Tear down when done
./scripts/local-k8s/teardown.sh
```

## What's Included

### Clusters/Contexts

Multiple simulated cluster contexts pointing to the same minikube cluster:

| Platform | Contexts |
|----------|----------|
| Nebula | `live-alpha-nebula237-live-alpha`, `live-beta-nebula12-live-beta`, `preview-alpha-nebula27-preview-alpha`, etc. |
| Cosmos | `live-alpha-cosmos-0`, `live-beta-cosmos-0`, `preview-alpha-cosmos-0`, etc. |

### Namespaces

- `ns-team-stellar-graph-api`
- `ns-team-stellar-operations`
- `ns-team-stellar-metadata-management`
- `ns-team-stellar-namespace-api`
- `ns-team-stellar-workflow-orchestrator`
- `stellar-identity-alpha-live`
- `monitoring`
- `ingress-controllers`

### Deployed Workloads

| Namespace | Release | Replicas |
|-----------|---------|----------|
| `ns-team-stellar-graph-api` | graph-api | 3 |
| `ns-team-stellar-operations` | operations-api | 2 |
| `ns-team-stellar-workflow-orchestrator` | workflow-worker | 2 |
| `stellar-identity-alpha-live` | identity-resolver | 3 |
| `ns-team-stellar-metadata-management` | metadata-api | 2 |

Each deployment includes:
- Deployment with busybox containers generating realistic logs
- Service (ClusterIP)
- ConfigMap
- Secret
- NetworkPolicy
- HTTPProxy (Contour CRD)

## Files

```
scripts/local-k8s/
├── setup.sh                    # Main setup script
├── teardown.sh                 # Cleanup script
├── README.md                   # This file
├── config/
│   ├── kubeconfig.yaml         # Generated kubeconfig (after setup)
│   └── kubby_config.yaml       # Kubby configuration
├── charts/
│   └── stellar-service/        # Sample Helm chart
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── _helpers.tpl
│           ├── configmap.yaml
│           ├── deployment.yaml
│           ├── httpproxy.yaml
│           ├── networkpolicy.yaml
│           ├── secret.yaml
│           └── service.yaml
└── crds/
    └── httpproxy-crd.yaml      # Contour HTTPProxy CRD
```

## Naming Scheme

This environment uses anonymized names based on a space/astronomy theme:

| Category | Pattern |
|----------|---------|
| Platforms | Nebula, Cosmos |
| Regions | alpha, beta, gamma, delta, epsilon, zeta, eta, theta |
| Environments | live, preview, sandbox |
| Team | stellar |
