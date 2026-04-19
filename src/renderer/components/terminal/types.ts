import { pathsEqual } from '@/App/storage';

export interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
  title?: string;
  userEdited?: boolean;
  initialCommand?: string;
}

export interface TerminalGroup {
  id: string;
  tabs: TerminalTab[];
  activeTabId: string | null;
}

export function getNextTabName(tabs: TerminalTab[], forCwd: string): string {
  const cwdTabs = tabs.filter((t) => pathsEqual(t.cwd, forCwd));
  const numbers = cwdTabs
    .map((t) => {
      const match = t.name.match(/^Untitled-(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `Untitled-${max + 1}`;
}
