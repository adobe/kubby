import { useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./App.module.scss";
import { Dashboard, DashboardConfig } from "./Dashboard";
import { ResourceList } from "./ResourceList";
import type { LabelSelector } from "./kubectl/resourceTypes";
import type { NavigationNode } from "./navigation/navigationTypes";
import { createNavigationNode, formatResourceTypeForDisplay } from "./navigation/navigationTypes";

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

  const handleResourceClick = (resourceType: string, resourceName: string, labels: LabelSelector[]) => {
    if (navigationStack.length === 0) return;

    const currentNode = navigationStack[navigationStack.length - 1];

    if (resourceType === 'deployments') {
      const appLabel = labels.find(l => l.key === 'app.kubernetes.io/name');
      if (appLabel) {
        const newNode = createNavigationNode(
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
    }
  };

  const handleRemoveFilter = (index: number) => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    const newSelectors = [...(currentNode.labelSelectors || [])];
    newSelectors.splice(index, 1);
    
    const updatedNode: NavigationNode = {
      ...currentNode,
      labelSelectors: newSelectors.length > 0 ? newSelectors : undefined,
    };
    setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
  };

  // Show ResourceList when navigation stack is not empty
  if (navigationStack.length > 0) {
    const currentNode = navigationStack[navigationStack.length - 1];
    const backLabel = currentNode.displayName;
    
    return (
      <ResourceList
        context={currentNode.context}
        namespace={currentNode.namespace}
        resourceType={currentNode.resourceType}
        labelSelectors={currentNode.labelSelectors}
        backLabel={backLabel}
        onBack={handleBackNavigation}
        onResourceTypeChange={(newResourceType) => {
          const updatedNode: NavigationNode = {
            ...currentNode,
            resourceType: newResourceType,
            labelSelectors: undefined,
          };
          setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
        }}
        onResourceClick={handleResourceClick}
        onRemoveFilter={handleRemoveFilter}
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
