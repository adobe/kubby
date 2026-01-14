import { useEffect, useState, useCallback } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./App.module.scss";
import { Dashboard, DashboardConfig } from "./pages/Dashboard/Dashboard.tsx";
import { ResourceList } from "./pages/ResourceList/ResourceList.tsx";
import { ResourceDetail } from "./pages/ResourceDetail/ResourceDetail.tsx";
import { LogViewer } from "./pages/LogViewer/LogViewer.tsx";
import { Onboarding } from "./pages/Onboarding/Onboarding.tsx";
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
} from "./navigation/navigationTypes";

/**
 * Get all namespaces available for a given context from the dashboard config.
 * Returns namespaces where contexts is null (available everywhere) or includes the context.
 */
function getNamespacesForContext(config: DashboardConfig, context: string): string[] {
  const namespaces: string[] = [];
  
  for (const group of config.groups) {
    // Check if context exists in this group
    const contextInGroup = group.contextGroups.some(cg => cg.contexts.includes(context));
    if (!contextInGroup) continue;
    
    for (const ng of group.namespaceGroups) {
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
  // Config existence state: null = checking, true = exists, false = doesn't exist
  const [configExists, setConfigExists] = useState<boolean | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigationStack, setNavigationStack] = useState<NavigationNode[]>([]);
  const [lastSelectedCell, setLastSelectedCell] = useState<{ context: string; namespace: string } | null>(null);
  // Last used resource type - persisted to localStorage
  const [lastResourceType, setLastResourceType] = useState(() => {
    try {
      return localStorage.getItem("kubby-last-resource-type") || "deployments";
    } catch {
      return "deployments";
    }
  });
  // Filter state lifted here to persist across navigation and page reloads
  const [filter, setFilter] = useState(() => {
    try {
      return localStorage.getItem("kubby-dashboard-filter") || "";
    } catch {
      return "";
    }
  });

  // Persist filter to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("kubby-dashboard-filter", filter);
    } catch {
      // Ignore localStorage errors
    }
  }, [filter]);

  // Persist last resource type to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("kubby-last-resource-type", lastResourceType);
    } catch {
      // Ignore localStorage errors
    }
  }, [lastResourceType]);

  // Function to load the config
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<DashboardConfig>("get_dashboard_config");
      setConfig(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if config exists on mount, then load if it does
  useEffect(() => {
    async function checkAndLoadConfig() {
      try {
        const exists = await invoke<boolean>("check_config_exists");
        setConfigExists(exists);
        
        if (exists) {
          await loadConfig();
        } else {
          setLoading(false);
        }
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    }
    checkAndLoadConfig();
  }, [loadConfig]);

  // Handler for when onboarding is complete
  const handleOnboardingComplete = useCallback(async () => {
    setConfigExists(true);
    await loadConfig();
  }, [loadConfig]);

  const handleCellClick = (context: string, namespace: string) => {
    setLastSelectedCell({ context, namespace });
    
    const initialNode = createNavigationNode(
      context,
      namespace,
      lastResourceType,
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
          resourceType,
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
        <main class={classes.App}>
          <ResourceDetail
            context={currentNode.context}
            namespace={currentNode.namespace}
            resourceType={currentNode.resourceType}
            resourceName={currentNode.resourceName}
            dashboardConfig={config}
            navigationStack={navigationStack}
            onNavigateToNode={handleNavigateToNode}
            onBack={handleBackNavigation}
          />
        </main>
      );
    }
    
    // Render logs view if current node is a logs view
    if (isLogsView(currentNode) && currentNode.resourceName) {
      return (
        <main class={classes.App}>
          <LogViewer
            context={currentNode.context}
            namespace={currentNode.namespace}
            resourceType={currentNode.resourceType}
            resourceName={currentNode.resourceName}
            containerName={currentNode.containerName}
            onBack={handleBackNavigation}
          />
        </main>
      );
    }
    
    // Otherwise render resource list
    return (
      <main class={classes.App}>
        <ResourceList
          context={currentNode.context}
          namespace={currentNode.namespace}
          resourceType={currentNode.resourceType}
          filters={currentNode.filters}
          navigationStack={navigationStack}
          dashboardConfig={config}
          readOnly={config.readOnly}
          onNavigateToNode={handleNavigateToNode}
          onBack={handleBackNavigation}
          onResourceTypeChange={(newResourceType) => {
            setLastResourceType(newResourceType);
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
      </main>
    );
  }

  // Show loading while checking if config exists
  if (configExists === null || loading) {
    return (
      <main class={classes.App}>
        <div class={classes.loading}>Loading...</div>
      </main>
    );
  }

  // Show onboarding if config doesn't exist
  if (configExists === false) {
    return (
      <main class={classes.App}>
        <Onboarding onComplete={handleOnboardingComplete} />
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
        onFilterChange={setFilter}
        onCellClick={handleCellClick}
      />
    </main>
  );
}

export default App;
