export interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
  title?: string;
  userEdited?: boolean;
}

export interface TerminalGroup {
  id: string;
  tabs: TerminalTab[];
  activeTabId: string | null;
}

export interface TerminalPanelState {
  groups: TerminalGroup[];
  activeGroupId: string;
  // Per-worktree tracking: which group is active for each worktree
  activeGroupIds: Record<string, string>;
}

export function createInitialGroup(): TerminalGroup {
  return {
    id: crypto.randomUUID(),
    tabs: [],
    activeTabId: null,
  };
}

export function getNextTabName(tabs: TerminalTab[], forCwd: string): string {
  const cwdTabs = tabs.filter((t) => t.cwd === forCwd);
  const numbers = cwdTabs
    .map((t) => {
      const match = t.name.match(/^Untitled-(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `Untitled-${max + 1}`;
}
