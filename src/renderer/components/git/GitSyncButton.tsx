import { ArrowDown, ArrowUp, CloudUpload, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface GitSyncButtonProps {
  ahead: number;
  behind: number;
  tracking: string | null;
  currentBranch: string | null;
  isSyncing?: boolean;
  onSync?: () => void;
  onPublish?: () => void;
  className?: string;
}

/**
 * Compact git sync button component for displaying ahead/behind status
 * and triggering sync or publish actions.
 */
export function GitSyncButton({
  ahead,
  behind,
  tracking,
  currentBranch,
  isSyncing,
  onSync,
  onPublish,
  className,
}: GitSyncButtonProps) {
  const { t } = useI18n();

  // Publish Button - when no upstream
  if (!tracking && currentBranch && onPublish) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPublish();
        }}
        disabled={isSyncing}
        className={cn(
          'flex items-center gap-1 rounded px-0.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50',
          className
        )}
        title={t('Publish branch to remote')}
      >
        {isSyncing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <CloudUpload className="h-3 w-3" />
            <span>{t('Publish')}</span>
          </>
        )}
      </button>
    );
  }

  // Sync Button - when has upstream and ahead/behind
  if (tracking && (ahead > 0 || behind > 0) && onSync) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSync();
        }}
        disabled={isSyncing}
        className={cn(
          'flex items-center gap-1 rounded px-0.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50',
          className
        )}
        title={t('Sync with remote')}
      >
        {isSyncing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            {ahead > 0 && (
              <span className="flex items-center gap-0.5 text-info">
                <ArrowUp className="h-3 w-3" />
                {ahead}
              </span>
            )}
            {behind > 0 && (
              <span className="flex items-center gap-0.5 text-warning">
                <ArrowDown className="h-3 w-3" />
                {behind}
              </span>
            )}
          </>
        )}
      </button>
    );
  }

  return null;
}
