#!/bin/bash
# Kubby read-only kubectl wrapper
# This script restricts kubectl to read-only operations

# Find the real kubectl (skip this wrapper)
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

# Read-only subcommands allow-list
READONLY_COMMANDS=(
    "get"
    "describe"
    "logs"
    "explain"
    "top"
    "api-resources"
    "api-versions"
    "cluster-info"
    "version"
    "auth"
    "diff"
)

# Allowed config subcommands
READONLY_CONFIG_COMMANDS=(
    "view"
    "get-contexts"
    "current-context"
    "use-context"
    "set-context"
    "set"
    "delete-context"
    "rename-context"
)

# Blocked config subcommands (would modify cluster/credentials config)
BLOCKED_CONFIG_COMMANDS=(
    "set-cluster"
    "delete-cluster"
    "set-credentials"
    "delete-user"
)

# Parse arguments to extract subcommand and flags
SUBCOMMAND=""
CONFIG_SUBCOMMAND=""
CONTEXT_FLAG=""
NAMESPACE_FLAG=""
IN_CONFIG=false
ARGS=("$@")

for i in "${!ARGS[@]}"; do
    arg="${ARGS[$i]}"
    
    # Skip flags to find subcommand
    case "$arg" in
        --context)
            CONTEXT_FLAG="${ARGS[$((i+1))]}"
            ;;
        --context=*)
            CONTEXT_FLAG="${arg#--context=}"
            ;;
        -n|--namespace)
            NAMESPACE_FLAG="${ARGS[$((i+1))]}"
            ;;
        --namespace=*)
            NAMESPACE_FLAG="${arg#--namespace=}"
            ;;
        -n=*)
            NAMESPACE_FLAG="${arg#-n=}"
            ;;
        -*)
            # Skip other flags
            ;;
        *)
            if [[ -z "$SUBCOMMAND" ]]; then
                SUBCOMMAND="$arg"
                if [[ "$SUBCOMMAND" == "config" ]]; then
                    IN_CONFIG=true
                fi
            elif $IN_CONFIG && [[ -z "$CONFIG_SUBCOMMAND" ]]; then
                CONFIG_SUBCOMMAND="$arg"
            fi
            ;;
    esac
done

# Handle config subcommands
if [[ "$SUBCOMMAND" == "config" ]]; then
    # Check if it's a blocked config command
    for blocked in "${BLOCKED_CONFIG_COMMANDS[@]}"; do
        if [[ "$CONFIG_SUBCOMMAND" == "$blocked" ]]; then
            echo "BLOCKED: 'kubectl config $CONFIG_SUBCOMMAND' is not allowed in read-only mode." >&2
            echo "This would modify the Kubernetes configuration." >&2
            exit 1
        fi
    done
    
    # Check if it's an allowed config command
    ALLOWED=false
    for allowed in "${READONLY_CONFIG_COMMANDS[@]}"; do
        if [[ "$CONFIG_SUBCOMMAND" == "$allowed" ]]; then
            ALLOWED=true
            break
        fi
    done
    
    if [[ "$ALLOWED" == "false" && -n "$CONFIG_SUBCOMMAND" ]]; then
        echo "BLOCKED: 'kubectl config $CONFIG_SUBCOMMAND' is not allowed in read-only mode." >&2
        echo "Allowed config commands: ${READONLY_CONFIG_COMMANDS[*]}" >&2
        exit 1
    fi
else
    # Check if subcommand is in the read-only allow-list
    ALLOWED=false
    for cmd in "${READONLY_COMMANDS[@]}"; do
        if [[ "$SUBCOMMAND" == "$cmd" ]]; then
            ALLOWED=true
            break
        fi
    done
    
    if [[ "$ALLOWED" == "false" ]]; then
        echo "BLOCKED: 'kubectl $SUBCOMMAND' is not allowed in read-only mode." >&2
        echo "Allowed commands: ${READONLY_COMMANDS[*]}" >&2
        echo "Allowed config commands: kubectl config {${READONLY_CONFIG_COMMANDS[*]}}" >&2
        exit 1
    fi
fi

# Execute the real kubectl
exec "$REAL_KUBECTL" "$@"
