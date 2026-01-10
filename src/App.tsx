import { useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./App.module.scss";
import { Dashboard, DashboardConfig } from "./Dashboard";
import { ResourceList } from "./ResourceList";
import { ResourceDetail } from "./ResourceDetail";
import { LogViewer } from "./LogViewer";
import type { LabelSelector } from "./kubectl/resourceTypes";
import type { NavigationNode } from "./navigation/navigationTypes";
import { 
  createNavigationNode, 
  createNavigationNodeWithLabels, 
  createNavigationNodeWithResourceName,
  createDescribeNavigationNode,
  createLogsNavigationNode,
  isDescribeView,
  isLogsView,
  formatResourceTypeForDisplay 
} from "./navigation/navigationTypes";

/**
 * Get all namespaces available for a given context from the dashboard config.
 * Returns namespaces where contexts is null (available everywhere) or includes the context.
 */
function getNamespacesForContext(config: DashboardConfig, context: string): string[] {
  const namespaces: string[] = [];
  
  for (const group of config.groups) {
    // Check if context exists in this group
    const contextInGroup = group.context_groups.some(cg => cg.contexts.includes(context));
    if (!contextInGroup) continue;
    
    for (const ng of group.namespace_groups) {
      for (const ns of ng.namespaces) {
        // Namespace is available if contexts is null or includes this context
        if (ns.contexts === null || ns.contexts.includes(context)) {
          if (!namespaces.includes(ns.name)) {
            namespaces.push(ns.name);
          }
        }
      }
    }
  }
  
  return namespaces;
}

function App() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigationStack, setNavigationStack] = useState<NavigationNode[]>([]);
  const [lastSelectedCell, setLastSelectedCell] = useState<{ context: string; namespace: string } | null>(null);
  // Filter state lifted here to persist across navigation
  const [filter, setFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const result = await invoke<DashboardConfig>("get_dashboard_config");
        setConfig(result);
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleCellClick = (context: string, namespace: string) => {
    setLastSelectedCell({ context, namespace });
    
    const initialNode = createNavigationNode(
      context,
      namespace,
      "deployments",
      "Dashboard"
    );
    setNavigationStack([initialNode]);
  };

  const handleBackNavigation = () => {
    if (navigationStack.length <= 1) {
      setNavigationStack([]);
    } else {
      setNavigationStack(navigationStack.slice(0, -1));
    }
  };

  const handleNavigateToNode = (index: number) => {
    if (index < 0) {
      // Navigate to dashboard
      setNavigationStack([]);
    } else if (index < navigationStack.length) {
      // Navigate to specific node in stack
      setNavigationStack(navigationStack.slice(0, index + 1));
    }
  };

  const handleResourceClick = (resourceType: string, resourceName: string, labels: LabelSelector[]) => {
    if (navigationStack.length === 0) return;

    const currentNode = navigationStack[navigationStack.length - 1];

    if (resourceType === 'deployments') {
      const appLabel = labels.find(l => l.key === 'app.kubernetes.io/name');
      if (appLabel) {
        const newNode = createNavigationNodeWithLabels(
          currentNode.context,
          currentNode.namespace,
          'pods',
          formatResourceTypeForDisplay(resourceType),
          [appLabel]
        );
        setNavigationStack([...navigationStack, newNode]);
      } else {
        console.warn(`No app.kubernetes.io/name label found on deployment ${resourceName}`);
      }
    } else if (resourceType === 'pods') {
      // Navigate to containers view for the selected pod
      const newNode = createNavigationNodeWithResourceName(
        currentNode.context,
        currentNode.namespace,
        'containers',
        resourceName, // Display name is the pod name
        'pod', // Filter resource type
        resourceName // Filter value is the pod name
      );
      setNavigationStack([...navigationStack, newNode]);
    }
  };

  const handleClearFilters = () => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    
    // If this is containers view (has resource name filter), go back instead of clearing
    // because containers without a pod doesn't make sense
    if (currentNode.resourceType === 'containers') {
      handleBackNavigation();
      return;
    }
    
    // For other views, clear all filters
    const updatedNode: NavigationNode = {
      ...currentNode,
      filters: undefined,
    };
    setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
  };

  const handleContextChange = (newContext: string) => {
    if (navigationStack.length === 0 || !config) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    
    // Get available namespaces for the new context
    const availableNamespaces = getNamespacesForContext(config, newContext);
    
    // Keep current namespace if available in new context, otherwise use first available
    let newNamespace = currentNode.namespace;
    if (!availableNamespaces.includes(newNamespace)) {
      newNamespace = availableNamespaces[0] || currentNode.namespace;
    }
    
    const updatedNode: NavigationNode = {
      ...currentNode,
      context: newContext,
      namespace: newNamespace,
      selectedIndex: undefined, // Reset selection when changing context
    };
    setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
  };

  const handleNamespaceChange = (newNamespace: string) => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    
    const updatedNode: NavigationNode = {
      ...currentNode,
      namespace: newNamespace,
      selectedIndex: undefined, // Reset selection when changing namespace
    };
    setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
  };

  const handleDescribe = (resourceType: string, resourceName: string) => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    
    const describeNode = createDescribeNavigationNode(
      currentNode.context,
      currentNode.namespace,
      resourceType,
      resourceName,
      resourceName // Display name is the resource name
    );
    setNavigationStack([...navigationStack, describeNode]);
  };

  const handleLogs = (resourceType: string, resourceName: string, containerName?: string) => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    
    const logsNode = createLogsNavigationNode(
      currentNode.context,
      currentNode.namespace,
      resourceType,
      resourceName,
      containerName || resourceName, // Display name is container name if viewing container logs
      containerName
    );
    setNavigationStack([...navigationStack, logsNode]);
  };

  // Show ResourceDetail when current node is a describe view, LogViewer for logs view
  if (navigationStack.length > 0 && config) {
    const currentNode = navigationStack[navigationStack.length - 1];
    
    // Render describe view if current node is a describe view
    if (isDescribeView(currentNode) && currentNode.resourceName) {
      return (
        <ResourceDetail
          context={currentNode.context}
          namespace={currentNode.namespace}
          resourceType={currentNode.resourceType}
          resourceName={currentNode.resourceName}
          onBack={handleBackNavigation}
        />
      );
    }
    
    // Render logs view if current node is a logs view
    if (isLogsView(currentNode) && currentNode.resourceName) {
      return (
        <LogViewer
          context={currentNode.context}
          namespace={currentNode.namespace}
          resourceType={currentNode.resourceType}
          resourceName={currentNode.resourceName}
          containerName={currentNode.containerName}
          onBack={handleBackNavigation}
        />
      );
    }
    
    // Otherwise render resource list
    return (
      <ResourceList
        context={currentNode.context}
        namespace={currentNode.namespace}
        resourceType={currentNode.resourceType}
        filters={currentNode.filters}
        navigationStack={navigationStack}
        dashboardConfig={config}
        onNavigateToNode={handleNavigateToNode}
        onBack={handleBackNavigation}
        onResourceTypeChange={(newResourceType) => {
          const updatedNode: NavigationNode = {
            ...currentNode,
            resourceType: newResourceType,
            filters: undefined,
            selectedIndex: undefined,
          };
          setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
        }}
        onContextChange={handleContextChange}
        onNamespaceChange={handleNamespaceChange}
        onResourceClick={handleResourceClick}
        onClearFilters={handleClearFilters}
        onDescribe={handleDescribe}
        onLogs={handleLogs}
        initialSelectedIndex={currentNode.selectedIndex}
        onSelectionChange={(index) => {
          // Update current node's selection without triggering re-render cascade
          currentNode.selectedIndex = index;
        }}
      />
    );
  }

  if (loading) {
    return (
      <main class={classes.App}>
        <div class={classes.loading}>Loading dashboard config...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main class={classes.App}>
        <div class={classes.error}>{error}</div>
      </main>
    );
  }

  if (!config) {
    return (
      <main class={classes.App}>
        <div class={classes.error}>No configuration loaded</div>
      </main>
    );
  }

  return (
    <main class={classes.App}>
      <Dashboard
        config={config}
        lastSelectedCell={lastSelectedCell}
        filter={filter}
        showFilter={showFilter}
        onFilterChange={setFilter}
        onShowFilterChange={setShowFilter}
        onCellClick={handleCellClick}
      />
    </main>
  );
}

export default App;
