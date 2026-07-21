/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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
import type { ResourceFilter } from "./kubectl/filterTypes";
import { isTextFilter, getTextFilter, parseLabelSelectorString } from "./kubectl/filterTypes";
import {
  createNavigationNode,
  createNavigationNodeWithLabels,
  createNavigationNodeWithResourceName,
  createDescribeNavigationNode,
  createLogsNavigationNode,
  isDescribeView,
  isLogsView,
} from "./navigation/navigationTypes";
import type { JSX } from "preact";
import { useHotbar } from "./components/Hotbar/useHotbar.ts";
import { ResourceScreenWithHotbar } from "./components/Hotbar/ResourceScreenWithHotbar.tsx";
import { getNamespacesForContext } from "./pages/Dashboard/configHelpers.ts";

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
  // Last used namespace per context - persisted to localStorage
  const [lastNamespaceByContext, setLastNamespaceByContext] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("kubby-last-namespace-by-context");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
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
  // Hotbar state + behavior (persistence, actions, and keyboard shortcuts)
  const hotbar = useHotbar({
    navigationStack,
    setNavigationStack,
    setLastResourceType,
    setLastNamespaceByContext,
  });

  // Session-only read-only override (null = follow the config value). Not persisted.
  const [readOnlyOverride, setReadOnlyOverride] = useState<boolean | null>(null);

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

  // Persist last namespace by context to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("kubby-last-namespace-by-context", JSON.stringify(lastNamespaceByContext));
    } catch {
      // Ignore localStorage errors
    }
  }, [lastNamespaceByContext]);

  // Apply accent color CSS custom properties from config
  useEffect(() => {
    if (!config) return;
    const c = config.accentColor;
    const s = document.documentElement.style;
    s.setProperty('--kubby-accent-fgColor-rest', `var(--label-${c}-fgColor-rest)`);
    s.setProperty('--kubby-accent-fgColor-hover', `var(--label-${c}-fgColor-hover)`);
    s.setProperty('--kubby-accent-fgColor-active', `var(--label-${c}-fgColor-active)`);
    s.setProperty('--kubby-accent-bgColor-active', `var(--label-${c}-bgColor-active)`);
  }, [config?.accentColor]);

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
    // Save the namespace for this context
    setLastNamespaceByContext(prev => ({
      ...prev,
      [context]: namespace
    }));
    
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

  const handleResourceClick = (resourceType: string, resourceName: string, labels: LabelSelector[], podSelector?: string) => {
    if (navigationStack.length === 0) return;

    const currentNode = navigationStack[navigationStack.length - 1];

    if (resourceType === 'rollouts') {
      // Argo Rollouts expose their pod selector at status.selector; use it to find the pods.
      const selectorLabels = podSelector ? parseLabelSelectorString(podSelector) : [];
      if (selectorLabels.length > 0) {
        const newNode = createNavigationNodeWithLabels(
          currentNode.context,
          currentNode.namespace,
          'pods',
          resourceType,
          selectorLabels
        );
        setNavigationStack([...navigationStack, newNode]);
      } else {
        console.warn(`No status.selector found on rollout ${resourceName}`);
      }
    } else if (resourceType === 'deployments' || resourceType === 'services') {
      // Try app.kubernetes.io/name first, then fallback to app label
      const appLabel = labels.find(l => l.key === 'app.kubernetes.io/name') 
        ?? labels.find(l => l.key === 'app');
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
        console.warn(`No app.kubernetes.io/name or app label found on ${resourceType} ${resourceName}`);
      }
    } else if (resourceType === 'jobs') {
      // Jobs label their pods with job-name=<job-name>
      const jobLabel: LabelSelector = { key: 'job-name', value: resourceName };
      const newNode = createNavigationNodeWithLabels(
        currentNode.context,
        currentNode.namespace,
        'pods',
        resourceType,
        [jobLabel]
      );
      setNavigationStack([...navigationStack, newNode]);
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

  const handleJump = (targetResourceType: string, filters: ResourceFilter[]) => {
    if (navigationStack.length === 0) return;

    const currentNode = navigationStack[navigationStack.length - 1];

    // Extract TextFilter separately - it becomes filterText, not a structured filter
    const textFilter = getTextFilter(filters);
    const structuredFilters = filters.filter(f => !isTextFilter(f));

    // Create a new navigation node for the target resource type with filters
    const newNode = createNavigationNode(
      currentNode.context,
      currentNode.namespace,
      targetResourceType,
      currentNode.resourceType, // Display name shows where we came from
      structuredFilters.length > 0 ? structuredFilters : undefined
    );
    
    // Set filterText if we have a text filter
    if (textFilter) {
      newNode.filterText = textFilter.value;
    }
    
    setNavigationStack([...navigationStack, newNode]);
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
    
    // Get available namespaces for the new context
    const availableNamespaces = getNamespacesForContext(config, newContext);
    
    // If in containers view, go back to parent (pods) and update that instead
    // This is needed because the pod won't exist in the new context
    let stackToUpdate = navigationStack;
    if (navigationStack.length > 1) {
      const currentNode = navigationStack[navigationStack.length - 1];
      if (currentNode.resourceType === 'containers') {
        // Pop containers node and update the parent instead
        stackToUpdate = navigationStack.slice(0, -1);
      }
    }
    
    const currentNode = stackToUpdate[stackToUpdate.length - 1];
    
    // Keep current namespace if available in new context, otherwise try saved namespace, then first available
    let newNamespace = currentNode.namespace;
    if (!availableNamespaces.includes(newNamespace)) {
      // Try saved namespace for this context first
      const savedNamespace = lastNamespaceByContext[newContext];
      if (savedNamespace && availableNamespaces.includes(savedNamespace)) {
        newNamespace = savedNamespace;
      } else {
        // Fall back to first available namespace
        newNamespace = availableNamespaces[0] || currentNode.namespace;
      }
    }
    
    // Save the chosen namespace for the new context
    setLastNamespaceByContext(prev => ({
      ...prev,
      [newContext]: newNamespace
    }));
    
    // Update ALL nodes in the stack with the new context/namespace
    // This ensures pressing Escape goes back to previous resource in the CURRENT context/namespace
    const updatedStack = stackToUpdate.map(node => ({
      ...node,
      context: newContext,
      namespace: newNamespace,
      filters: undefined, // Clear filters - they're bound to namespace-specific resources
      selectedIndex: undefined, // Reset selection when changing context
      filterText: undefined, // Clear text filter when changing context
    }));
    setNavigationStack(updatedStack);
  };

  const handleNamespaceChange = (newNamespace: string) => {
    if (navigationStack.length === 0) return;
    
    // If in containers view, go back to parent (pods) and update that instead
    // This is needed because the pod won't exist in the new namespace
    let stackToUpdate = navigationStack;
    if (navigationStack.length > 1) {
      const currentNode = navigationStack[navigationStack.length - 1];
      if (currentNode.resourceType === 'containers') {
        // Pop containers node and update the parent instead
        stackToUpdate = navigationStack.slice(0, -1);
      }
    }
    
    const currentNode = stackToUpdate[stackToUpdate.length - 1];
    
    // Save the namespace for the current context
    setLastNamespaceByContext(prev => ({
      ...prev,
      [currentNode.context]: newNamespace
    }));
    
    // Update ALL nodes in the stack with the new namespace
    // This ensures pressing Escape goes back to previous resource in the CURRENT namespace
    const updatedStack = stackToUpdate.map(node => ({
      ...node,
      namespace: newNamespace,
      filters: undefined, // Clear filters - they're bound to namespace-specific resources
      selectedIndex: undefined, // Reset selection when changing namespace
      filterText: undefined, // Clear text filter when changing namespace
    }));
    setNavigationStack(updatedStack);
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

  // Flip the session read-only override relative to the current effective value
  const toggleReadOnly = useCallback(() => {
    setReadOnlyOverride(prev => !(prev ?? config?.readOnly ?? false));
  }, [config?.readOnly]);

  // Show ResourceDetail when current node is a describe view, LogViewer for logs view
  if (navigationStack.length > 0 && config) {
    const currentNode = navigationStack[navigationStack.length - 1];
    // Effective read-only: session override wins over the config value
    const effectiveReadOnly = readOnlyOverride ?? config.readOnly;

    // Wrap a resource screen with the hotbar sidebar on the right
    const withHotbar = (screen: JSX.Element) => (
      <main class={classes.App}>
        <ResourceScreenWithHotbar
          screen={screen}
          hotbar={hotbar}
          currentNode={currentNode}
          dashboardConfig={config}
          readOnly={effectiveReadOnly}
          onToggleReadOnly={toggleReadOnly}
        />
      </main>
    );

    // Render describe view if current node is a describe view
    if (isDescribeView(currentNode) && currentNode.resourceName) {
      return withHotbar(
          <ResourceDetail
            context={currentNode.context}
            namespace={currentNode.namespace}
            resourceType={currentNode.resourceType}
            resourceName={currentNode.resourceName}
            dashboardConfig={config}
            navigationStack={navigationStack}
            readOnly={effectiveReadOnly}
            onNavigateToNode={handleNavigateToNode}
            onBack={handleBackNavigation}
            onJump={handleJump}
          />
      );
    }
    
    // Render logs view if current node is a logs view
    if (isLogsView(currentNode) && currentNode.resourceName) {
      return withHotbar(
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
    // Key forces remount when navigating, ensuring state (filterText, selectedIndex) initializes from props
    return withHotbar(
        <ResourceList
          key={navigationStack.length}
          context={currentNode.context}
          namespace={currentNode.namespace}
          resourceType={currentNode.resourceType}
          filters={currentNode.filters}
          navigationStack={navigationStack}
          dashboardConfig={config}
          readOnly={effectiveReadOnly}
          onNavigateToNode={handleNavigateToNode}
          onBack={handleBackNavigation}
          onResourceTypeChange={(newResourceType) => {
            setLastResourceType(newResourceType);
            const updatedNode: NavigationNode = {
              ...currentNode,
              resourceType: newResourceType,
              filters: undefined,
              selectedIndex: undefined,
              filterText: undefined,
            };
            setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
          }}
          onContextChange={handleContextChange}
          onNamespaceChange={handleNamespaceChange}
          onResourceClick={handleResourceClick}
          onClearFilters={handleClearFilters}
          onDescribe={handleDescribe}
          onLogs={handleLogs}
          onJump={handleJump}
          initialSelectedIndex={currentNode.selectedIndex}
          onSelectionChange={(index) => {
            // Update current node's selection without triggering re-render cascade
            currentNode.selectedIndex = index;
          }}
          initialFilterText={currentNode.filterText}
          onFilterTextChange={(text) => {
            // Update current node's filter text without triggering re-render cascade
            currentNode.filterText = text;
          }}
        />
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
