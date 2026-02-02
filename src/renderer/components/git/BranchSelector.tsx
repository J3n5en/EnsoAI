import type { GitBranch as GitBranchType } from '@shared/types';
import { GitBranch, Plus, RefreshCw, Search } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';

interface BranchSelectorProps {
  branches: GitBranchType[];
  currentBranch: string | null;
  onCheckout: (branch: string) => void;
  onCreateBranch?: (name: string, startPoint?: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function BranchSelector({
  branches,
  currentBranch,
  onCheckout,
  onCreateBranch,
  onRefresh,
  isLoading,
}: BranchSelectorProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = React.useState('');

  const localBranches = branches.filter(
    (b) =>
      !b.name.startsWith('remotes/') && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const remoteBranches = branches.filter(
    (b) => b.name.startsWith('remotes/') && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleValueChange = (value: string | null) => {
    if (value) {
      onCheckout(value);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentBranch || ''} onValueChange={handleValueChange}>
        <SelectTrigger className="w-48">
          <GitBranch className="mr-2 h-4 w-4 shrink-0" />
          <SelectValue>{currentBranch || t('Choose branch...')}</SelectValue>
        </SelectTrigger>
        <SelectPopup className="w-64">
          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search branches...')}
                className="pl-8"
              />
            </div>
          </div>

          {/* Local branches */}
          {localBranches.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {t('Local branches')}
              </div>
              {localBranches.map((branch) => (
                <SelectItem key={branch.name} value={branch.name}>
                  <div className="flex items-center gap-2 w-full">
                    {branch.current && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                    {branch.merged && (
                      <Badge variant="success" size="sm" className="shrink-0">
                        MERGED
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {/* Remote branches */}
          {remoteBranches.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {t('Remote branches')}
              </div>
              {remoteBranches.map((branch) => (
                <SelectItem key={branch.name} value={branch.name}>
                  <div className="flex items-center gap-2 w-full">
                    <span className="min-w-0 flex-1 truncate">
                      {branch.name.replace('remotes/', '')}
                    </span>
                    {branch.merged && (
                      <Badge variant="success" size="sm" className="shrink-0">
                        MERGED
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {/* Create new branch */}
          {onCreateBranch && (
            <>
              <div className="my-1 border-t" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  const name = prompt(t('Enter a new branch name:'));
                  if (name) onCreateBranch(name);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('Create new branch')}
              </button>
            </>
          )}
        </SelectPopup>
      </Select>

      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      )}
    </div>
  );
}
