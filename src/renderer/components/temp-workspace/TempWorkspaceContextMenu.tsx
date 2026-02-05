import { Copy, FolderOpen, Pencil, Sparkles, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

interface TempWorkspaceContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  path: string;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function TempWorkspaceContextMenu({
  open,
  position,
  path,
  onClose,
  onRename,
  onDelete,
}: TempWorkspaceContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState(position);
  const activities = useWorktreeActivityStore((s) => s.activities);
  const closeAgentSessions = useWorktreeActivityStore((s) => s.closeAgentSessions);
  const closeTerminalSessions = useWorktreeActivityStore((s) => s.closeTerminalSessions);
  const activity = activities[path] || { agentCount: 0, terminalCount: 0 };
  const hasActivity = activity.agentCount > 0 || activity.terminalCount > 0;

  useEffect(() => {
    if (!open) return;
    setMenuPosition(position);
  }, [open, position]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    if (y + rect.height > viewportHeight - 8) {
      y = Math.max(8, viewportHeight - rect.height - 8);
    }
    if (x + rect.width > viewportWidth - 8) {
      x = Math.max(8, viewportWidth - rect.width - 8);
    }
    setMenuPosition({ x, y });
  }, [open, position]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(path);
      toastManager.add({
        title: t('Copied'),
        description: t('Path copied to clipboard'),
        type: 'success',
        timeout: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({
        title: t('Copy failed'),
        description: message || t('Failed to copy content'),
        type: 'error',
        timeout: 3000,
      });
    }
  }, [path, t]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        role="presentation"
      />
      <div
        ref={menuRef}
        className="fixed z-50 min-w-40 rounded-lg border bg-popover p-1 shadow-lg"
        style={{ left: menuPosition.x, top: menuPosition.y }}
      >
        {activity.agentCount > 0 && activity.terminalCount > 0 && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
            onClick={() => {
              onClose();
              closeAgentSessions(path);
              closeTerminalSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            {t('Close All Sessions')}
          </button>
        )}
        {activity.agentCount > 0 && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
            onClick={() => {
              onClose();
              closeAgentSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            <Sparkles className="h-4 w-4" />
            {t('Close Agent Sessions')}
          </button>
        )}
        {activity.terminalCount > 0 && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
            onClick={() => {
              onClose();
              closeTerminalSessions(path);
            }}
          >
            <X className="h-4 w-4" />
            <Terminal className="h-4 w-4" />
            {t('Close Terminal Sessions')}
          </button>
        )}
        {hasActivity && <div className="my-1 h-px bg-border" />}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
          onClick={() => {
            onClose();
            window.electronAPI.shell.openPath(path);
          }}
        >
          <FolderOpen className="h-4 w-4" />
          {t('Open folder')}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
          onClick={() => {
            onClose();
            handleCopyPath();
          }}
        >
          <Copy className="h-4 w-4" />
          {t('Copy Path')}
        </button>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/50"
          onClick={() => {
            onClose();
            onRename();
          }}
        >
          <Pencil className="h-4 w-4" />
          {t('Rename')}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          {t('Delete')}
        </button>
      </div>
    </>
  );
}
