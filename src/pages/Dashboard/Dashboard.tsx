import { useEffect, useRef } from "preact/hooks";
import classes from "./Dashboard.module.scss";
import {NavigationBar} from '../../components/NavigationBar/NavigationBar.tsx'
import {DashboardShortcutsBar} from './DashboardShortcutsBar.tsx'

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
  contextGroups: ContextGroup[];
  namespaceGroups: NamespaceGroup[];
}

export interface RunCommand {
  name: string;
  command: string;
  /** Optional list of resource types this command applies to. If empty/undefined, applies to all. */
  resources?: string[];
}

export interface DashboardConfig {
  groups: DashboardGroup[];
  runCommands: RunCommand[];
  readOnly: boolean;
  liveViewAutoRefresh: boolean;
  refreshRateSeconds: number;
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

function findCommonPrefix(strings: string[]): string {
  if (strings.length < 2) return "";
  
  // Build a map of all prefixes (at separator boundaries) and their occurrence counts
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
  
  // Try to find the longest common prefix, starting with one shared by all strings,
  // then progressively lowering the threshold until we find something
  for (let threshold = strings.length; threshold >= 2; threshold--) {
    let bestPrefix = "";
    for (const [prefix, count] of prefixCounts) {
      if (count >= threshold && prefix.length > bestPrefix.length) {
        bestPrefix = prefix;
      }
    }
    if (bestPrefix) {
      return bestPrefix;
    }
  }
  
  return "";
}

function getNamespacePrefixForGroup(namespaces: NamespaceItem[]): string {
  return findCommonPrefix(namespaces.map((ns) => ns.name));
}

function handleCellKeyDown(
  e: KeyboardEvent, 
  tableRef: HTMLTableElement | null,
  groupIndex: number,
  groupPositionsRef: { current: Map<number, { row: number; col: number }> }
) {
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
    targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    
    // Update the stored position for this group
    const row = parseInt(targetButton.dataset.row || "0", 10);
    const col = parseInt(targetButton.dataset.col || "0", 10);
    groupPositionsRef.current.set(groupIndex, { row, col });
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
  onFilterChange: (filter: string) => void;
  onCellClick: (context: string, namespace: string) => void;
}

export function Dashboard({ 
  config, 
  lastSelectedCell, 
  filter,
  onFilterChange,
  onCellClick 
}: DashboardProps) {
  const filterInputRef = useRef<HTMLInputElement>(null);
  // Track last focused position (row, col) per group
  const groupPositionsRef = useRef<Map<number, { row: number; col: number }>>(new Map());
  // Track the last focused group index and element
  const lastFocusedRef = useRef<{ groupIndex: number; element: HTMLElement } | null>(null);

  // Update last focused position whenever a cell button is focused
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains(classes.cellButton)) {
        const section = target.closest(`.${classes.dashboardSection}`);
        if (section) {
          const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
          const groupIndex = sections.indexOf(section);
          if (groupIndex !== -1) {
            lastFocusedRef.current = { groupIndex, element: target };
            const row = parseInt(target.dataset.row || "0", 10);
            const col = parseInt(target.dataset.col || "0", 10);
            groupPositionsRef.current.set(groupIndex, { row, col });
          }
        }
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // Navigate between groups
  const navigateToGroup = (direction: 'next' | 'previous') => {
    const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
    const filterInput = filterInputRef.current;
    if (sections.length === 0) return;

    const activeElement = document.activeElement as HTMLElement;
    const isOnCellButton = activeElement?.classList.contains(classes.cellButton);
    const isOnFilterInput = activeElement === filterInput;

    let currentSectionIndex = -1;
    let isCurrentlyOnFilter = false;

    if (isOnFilterInput) {
      isCurrentlyOnFilter = true;
    } else if (isOnCellButton) {
      const currentSection = activeElement.closest(`.${classes.dashboardSection}`);
      if (currentSection) {
        currentSectionIndex = sections.indexOf(currentSection);
        if (currentSectionIndex !== -1) {
          const row = parseInt(activeElement.dataset.row || "0", 10);
          const col = parseInt(activeElement.dataset.col || "0", 10);
          groupPositionsRef.current.set(currentSectionIndex, { row, col });
        }
      }
    } else if (lastFocusedRef.current) {
      // If focus is elsewhere (e.g., shortcuts bar button), use last focused position
      currentSectionIndex = lastFocusedRef.current.groupIndex;
    } else {
      // No previous focus, start from first group
      currentSectionIndex = -1;
    }

    let targetSectionIndex = -1;
    let targetIsFilter = false;
    const totalSections = sections.length;
    const hasFilter = filterInput !== null;

    if (direction === 'previous') {
      if (isCurrentlyOnFilter) {
        targetSectionIndex = totalSections - 1;
      } else if (currentSectionIndex === 0) {
        if (hasFilter) {
          targetIsFilter = true;
        } else {
          targetSectionIndex = totalSections - 1;
        }
      } else {
        targetSectionIndex = currentSectionIndex - 1;
      }
    } else {
      if (isCurrentlyOnFilter) {
        targetSectionIndex = 0;
      } else if (currentSectionIndex === totalSections - 1) {
        if (hasFilter) {
          targetIsFilter = true;
        } else {
          targetSectionIndex = 0;
        }
      } else {
        targetSectionIndex = currentSectionIndex + 1;
      }
    }

    if (targetIsFilter && filterInput) {
      filterInput.focus();
      filterInput.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else if (targetSectionIndex !== -1) {
      const targetSection = sections[targetSectionIndex] as HTMLElement;
      const allButtons = Array.from(targetSection.querySelectorAll(`.${classes.cellButton}`)) as HTMLElement[];
      if (allButtons.length === 0) return;

      const storedPos = groupPositionsRef.current.get(targetSectionIndex);
      let targetButton: HTMLElement | null = null;

      if (storedPos) {
        targetButton = targetSection.querySelector(
          `.${classes.cellButton}[data-row="${storedPos.row}"][data-col="${storedPos.col}"]`
        ) as HTMLElement | null;

        if (!targetButton) {
          let minDistance = Infinity;
          for (const btn of allButtons) {
            const row = parseInt(btn.dataset.row || "0", 10);
            const col = parseInt(btn.dataset.col || "0", 10);
            const distance = Math.abs(row - storedPos.row) + Math.abs(col - storedPos.col);
            if (distance < minDistance) {
              minDistance = distance;
              targetButton = btn;
            }
          }
        }
      }

      if (!targetButton) {
        targetButton = allButtons[0];
      }

      if (targetButton) {
        targetButton.focus();
        targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        lastFocusedRef.current = { groupIndex: targetSectionIndex, element: targetButton };
      }
    }
  };

  // Handle arrow navigation
  const handleArrowNavigation = (direction: 'up' | 'down' | 'left' | 'right') => {
    let activeElement = document.activeElement as HTMLElement;
    let currentSection: Element | null = null;
    let currentRow: number;
    let currentCol: number;

    // If currently on a cell button, use it
    if (activeElement?.classList.contains(classes.cellButton)) {
      currentSection = activeElement.closest(`.${classes.dashboardSection}`);
      currentRow = parseInt(activeElement.dataset.row || "0", 10);
      currentCol = parseInt(activeElement.dataset.col || "0", 10);
    } 
    // Otherwise, use last focused position
    else if (lastFocusedRef.current) {
      activeElement = lastFocusedRef.current.element;
      currentSection = activeElement.closest(`.${classes.dashboardSection}`);
      currentRow = parseInt(activeElement.dataset.row || "0", 10);
      currentCol = parseInt(activeElement.dataset.col || "0", 10);
    } 
    // No previous focus, can't navigate
    else {
      return;
    }

    if (!currentSection) return;

    const tableRef = currentSection.querySelector(`.${classes.matrix}`) as HTMLTableElement | null;
    if (!tableRef) return;

    let targetRow = currentRow;
    let targetCol = currentCol;

    switch (direction) {
      case 'up':
        targetRow = currentRow - 1;
        break;
      case 'down':
        targetRow = currentRow + 1;
        break;
      case 'left':
        targetCol = currentCol - 1;
        break;
      case 'right':
        targetCol = currentCol + 1;
        break;
    }

    let targetButton = tableRef.querySelector(
      `.${classes.cellButton}[data-row="${targetRow}"][data-col="${targetCol}"]`
    ) as HTMLElement | null;

    if (!targetButton) {
      const allButtons = Array.from(tableRef.querySelectorAll(`.${classes.cellButton}`)) as HTMLElement[];

      if (direction === 'up' || direction === 'down') {
        const sameColButtons = allButtons.filter(btn =>
          parseInt(btn.dataset.col || "0", 10) === currentCol
        );

        if (direction === 'up') {
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
      } else {
        const sameRowButtons = allButtons.filter(btn =>
          parseInt(btn.dataset.row || "0", 10) === currentRow
        );

        if (direction === 'left') {
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
      targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
      const groupIndex = sections.indexOf(currentSection);
      if (groupIndex !== -1) {
        const row = parseInt(targetButton.dataset.row || "0", 10);
        const col = parseInt(targetButton.dataset.col || "0", 10);
        groupPositionsRef.current.set(groupIndex, { row, col });
        lastFocusedRef.current = { groupIndex, element: targetButton };
      }
    }
  };

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
        targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        
        // Set initial lastFocusedRef
        const section = targetButton.closest(`.${classes.dashboardSection}`);
        if (section) {
          const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
          const groupIndex = sections.indexOf(section);
          if (groupIndex !== -1) {
            lastFocusedRef.current = { groupIndex, element: targetButton };
          }
        }
      }
    });
  }, [lastSelectedCell]);

  // Listen for keydown to handle filter shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      
      // Escape clears filter (works even in input)
      if (e.key === "Escape") {
        if (filter) {
          e.preventDefault();
          onFilterChange("");
        }
        return;
      }
      
      // Skip other shortcuts if in an input
      if (isInInput) return;
      
      // "/" focuses the filter input
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        filterInputRef.current?.focus();
        return;
      }
      
      // Backspace removes last character from filter
      if (e.key === "Backspace" && filter) {
        e.preventDefault();
        onFilterChange(filter.slice(0, -1));
        return;
      }
      
      // Typing characters appends to filter
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onFilterChange(filter + e.key);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filter, onFilterChange]);

  // Handle Tab navigation between dashboard groups and filter input
  useEffect(() => {
    function handleTabNavigation(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const sections = Array.from(document.querySelectorAll(`.${classes.dashboardSection}`));
      const filterInput = filterInputRef.current;

      if (sections.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      
      const isOnCellButton = activeElement?.classList.contains(classes.cellButton);
      const isOnFilterInput = activeElement === filterInput;
      
      if (!isOnCellButton && !isOnFilterInput) return;

      e.preventDefault();

      let currentSectionIndex = -1;
      let isCurrentlyOnFilter = false;
      
      if (isOnFilterInput) {
        isCurrentlyOnFilter = true;
      } else if (isOnCellButton) {
        const currentSection = activeElement.closest(`.${classes.dashboardSection}`);
        if (currentSection) {
          currentSectionIndex = sections.indexOf(currentSection);
          
          // Store current position for this group
          if (currentSectionIndex !== -1) {
            const row = parseInt(activeElement.dataset.row || "0", 10);
            const col = parseInt(activeElement.dataset.col || "0", 10);
            groupPositionsRef.current.set(currentSectionIndex, { row, col });
          }
        }
      }

      // Calculate next section/filter
      let targetSectionIndex = -1;
      let targetIsFilter = false;
      
      const totalSections = sections.length;
      const hasFilter = filterInput !== null;
      
      if (e.shiftKey) {
        // Going backwards
        if (isCurrentlyOnFilter) {
          targetSectionIndex = totalSections - 1;
        } else if (currentSectionIndex === 0) {
          if (hasFilter) {
            targetIsFilter = true;
          } else {
            targetSectionIndex = totalSections - 1;
          }
        } else {
          targetSectionIndex = currentSectionIndex - 1;
        }
      } else {
        // Going forwards
        if (isCurrentlyOnFilter) {
          targetSectionIndex = 0;
        } else if (currentSectionIndex === totalSections - 1) {
          if (hasFilter) {
            targetIsFilter = true;
          } else {
            targetSectionIndex = 0;
          }
        } else {
          targetSectionIndex = currentSectionIndex + 1;
        }
      }

      // Focus the target
      if (targetIsFilter && filterInput) {
        filterInput.focus();
        filterInput.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } else if (targetSectionIndex !== -1) {
        const targetSection = sections[targetSectionIndex] as HTMLElement;
        const allButtons = Array.from(targetSection.querySelectorAll(`.${classes.cellButton}`)) as HTMLElement[];
        
        if (allButtons.length === 0) return;
        
        // Try to use stored position for this group
        const storedPos = groupPositionsRef.current.get(targetSectionIndex);
        let targetButton: HTMLElement | null = null;
        
        if (storedPos) {
          // Try to find button at stored position
          targetButton = targetSection.querySelector(
            `.${classes.cellButton}[data-row="${storedPos.row}"][data-col="${storedPos.col}"]`
          ) as HTMLElement | null;
          
          // If exact position not found, try to find closest button
          if (!targetButton) {
            // Find button with closest row and col
            let minDistance = Infinity;
            for (const btn of allButtons) {
              const row = parseInt(btn.dataset.row || "0", 10);
              const col = parseInt(btn.dataset.col || "0", 10);
              const distance = Math.abs(row - storedPos.row) + Math.abs(col - storedPos.col);
              if (distance < minDistance) {
                minDistance = distance;
                targetButton = btn;
              }
            }
          }
        }
        
        // Fallback to first button if no stored position or button not found
        if (!targetButton) {
          targetButton = allButtons[0];
        }
        
        if (targetButton) {
          targetButton.focus();
          targetButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    }

    document.addEventListener("keydown", handleTabNavigation, true);
    return () => document.removeEventListener("keydown", handleTabNavigation, true);
  }, []);

  const filterWords = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // Handle focusing first button when Enter is pressed in filter
  const handleFilterSubmit = () => {
    const firstButton = document.querySelector(`.${classes.cellButton}`) as HTMLElement | null;
    firstButton?.focus();
  };

  return (
    <div class={classes.dashboard}>
      <div class={classes.header}>
        <NavigationBar
          navigationStack={[]}
          onNavigateToNode={() => {}}
          filterText={filter}
          onFilterTextChange={onFilterChange}
          onFilterClear={() => onFilterChange("")}
          filterInputRef={filterInputRef}
          filterInputTabIndex={0}
          onFilterSubmit={handleFilterSubmit}
        />
      </div>

      <div class={classes.body}>
        <div class={classes.content}>
          {config.groups.map((group, groupIndex) => (
            <DashboardTable 
              key={group.name} 
              group={group} 
              groupIndex={groupIndex}
              filterWords={filterWords}
              groupPositionsRef={groupPositionsRef}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>

      <DashboardShortcutsBar 
        onNextGroup={() => navigateToGroup('next')}
        onPreviousGroup={() => navigateToGroup('previous')}
        onArrowNavigation={handleArrowNavigation}
      />
    </div>
  );
}

interface DashboardTableProps {
  group: DashboardGroup;
  groupIndex: number;
  filterWords: string[];
  groupPositionsRef: { current: Map<number, { row: number; col: number }> };
  onCellClick: (context: string, namespace: string) => void;
}

function DashboardTable({ group, groupIndex, filterWords, groupPositionsRef, onCellClick }: DashboardTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const hasNamespaceGroups = group.namespaceGroups.some((ng) => ng.name !== null);

  const { filtered: filteredContextGroups } = filterContextGroups(group.contextGroups, filterWords);
  const { filtered: filteredNamespaceGroups } = filterNamespaces(group.namespaceGroups, filterWords);

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
              const namespacePrefix = getNamespacePrefixForGroup(ng.namespaces);
              return (
                <NamespaceGroupRows
                  key={ng.name ?? ngIndex}
                  namespaceGroup={ng}
                  filteredContextGroups={filteredContextGroups}
                  showGroupHeader={hasNamespaceGroups}
                  namespacePrefix={namespacePrefix}
                  startRowIndex={startRowIndex}
                  groupIndex={groupIndex}
                  groupPositionsRef={groupPositionsRef}
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
  groupIndex: number;
  groupPositionsRef: { current: Map<number, { row: number; col: number }> };
  tableRef: { current: HTMLTableElement | null };
  onCellClick: (context: string, namespace: string) => void;
}

function NamespaceGroupRows({
  namespaceGroup,
  filteredContextGroups,
  showGroupHeader,
  namespacePrefix,
  startRowIndex,
  groupIndex,
  groupPositionsRef,
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
                      onKeyDown={(e) => handleCellKeyDown(e as unknown as KeyboardEvent, tableRef.current, groupIndex, groupPositionsRef)}
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
