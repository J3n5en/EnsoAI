import { ArrowDown, ArrowUp, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface SyncStatusProps {
  ahead: number;
  behind: number;
  tracking: string | null;
  onPush?: () => void;
  onPull?: () => void;
  onSync?: () => void;
  isPushing?: boolean;
  isPulling?: boolean;
}

export function SyncStatus({
  ahead,
  behind,
  tracking,
  onPush,
  onPull,
  onSync,
  isPushing,
  isPulling,
}: SyncStatusProps) {
  const { t } = useI18n();
  const isLoading = isPushing || isPulling;

  if (!tracking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CloudOff className="h-4 w-4" />
        <span>{t('No remote tracking branch')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        {ahead > 0 && (
          <span className="flex items-center gap-1 text-blue-500">
            <ArrowUp className="h-4 w-4" />
            {ahead}
          </span>
        )}
        {behind > 0 && (
          <span className="flex items-center gap-1 text-orange-500">
            <ArrowDown className="h-4 w-4" />
            {behind}
          </span>
        )}
        {ahead === 0 && behind === 0 && (
          <span className="text-muted-foreground">{t('Up to date')}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {behind > 0 && onPull && (
          <Button variant="outline" size="sm" onClick={onPull} disabled={isLoading}>
            <ArrowDown className={cn('mr-1.5 h-4 w-4', isPulling && 'animate-pulse')} />
            {t('Pull')}
          </Button>
        )}

        {ahead > 0 && onPush && (
          <Button variant="outline" size="sm" onClick={onPush} disabled={isLoading}>
            <ArrowUp className={cn('mr-1.5 h-4 w-4', isPushing && 'animate-pulse')} />
            {t('Push')}
          </Button>
        )}

        {onSync && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onSync}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        )}
      </div>
    </div>
  );
}
