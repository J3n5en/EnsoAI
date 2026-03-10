import type { GitBranch } from '@shared/types';
import { GitBranch as GitBranchIcon, Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface BranchSwitcherProps {
  currentBranch: string | null;
  branches?: GitBranch[];
  onCheckout: (branch: string) => void;
  onOpen?: () => void;
  isLoading?: boolean;
  isCheckingOut?: boolean;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function BranchSwitcher({
  currentBranch,
  branches = [],
  onCheckout,
  onOpen,
  isLoading,
  isCheckingOut,
  disabled,
  size = 'md',
}: BranchSwitcherProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and separate branches
  const { localBranches, remoteBranches } = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const local: GitBranch[] = [];
    const remote: GitBranch[] = [];

    for (const branch of branches) {
      if (!branch.name.toLowerCase().includes(query)) continue;

      if (branch.name.startsWith('remotes/')) {
        remote.push(branch);
      } else {
        local.push(branch);
      }
    }

    return { localBranches: local, remoteBranches: remote };
  }, [branches, searchQuery]);

  const handleValueChange = (value: string | null) => {
    if (value && value !== currentBranch) {
      onCheckout(value);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      onOpen?.();
    } else {
      setSearchQuery('');
    }
  };

  const isDisabled = disabled || isLoading || isCheckingOut;

  return (
    <Select
      value={currentBranch || ''}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
    >
      <SelectTrigger
        className={cn(
          'min-w-0 border border-transparent bg-transparent shadow-none ring-0 ring-transparent before:shadow-none before:!shadow-none transition-colors dark:bg-transparent shrink-0 rounded-md',
          'focus-visible:ring-0 focus-visible:border-input hover:ring-0 hover:shadow-none hover:before:shadow-none hover:border-input',
          size === 'xs' &&
            'h-auto min-h-0 w-auto max-w-20 gap-0 px-2 py-1 text-xs text-muted-foreground hover:text-foreground sm:!min-h-0 sm:!h-auto',
          size === 'sm' && 'h-6 min-h-6 w-auto max-w-32 gap-1 px-2 text-xs',
          size === 'md' && 'h-7 min-h-7 w-auto max-w-40 gap-1.5 px-2 text-sm'
        )}
        disabled={isDisabled}
      >
        {isCheckingOut ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        ) : size !== 'xs' ? (
          <GitBranchIcon className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        ) : null}
        <SelectValue className={cn(size === 'xs' && 'text-xs')}>
          {currentBranch || t('Select branch')}
        </SelectValue>
      </SelectTrigger>

      <SelectPopup className="w-56" alignItemWithTrigger={false}>
        {/* Search input */}
        <div className="p-2">
          <div className="relative flex items-center py-2">
            <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t('Search branches...')}
              className="pl-4 text-xs"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {/* Local branches */}
        {!isLoading && localBranches.length > 0 && (
          <SelectGroup>
            <SelectGroupLabel>{t('Local branches')}</SelectGroupLabel>
            {localBranches.map((branch) => (
              <Tooltip key={branch.name}>
                <TooltipTrigger render={<span />}>
                  <SelectItem value={branch.name}>
                    <div className="flex items-center gap-2 min-w-0">
                      {branch.current && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      )}
                      <span className="min-w-0 truncate">{branch.name}</span>
                    </div>
                  </SelectItem>
                </TooltipTrigger>
                <TooltipPopup side="right">{branch.name}</TooltipPopup>
              </Tooltip>
            ))}
          </SelectGroup>
        )}

        {/* Remote branches */}
        {!isLoading && remoteBranches.length > 0 && (
          <SelectGroup>
            <SelectGroupLabel>{t('Remote branches')}</SelectGroupLabel>
            {remoteBranches.map((branch) => (
              <Tooltip key={branch.name}>
                <TooltipTrigger render={<span />}>
                  <SelectItem value={branch.name}>
                    <span className="block min-w-0 truncate">
                      {branch.name.replace('remotes/', '')}
                    </span>
                  </SelectItem>
                </TooltipTrigger>
                <TooltipPopup side="right">{branch.name.replace('remotes/', '')}</TooltipPopup>
              </Tooltip>
            ))}
          </SelectGroup>
        )}

        {/* Empty state */}
        {!isLoading && localBranches.length === 0 && remoteBranches.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            {searchQuery ? t('No branches found') : t('No branches available')}
          </div>
        )}
      </SelectPopup>
    </Select>
  );
}
