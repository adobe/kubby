import { useEffect, useRef } from "preact/hooks";
import classes from "./Dashboard.module.scss";

export interface ContextGroup {
  name: string;
  contexts: string[];
}

interface FilteredContextGroup {
  name: string;
  contexts: string[];
  originalIndices: number[];
}

export interface NamespaceItem {
  name: string;
  contexts: string[] | null;
}

export interface NamespaceGroup {
  name: string | null;
  namespaces: NamespaceItem[];
}

export interface DashboardGroup {
  name: string;
  context_groups: ContextGroup[];
  namespace_groups: NamespaceGroup[];
}

export interface DashboardConfig {
  groups: DashboardGroup[];
}

interface ParsedContext {
  env: string;
  region: string;
  cluster: string;
}

function parseContextName(contextName: string): ParsedContext {
  const parts = contextName.split("-");
  if (parts.length >= 3) {
    return {
      env: parts[0],
      region: parts[1],
      cluster: parts.slice(2).join("-"),
    };
  }
  return {
    env: parts[0] || "",
    region: parts[1] || "",
    cluster: parts.slice(2).join("-") || contextName,
  };
}

function findCommonPrefix(strings: string[], minCount: number = 5): string {
  if (strings.length < minCount) return "";
  
  const prefixCounts = new Map<string, number>();
  
  for (const str of strings) {
    const separators = ["-", "_"];
    
    for (let i = 0; i < str.length; i++) {
      if (separators.includes(str[i])) {
        const prefix = str.substring(0, i + 1);
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }
  }
  
  let bestPrefix = "";
  for (const [prefix, count] of prefixCounts) {
    if (count >= minCount && prefix.length > bestPrefix.length) {
      bestPrefix = prefix;
    }
  }
  
  return bestPrefix;
}

function getNamespacePrefix(group: DashboardGroup): string {
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
  
  let targetButton = tableRef.querySelector(
    `.${classes.cellButton}[data-row="${targetRow}"][data-col="${targetCol}"]`
  ) as HTMLElement | null;
  
  if (!targetButton) {
    const allButtons = Array.from(tableRef.querySelectorAll(`.${classes.cellButton}`)) as HTMLElement[];
    
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const sameColButtons = allButtons.filter(btn => 
        parseInt(btn.dataset.col || "0", 10) === currentCol
      );
      
      if (e.key === "ArrowUp") {
        const above = sameColButtons.filter(btn => 
          parseInt(btn.dataset.row || "0", 10) < currentRow
        );
        if (above.length > 0) {
          targetButton = above[above.length - 1];
        }
      } else {
        const below = sameColButtons.filter(btn => 
          parseInt(btn.dataset.row || "0", 10) > currentRow
        );
        if (below.length > 0) {
          targetButton = below[0];
        }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const sameRowButtons = allButtons.filter(btn => 
        parseInt(btn.dataset.row || "0", 10) === currentRow
      );
      
      if (e.key === "ArrowLeft") {
        const left = sameRowButtons.filter(btn => 
          parseInt(btn.dataset.col || "0", 10) < currentCol
        );
        if (left.length > 0) {
          targetButton = left[left.length - 1];
        }
      } else {
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

  const allContexts = contextGroups.flatMap(cg => cg.contexts);
  
  const applicableWords = filterWords.filter(word =>
    allContexts.some(ctx => textContainsWord(ctx, word))
  );

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

  const allNamespaces = namespaceGroups.flatMap(ng => ng.namespaces.map(ns => ns.name));
  
  const applicableWords = filterWords.filter(word =>
    allNamespaces.some(ns => textContainsWord(ns, word))
  );

  if (applicableWords.length === 0) {
    return { filtered: namespaceGroups, hasMatches: true };
  }

  const filtered: NamespaceGroup[] = namespaceGroups.map(ng => ({
    ...ng,
    namespaces: ng.namespaces.filter(ns => matchesFilter(ns.name, applicableWords)),
  }));

  return { filtered, hasMatches: true };
}

interface DashboardProps {
  config: DashboardConfig;
  lastSelectedCell: { context: string; namespace: string } | null;
  filter: string;
  showFilter: boolean;
  onFilterChange: (filter: string) => void;
  onShowFilterChange: (show: boolean) => void;
  onCellClick: (context: string, namespace: string) => void;
}

export function Dashboard({ 
  config, 
  lastSelectedCell, 
  filter,
  showFilter,
  onFilterChange,
  onShowFilterChange,
  onCellClick 
}: DashboardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus button when dashboard is shown (restore last selection or focus first)
  useEffect(() => {
    requestAnimationFrame(() => {
      let targetButton: HTMLElement | null = null;
      
      if (lastSelectedCell) {
        targetButton = document.querySelector(
          `.${classes.cellButton}[data-context="${lastSelectedCell.context}"][data-namespace="${lastSelectedCell.namespace}"]`
        ) as HTMLElement | null;
      }
      
      if (!targetButton) {
        targetButton = document.querySelector(`.${classes.cellButton}`) as HTMLElement | null;
      }
      
      if (targetButton) {
        targetButton.focus();
      }
    });
  }, [lastSelectedCell]);

  // Listen for keydown to show filter input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      
      if (e.key === "Escape") {
        onShowFilterChange(false);
        onFilterChange("");
        return;
      }
      
      if (e.key === "Backspace") {
        e.preventDefault();
        const newFilter = filter.slice(0, -1);
        if (newFilter === "") {
          onShowFilterChange(false);
        }
        onFilterChange(newFilter);
        return;
      }
      
      if (e.key === "/") {
        e.preventDefault();
        onShowFilterChange(true);
        return;
      }
      
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onShowFilterChange(true);
        onFilterChange(filter + e.key);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filter, onFilterChange, onShowFilterChange]);

  // Handle Tab navigation between dashboard groups and filter input
  useEffect(() => {
    function handleTabNavigation(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
      const groupFirstButtons = sections
        .map(section => section.querySelector(`.${classes.cellButton}`) as HTMLElement | null)
        .filter((btn): btn is HTMLElement => btn !== null);

      const filterInput = document.querySelector(`.${classes.filterInput}`) as HTMLElement | null;

      const tabStops: HTMLElement[] = [...groupFirstButtons];
      if (filterInput) {
        tabStops.push(filterInput);
      }

      if (tabStops.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      
      const isOnCellButton = activeElement?.classList.contains(classes.cellButton);
      const isOnFilterInput = activeElement?.classList.contains(classes.filterInput);
      
      if (!isOnCellButton && !isOnFilterInput) return;

      e.preventDefault();

      let currentIndex = -1;
      if (isOnFilterInput) {
        currentIndex = tabStops.indexOf(filterInput!);
      } else if (isOnCellButton) {
        const currentSection = activeElement.closest(`.${classes.dashboardSection}`);
        if (currentSection) {
          const sectionIndex = sections.indexOf(currentSection);
          if (sectionIndex !== -1 && sectionIndex < groupFirstButtons.length) {
            currentIndex = sectionIndex;
          }
        }
      }

      if (currentIndex === -1) return;

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
  }, [showFilter]);

  const filterWords = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return (
    <>
      {config.groups.map((group) => (
        <DashboardTable 
          key={group.name} 
          group={group} 
          filterWords={filterWords}
          onCellClick={onCellClick}
        />
      ))}
      
      {showFilter && (
        <div class={classes.filterOverlay}>
          <input
            ref={inputRef}
            type="text"
            class={classes.filterInput}
            value={filter}
            onInput={(e) => onFilterChange((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onShowFilterChange(false);
                onFilterChange("");
              }
            }}
            placeholder="Type to filter..."
          />
          <button 
            class={classes.filterClear}
            onClick={() => {
              onShowFilterChange(false);
              onFilterChange("");
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
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

  const { filtered: filteredContextGroups } = filterContextGroups(group.context_groups, filterWords);
  const { filtered: filteredNamespaceGroups } = filterNamespaces(group.namespace_groups, filterWords);

  const totalContexts = filteredContextGroups.reduce((sum, cg) => sum + cg.contexts.length, 0);
  const totalNamespaces = filteredNamespaceGroups.reduce((sum, ng) => sum + ng.namespaces.length, 0);
  
  if (totalContexts === 0 || totalNamespaces === 0) {
    return null;
  }

  let runningRowIndex = 0;

  return (
    <section class={classes.dashboardSection}>
      <div class={classes.tableWrapper}>
        <table class={classes.matrix} ref={tableRef}>
          <thead class={classes.stickyHeader}>
            <tr class={classes.contextGroupRow}>
              <th class={`${classes.stickyCol} ${classes.groupTitle}`}>
                {group.name}
              </th>
              {filteredContextGroups.map((cg, cgIndex) => {
                if (cg.contexts.length === 0) return null;
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
            <tr class={classes.contextRow}>
              <th class={classes.stickyCol}></th>
              {(() => {
                let prevRegion = "";
                let isFirstVisibleGroup = true;
                return filteredContextGroups.map((cg) => {
                  if (cg.contexts.length === 0) return null;
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
