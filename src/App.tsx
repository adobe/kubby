import { useEffect, useState, useRef } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import classes from "./App.module.scss";
import { ResourceList } from "./ResourceList";
import type { LabelSelector } from "./resourceTypes";
import type { NavigationNode } from "./navigationTypes";
import { createNavigationNode, formatResourceTypeForDisplay } from "./navigationTypes";

interface ContextGroup {
  name: string;
  contexts: string[];
}

interface FilteredContextGroup {
  name: string;
  contexts: string[];
  originalIndices: number[]; // Track which contexts are visible for cell alignment
}

interface NamespaceItem {
  name: string;
  contexts: string[] | null;
}

interface NamespaceGroup {
  name: string | null;
  namespaces: NamespaceItem[];
}

interface DashboardGroup {
  name: string;
  context_groups: ContextGroup[];
  namespace_groups: NamespaceGroup[];
}

interface DashboardConfig {
  groups: DashboardGroup[];
}

interface ParsedContext {
  env: string;
  region: string;
  cluster: string;
}

// ResourceSelection interface removed - using NavigationNode instead

function parseContextName(contextName: string): ParsedContext {
  // Pattern: {env}-{region}-{cluster_name}
  // e.g., dev-va7-ethos11-stage-va7 -> env: dev, region: va7, cluster: ethos11-stage-va7
  const parts = contextName.split("-");
  if (parts.length >= 3) {
    return {
      env: parts[0],
      region: parts[1],
      cluster: parts.slice(2).join("-"),
    };
  }
  // Fallback for unexpected formats
  return {
    env: parts[0] || "",
    region: parts[1] || "",
    cluster: parts.slice(2).join("-") || contextName,
  };
}

function findCommonPrefix(strings: string[], minCount: number = 5): string {
  if (strings.length < minCount) return "";
  
  // Extract all possible prefixes from each string (at separator boundaries)
  const prefixCounts = new Map<string, number>();
  
  for (const str of strings) {
    const separators = ["-", "_"];
    
    for (let i = 0; i < str.length; i++) {
      if (separators.includes(str[i])) {
        const prefix = str.substring(0, i + 1); // Include the separator
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }
  }
  
  // Find the longest prefix that is shared by at least minCount strings
  let bestPrefix = "";
  for (const [prefix, count] of prefixCounts) {
    if (count >= minCount && prefix.length > bestPrefix.length) {
      bestPrefix = prefix;
    }
  }
  
  return bestPrefix;
}

function getNamespacePrefix(group: DashboardGroup): string {
  // Collect all namespace names from all namespace groups
  const allNamespaces = group.namespace_groups.flatMap((ng) =>
    ng.namespaces.map((ns) => ns.name)
  );
  return findCommonPrefix(allNamespaces);
}

function handleCellKeyDown(e: KeyboardEvent, tableRef: HTMLTableElement | null) {
  if (!tableRef) return;
  
  const target = e.target as HTMLElement;
  if (!target.classList.contains(classes.cellButton)) return;
  
  const currentRow = parseInt(target.dataset.row || "0", 10);
  const currentCol = parseInt(target.dataset.col || "0", 10);
  
  let targetRow = currentRow;
  let targetCol = currentCol;
  let handled = false;
  
  switch (e.key) {
    case "ArrowUp":
      targetRow = currentRow - 1;
      handled = true;
      break;
    case "ArrowDown":
      targetRow = currentRow + 1;
      handled = true;
      break;
    case "ArrowLeft":
      targetCol = currentCol - 1;
      handled = true;
      break;
    case "ArrowRight":
      targetCol = currentCol + 1;
      handled = true;
      break;
  }
  
  if (!handled) return;
  
  e.preventDefault();
  
  // Try to find a button at the target position
  let targetButton = tableRef.querySelector(
    `.${classes.cellButton}[data-row="${targetRow}"][data-col="${targetCol}"]`
  ) as HTMLElement | null;
  
  // If no button at exact position, try to find the closest one in that direction
  if (!targetButton) {
    const allButtons = Array.from(tableRef.querySelectorAll(`.${classes.cellButton}`)) as HTMLElement[];
    
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Find buttons in the same column, then get the closest row
      const sameColButtons = allButtons.filter(btn => 
        parseInt(btn.dataset.col || "0", 10) === currentCol
      );
      
      if (e.key === "ArrowUp") {
        // Find the closest button above
        const above = sameColButtons.filter(btn => 
          parseInt(btn.dataset.row || "0", 10) < currentRow
        );
        if (above.length > 0) {
          targetButton = above[above.length - 1];
        }
      } else {
        // Find the closest button below
        const below = sameColButtons.filter(btn => 
          parseInt(btn.dataset.row || "0", 10) > currentRow
        );
        if (below.length > 0) {
          targetButton = below[0];
        }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Find buttons in the same row, then get the closest column
      const sameRowButtons = allButtons.filter(btn => 
        parseInt(btn.dataset.row || "0", 10) === currentRow
      );
      
      if (e.key === "ArrowLeft") {
        // Find the closest button to the left
        const left = sameRowButtons.filter(btn => 
          parseInt(btn.dataset.col || "0", 10) < currentCol
        );
        if (left.length > 0) {
          targetButton = left[left.length - 1];
        }
      } else {
        // Find the closest button to the right
        const right = sameRowButtons.filter(btn => 
          parseInt(btn.dataset.col || "0", 10) > currentCol
        );
        if (right.length > 0) {
          targetButton = right[0];
        }
      }
    }
  }
  
  if (targetButton) {
    targetButton.focus();
  }
}

function matchesFilter(text: string, filterWords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return filterWords.every(word => lowerText.includes(word));
}

function textContainsWord(text: string, word: string): boolean {
  return text.toLowerCase().includes(word);
}

function filterContextGroups(
  contextGroups: ContextGroup[],
  filterWords: string[]
): { filtered: FilteredContextGroup[]; hasMatches: boolean } {
  if (filterWords.length === 0) {
    return {
      filtered: contextGroups.map(cg => ({
        ...cg,
        originalIndices: cg.contexts.map((_, i) => i),
      })),
      hasMatches: true,
    };
  }

  // Collect all contexts to determine which words are applicable
  const allContexts = contextGroups.flatMap(cg => cg.contexts);
  
  // Only use words that match at least one context
  const applicableWords = filterWords.filter(word =>
    allContexts.some(ctx => textContainsWord(ctx, word))
  );

  // If no words apply to contexts, show all contexts
  if (applicableWords.length === 0) {
    return {
      filtered: contextGroups.map(cg => ({
        ...cg,
        originalIndices: cg.contexts.map((_, i) => i),
      })),
      hasMatches: true,
    };
  }

  const filtered: FilteredContextGroup[] = contextGroups.map(cg => {
    const matchingContexts: string[] = [];
    const originalIndices: number[] = [];
    
    cg.contexts.forEach((ctx, i) => {
      if (matchesFilter(ctx, applicableWords)) {
        matchingContexts.push(ctx);
        originalIndices.push(i);
      }
    });

    return {
      name: cg.name,
      contexts: matchingContexts,
      originalIndices,
    };
  });

  return { filtered, hasMatches: true };
}

function filterNamespaces(
  namespaceGroups: NamespaceGroup[],
  filterWords: string[]
): { filtered: NamespaceGroup[]; hasMatches: boolean } {
  if (filterWords.length === 0) {
    return { filtered: namespaceGroups, hasMatches: true };
  }

  // Collect all namespace names to determine which words are applicable
  const allNamespaces = namespaceGroups.flatMap(ng => ng.namespaces.map(ns => ns.name));
  
  // Only use words that match at least one namespace
  const applicableWords = filterWords.filter(word =>
    allNamespaces.some(ns => textContainsWord(ns, word))
  );

  // If no words apply to namespaces, show all namespaces
  if (applicableWords.length === 0) {
    return { filtered: namespaceGroups, hasMatches: true };
  }

  const filtered: NamespaceGroup[] = namespaceGroups.map(ng => ({
    ...ng,
    namespaces: ng.namespaces.filter(ns => matchesFilter(ns.name, applicableWords)),
  }));

  return { filtered, hasMatches: true };
}

function App() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [navigationStack, setNavigationStack] = useState<NavigationNode[]>([]);
  const [lastSelectedCell, setLastSelectedCell] = useState<{ context: string; namespace: string } | null>(null);

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

  // Focus button when dashboard is shown (restore last selection or focus first)
  useEffect(() => {
    if (config && navigationStack.length === 0) {
      // Use requestAnimationFrame to ensure DOM is rendered
      requestAnimationFrame(() => {
        let targetButton: HTMLElement | null = null;
        
        // Try to restore focus to last selected cell
        if (lastSelectedCell) {
          targetButton = document.querySelector(
            `.${classes.cellButton}[data-context="${lastSelectedCell.context}"][data-namespace="${lastSelectedCell.namespace}"]`
          ) as HTMLElement | null;
        }
        
        // Fall back to first button if last selection not found
        if (!targetButton) {
          targetButton = document.querySelector(`.${classes.cellButton}`) as HTMLElement | null;
        }
        
        if (targetButton) {
          targetButton.focus();
        }
      });
    }
  }, [config, navigationStack.length, lastSelectedCell]);

  // Listen for keydown to show filter input (only on dashboard)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle filter input when on dashboard
      if (navigationStack.length > 0) {
        return;
      }
      
      // Ignore if we're already focused on an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      
      // Escape closes the filter
      if (e.key === "Escape") {
        setShowFilter(false);
        setFilter("");
        return;
      }
      
      // Backspace removes last character
      if (e.key === "Backspace") {
        e.preventDefault();
        setFilter(prev => {
          const newFilter = prev.slice(0, -1);
          if (newFilter === "") {
            setShowFilter(false);
          }
          return newFilter;
        });
        return;
      }
      
      // "/" shows filter without adding the character
      if (e.key === "/") {
        e.preventDefault();
        setShowFilter(true);
        return;
      }
      
      // Only handle printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowFilter(true);
        setFilter(prev => prev + e.key);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [navigationStack.length]);

  // Handle Tab navigation between dashboard groups and filter input
  useEffect(() => {
    function handleTabNavigation(e: KeyboardEvent) {
      // Only handle Tab on dashboard
      if (navigationStack.length > 0) return;
      if (e.key !== "Tab") return;

      // Build list of focusable targets: first button of each group + filter input
      const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
      const groupFirstButtons = sections
        .map(section => section.querySelector(`.${classes.cellButton}`) as HTMLElement | null)
        .filter((btn): btn is HTMLElement => btn !== null);

      const filterInput = document.querySelector(`.${classes.filterInput}`) as HTMLElement | null;

      // Build ordered list of tab stops
      const tabStops: HTMLElement[] = [...groupFirstButtons];
      if (filterInput) {
        tabStops.push(filterInput);
      }

      if (tabStops.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      
      // Check if we're currently on a cell button or filter input
      const isOnCellButton = activeElement?.classList.contains(classes.cellButton);
      const isOnFilterInput = activeElement?.classList.contains(classes.filterInput);
      
      if (!isOnCellButton && !isOnFilterInput) return;

      e.preventDefault();

      // Find which group the current element belongs to
      let currentIndex = -1;
      if (isOnFilterInput) {
        currentIndex = tabStops.indexOf(filterInput!);
      } else if (isOnCellButton) {
        // Find which section this button is in
        const currentSection = activeElement.closest(`.${classes.dashboardSection}`);
        if (currentSection) {
          const sectionIndex = sections.indexOf(currentSection);
          if (sectionIndex !== -1 && sectionIndex < groupFirstButtons.length) {
            currentIndex = sectionIndex;
          }
        }
      }

      if (currentIndex === -1) return;

      // Calculate next index
      let nextIndex: number;
      if (e.shiftKey) {
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = tabStops.length - 1;
      } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= tabStops.length) nextIndex = 0;
      }

      tabStops[nextIndex].focus();
    }

    document.addEventListener("keydown", handleTabNavigation, true);
    return () => document.removeEventListener("keydown", handleTabNavigation, true);
  }, [navigationStack.length, showFilter]);

  const filterWords = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const handleCellClick = (context: string, namespace: string) => {
    // Remember the selected cell for restoring focus when returning
    setLastSelectedCell({ context, namespace });
    
    // Push initial navigation node - back button will show "Dashboard"
    const initialNode = createNavigationNode(
      context,
      namespace,
      "deployments", // Default to deployments
      "Dashboard"
    );
    setNavigationStack([initialNode]);
  };

  const handleBackNavigation = () => {
    if (navigationStack.length <= 1) {
      // Return to dashboard
      setNavigationStack([]);
    } else {
      // Pop the current node, go back to previous
      setNavigationStack(navigationStack.slice(0, -1));
    }
  };

  const handleResourceClick = (resourceType: string, resourceName: string, labels: LabelSelector[]) => {
    if (navigationStack.length === 0) return;

    const currentNode = navigationStack[navigationStack.length - 1];

    // For deployments -> pods routing
    if (resourceType === 'deployments') {
      // Find the app.kubernetes.io/name label
      const appLabel = labels.find(l => l.key === 'app.kubernetes.io/name');
      if (appLabel) {
        // Push new navigation node for pods with filter
        const newNode = createNavigationNode(
          currentNode.context,
          currentNode.namespace,
          'pods',
          formatResourceTypeForDisplay(resourceType), // "Deployments"
          [appLabel]
        );
        setNavigationStack([...navigationStack, newNode]);
      } else {
        console.warn(`No app.kubernetes.io/name label found on deployment ${resourceName}`);
      }
    }
    // Add more routing rules here for other resource types
  };

  const handleRemoveFilter = (index: number) => {
    if (navigationStack.length === 0) return;
    const currentNode = navigationStack[navigationStack.length - 1];
    const newSelectors = [...(currentNode.labelSelectors || [])];
    newSelectors.splice(index, 1);
    
    // Update the current node with new filters
    const updatedNode: NavigationNode = {
      ...currentNode,
      labelSelectors: newSelectors.length > 0 ? newSelectors : undefined,
    };
    setNavigationStack([...navigationStack.slice(0, -1), updatedNode]);
  };

  // Show ResourceList when navigation stack is not empty
  if (navigationStack.length > 0) {
    const currentNode = navigationStack[navigationStack.length - 1];
    // Determine back button label: if we have a previous node, use its displayName, otherwise "Dashboard"
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
          // Clear filters when resource type changes
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
      {config.groups.map((group) => (
        <DashboardTable 
          key={group.name} 
          group={group} 
          filterWords={filterWords}
          onCellClick={handleCellClick}
        />
      ))}
      
      {showFilter && (
        <div class={classes.filterOverlay}>
          <input
            ref={inputRef}
            type="text"
            class={classes.filterInput}
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowFilter(false);
                setFilter("");
              }
            }}
            placeholder="Type to filter..."
          />
          <button 
            class={classes.filterClear}
            onClick={() => {
              setShowFilter(false);
              setFilter("");
            }}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

interface DashboardTableProps {
  group: DashboardGroup;
  filterWords: string[];
  onCellClick: (context: string, namespace: string) => void;
}

function DashboardTable({ group, filterWords, onCellClick }: DashboardTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const hasNamespaceGroups = group.namespace_groups.some((ng) => ng.name !== null);
  const namespacePrefix = getNamespacePrefix(group);

  // Apply filtering
  const { filtered: filteredContextGroups } = filterContextGroups(group.context_groups, filterWords);
  const { filtered: filteredNamespaceGroups } = filterNamespaces(group.namespace_groups, filterWords);

  // Skip rendering if no contexts or namespaces to show
  const totalContexts = filteredContextGroups.reduce((sum, cg) => sum + cg.contexts.length, 0);
  const totalNamespaces = filteredNamespaceGroups.reduce((sum, ng) => sum + ng.namespaces.length, 0);
  
  if (totalContexts === 0 || totalNamespaces === 0) {
    return null;
  }

  // Calculate starting row index for each namespace group
  let runningRowIndex = 0;

  return (
    <section class={classes.dashboardSection}>
      <div class={classes.tableWrapper}>
        <table class={classes.matrix} ref={tableRef}>
          <thead class={classes.stickyHeader}>
            {/* Context group header row */}
            <tr class={classes.contextGroupRow}>
              <th class={`${classes.stickyCol} ${classes.groupTitle}`}>
                {group.name}
              </th>
              {filteredContextGroups.map((cg, cgIndex) => {
                if (cg.contexts.length === 0) return null;
                // Check if there are any visible groups before this one
                const hasVisibleGroupBefore = filteredContextGroups.slice(0, cgIndex).some(g => g.contexts.length > 0);
                return (
                  <th
                    key={cg.name}
                    colSpan={cg.contexts.length}
                    class={`${classes.contextGroupHeader} ${hasVisibleGroupBefore ? classes.groupBorder : ""}`}
                  >
                    {cg.name}
                  </th>
                );
              })}
            </tr>
            {/* Individual context header row */}
            <tr class={classes.contextRow}>
              <th class={classes.stickyCol}></th>
              {(() => {
                let prevRegion = "";
                let isFirstVisibleGroup = true;
                return filteredContextGroups.map((cg) => {
                  if (cg.contexts.length === 0) return null;
                  // Reset region tracking at each group boundary
                  prevRegion = "";
                  const hasVisibleGroupBefore = !isFirstVisibleGroup;
                  isFirstVisibleGroup = false;
                  
                  return cg.contexts.map((ctx, ctxIndex) => {
                    const parsed = parseContextName(ctx);
                    const showEnv = !ctx.toLowerCase().startsWith(cg.name.toLowerCase());
                    const isFirstInGroup = ctxIndex === 0 && hasVisibleGroupBefore;
                    const showRegion = parsed.region !== prevRegion;
                    prevRegion = parsed.region;
                    
                    return (
                      <th 
                        key={ctx} 
                        class={`${classes.contextHeader} ${isFirstInGroup ? classes.groupBorder : ""}`} 
                        title={ctx}
                      >
                        <div class={classes.contextLabel}>
                          {showEnv && <span class={classes.contextEnv}>{parsed.env}</span>}
                          {showRegion ? (
                            <span class={classes.contextRegion}>{parsed.region}</span>
                          ) : (
                            <span class={classes.contextRegionHidden}>{parsed.region}</span>
                          )}
                          <span class={classes.contextCluster}>{parsed.cluster}</span>
                        </div>
                      </th>
                    );
                  });
                });
              })()}
            </tr>
          </thead>
          <tbody>
            {filteredNamespaceGroups.map((ng, ngIndex) => {
              if (ng.namespaces.length === 0) return null;
              const startRowIndex = runningRowIndex;
              runningRowIndex += ng.namespaces.length;
              return (
                <NamespaceGroupRows
                  key={ng.name ?? ngIndex}
                  namespaceGroup={ng}
                  filteredContextGroups={filteredContextGroups}
                  showGroupHeader={hasNamespaceGroups}
                  namespacePrefix={namespacePrefix}
                  startRowIndex={startRowIndex}
                  tableRef={tableRef}
                  onCellClick={onCellClick}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface NamespaceGroupRowsProps {
  namespaceGroup: NamespaceGroup;
  filteredContextGroups: FilteredContextGroup[];
  showGroupHeader: boolean;
  namespacePrefix: string;
  startRowIndex: number;
  tableRef: { current: HTMLTableElement | null };
  onCellClick: (context: string, namespace: string) => void;
}

function NamespaceGroupRows({
  namespaceGroup,
  filteredContextGroups,
  showGroupHeader,
  namespacePrefix,
  startRowIndex,
  tableRef,
  onCellClick,
}: NamespaceGroupRowsProps) {
  // Build flat context list with group boundary info and column index
  const contextsWithBoundary: { ctx: string; isFirstInGroup: boolean; colIndex: number }[] = [];
  let isFirstVisibleGroup = true;
  let colIndex = 0;
  
  filteredContextGroups.forEach((cg) => {
    if (cg.contexts.length === 0) return;
    const hasVisibleGroupBefore = !isFirstVisibleGroup;
    isFirstVisibleGroup = false;
    
    cg.contexts.forEach((ctx, ctxIndex) => {
      contextsWithBoundary.push({
        ctx,
        isFirstInGroup: ctxIndex === 0 && hasVisibleGroupBefore,
        colIndex: colIndex++,
      });
    });
  });

  return (
    <>
      {showGroupHeader && namespaceGroup.name && (
        <tr class={classes.namespaceGroupRow}>
          <td class={`${classes.stickyCol} ${classes.namespaceGroupHeader}`}>
            {namespaceGroup.name}
          </td>
          <td colSpan={contextsWithBoundary.length} class={classes.namespaceGroupFill}></td>
        </tr>
      )}
      {namespaceGroup.namespaces.map((ns, nsIndex) => {
        const hasPrefix = namespacePrefix && ns.name.startsWith(namespacePrefix);
        const prefix = hasPrefix ? namespacePrefix : "";
        const suffix = hasPrefix ? ns.name.slice(namespacePrefix.length) : ns.name;
        const rowIndex = startRowIndex + nsIndex;
        
        return (
          <tr key={ns.name} class={classes.namespaceRow}>
            <td class={classes.stickyCol} title={ns.name}>
              <span class={classes.namespaceLabel}>
                {prefix && <span class={classes.namespacePrefix}>{prefix}</span>}
                <span class={classes.namespaceSuffix}>{suffix}</span>
              </span>
            </td>
            {contextsWithBoundary.map(({ ctx, isFirstInGroup, colIndex: col }) => {
              // If contexts is null/undefined, namespace is available everywhere
              // Otherwise, check if this context is in the list
              const isAvailable = ns.contexts === null || ns.contexts.includes(ctx);
              
              return (
                <td 
                  key={`${ns.name}-${ctx}`} 
                  class={`${classes.cell} ${isFirstInGroup ? classes.groupBorder : ""}`}
                >
                  {isAvailable ? (
                    <button 
                      class={classes.cellButton} 
                      title={`${ns.name} @ ${ctx}`}
                      data-row={rowIndex}
                      data-col={col}
                      data-context={ctx}
                      data-namespace={ns.name}
                      onClick={() => onCellClick(ctx, ns.name)}
                      onKeyDown={(e) => handleCellKeyDown(e as unknown as KeyboardEvent, tableRef.current)}
                    >
                      <span class={classes.bullet}>●</span>
                    </button>
                  ) : (
                    <span class={classes.emptyCell} />
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

export default App;
