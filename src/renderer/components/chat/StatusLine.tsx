import {
  Bot,
  Clock,
  Coins,
  Copy,
  Database,
  Folder,
  FolderOpen,
  FolderRoot,
  GitCommitHorizontal,
  Hash,
  PieChart,
  Tag,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { type StatusData, useAgentStatusStore } from '@/stores/agentStatus';
import { type StatusLineFieldSettings, useSettingsStore } from '@/stores/settings';

interface StatusLineProps {
  sessionId: string | null;
  onHeightChange?: (height: number) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}m`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  if (usd < 1) {
    return `$${usd.toFixed(3)}`;
  }
  return `$${usd.toFixed(2)}`;
}

function formatContextPercent(status: StatusData): number {
  const { contextWindow } = status;
  if (!contextWindow?.currentUsage || !contextWindow.contextWindowSize) {
    return 0;
  }

  const { currentUsage, contextWindowSize } = contextWindow;
  const totalUsed =
    currentUsage.inputTokens +
    currentUsage.cacheCreationInputTokens +
    currentUsage.cacheReadInputTokens;
  return Math.round((totalUsed / contextWindowSize) * 100);
}

function formatTokens(input: number, output: number): string {
  const formatNum = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };
  return `${formatNum(input)}/${formatNum(output)}`;
}

function formatCacheTokens(status: StatusData): string {
  const { contextWindow } = status;
  if (!contextWindow?.currentUsage) return '0';
  const { cacheReadInputTokens } = contextWindow.currentUsage;
  if (cacheReadInputTokens >= 1000000) return `${(cacheReadInputTokens / 1000000).toFixed(1)}M`;
  if (cacheReadInputTokens >= 1000) return `${(cacheReadInputTokens / 1000).toFixed(1)}K`;
  return String(cacheReadInputTokens);
}

function formatApiTime(apiMs: number, totalMs: number): string {
  const apiSec = Math.floor(apiMs / 1000);
  const totalSec = Math.floor(totalMs / 1000);
  return `${apiSec}s/${totalSec}s`;
}

function shortenPath(p: string): string {
  // Show last 2 segments for brevity
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `.../${parts.slice(-2).join('/')}`;
}

interface DirItemProps {
  path: string;
  icon: 'folder' | 'folderRoot';
  label: string;
}

function DirItem({ path, icon, label }: DirItemProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const handleCopyPath = useCallback(async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(path);
      toastManager.add({
        title: t('Copied'),
        description: t('Path copied to clipboard'),
        type: 'success',
        timeout: 2000,
      });
    } catch {
      // Ignore clipboard errors
    }
  }, [path, t]);

  const handleOpenFolder = useCallback(() => {
    setOpen(false);
    window.electronAPI.shell.openPath(path);
  }, [path]);

  const Icon = icon === 'folder' ? Folder : FolderRoot;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-1 hover:bg-accent/50"
        title={path}
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </PopoverTrigger>
      <PopoverPopup side="top" sideOffset={8} tooltipStyle className="min-w-[140px]">
        <div className="flex flex-col">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
            onClick={handleOpenFolder}
          >
            <FolderOpen className="h-4 w-4" />
            {t('Open folder')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
            onClick={handleCopyPath}
          >
            <Copy className="h-4 w-4" />
            {t('Copy Path')}
          </button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function StatusLine({ sessionId, onHeightChange }: StatusLineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReportedHeightRef = useRef<number | null>(null);
  const status = useAgentStatusStore((state) =>
    sessionId ? state.statuses[sessionId] : undefined
  );
  const { claudeCodeIntegration } = useSettingsStore();
  const { statusLineEnabled, statusLineFields } = claudeCodeIntegration;

  const items = useMemo(() => {
    if (!status || !statusLineEnabled) {
      return null;
    }

    const elements: React.ReactNode[] = [];
    const fields = statusLineFields as StatusLineFieldSettings;

    // Model
    if (fields.model && status.model?.displayName) {
      elements.push(
        <div key="model" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Bot className="h-5 w-5" />
          <span>{status.model.displayName}</span>
        </div>
      );
    }

    // Context
    if (fields.context && status.contextWindow) {
      const percent = formatContextPercent(status);
      elements.push(
        <div key="context" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <PieChart className="h-5 w-5" />
          <span>{percent}%</span>
        </div>
      );
    }

    // Cost
    if (fields.cost && status.cost?.totalCostUsd !== undefined) {
      elements.push(
        <div key="cost" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Coins className="h-5 w-5" />
          <span>{formatCost(status.cost.totalCostUsd)}</span>
        </div>
      );
    }

    // Duration
    if (fields.duration && status.cost?.totalDurationMs !== undefined) {
      elements.push(
        <div key="duration" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Clock className="h-5 w-5" />
          <span>{formatDuration(status.cost.totalDurationMs)}</span>
        </div>
      );
    }

    // Lines - with color coding like the reference image
    if (
      fields.lines &&
      status.cost?.totalLinesAdded !== undefined &&
      status.cost?.totalLinesRemoved !== undefined
    ) {
      elements.push(
        <div key="lines" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <GitCommitHorizontal className="h-5 w-5" />
          <span className="text-green-500">+{status.cost.totalLinesAdded}</span>
          <span className="text-red-500">-{status.cost.totalLinesRemoved}</span>
        </div>
      );
    }

    // Tokens (input/output)
    if (fields.tokens && status.contextWindow) {
      const { totalInputTokens, totalOutputTokens } = status.contextWindow;
      elements.push(
        <div key="tokens" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Hash className="h-5 w-5" />
          <span>{formatTokens(totalInputTokens, totalOutputTokens)}</span>
        </div>
      );
    }

    // Cache tokens
    if (fields.cache && status.contextWindow?.currentUsage) {
      elements.push(
        <div key="cache" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Database className="h-5 w-5" />
          <span>{formatCacheTokens(status)}</span>
        </div>
      );
    }

    // API Time (api duration / total duration)
    if (
      fields.apiTime &&
      status.cost?.totalApiDurationMs !== undefined &&
      status.cost?.totalDurationMs !== undefined
    ) {
      elements.push(
        <div key="apiTime" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Zap className="h-5 w-5" />
          <span>{formatApiTime(status.cost.totalApiDurationMs, status.cost.totalDurationMs)}</span>
        </div>
      );
    }

    // Current directory
    if (fields.currentDir && status.workspace?.currentDir) {
      elements.push(
        <DirItem
          key="currentDir"
          path={status.workspace.currentDir}
          icon="folder"
          label={shortenPath(status.workspace.currentDir)}
        />
      );
    }

    // Project directory
    if (fields.projectDir && status.workspace?.projectDir) {
      elements.push(
        <DirItem
          key="projectDir"
          path={status.workspace.projectDir}
          icon="folderRoot"
          label={shortenPath(status.workspace.projectDir)}
        />
      );
    }

    // Version
    if (fields.version && status.version) {
      elements.push(
        <div key="version" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Tag className="h-5 w-5" />
          <span>{status.version}</span>
        </div>
      );
    }

    if (elements.length === 0) {
      return null;
    }

    return elements;
  }, [status, statusLineEnabled, statusLineFields]);

  useEffect(() => {
    if (!onHeightChange) return;

    const el = containerRef.current;
    if (!el) {
      lastReportedHeightRef.current = 0;
      onHeightChange(0);
      return;
    }

    const reportHeight = () => {
      // Use getBoundingClientRect() for stable measurement (less sensitive to
      // offsetHeight/contentRect differences), and ceil to avoid 1px oscillations.
      const next = Math.ceil(el.getBoundingClientRect().height);
      if (lastReportedHeightRef.current === next) return;
      lastReportedHeightRef.current = next;
      onHeightChange(next);
    };

    const observer = new ResizeObserver((entries) => {
      // We only care about the element height, so read from `el` directly.
      // This avoids subtle rounding differences between different measurement APIs.
      if (entries.length > 0) {
        reportHeight();
      }
    });

    observer.observe(el);
    reportHeight();

    return () => observer.disconnect();
  }, [onHeightChange]);

  // Report 0 height when not rendering
  useEffect(() => {
    if ((!statusLineEnabled || !items) && onHeightChange) {
      if (lastReportedHeightRef.current !== 0) {
        lastReportedHeightRef.current = 0;
        onHeightChange(0);
      }
    }
  }, [statusLineEnabled, items, onHeightChange]);

  // Don't render if status line is disabled or no data
  if (!statusLineEnabled || !items) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-8 shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-border bg-background px-4 py-1 text-base text-muted-foreground"
    >
      {items}
    </div>
  );
}
