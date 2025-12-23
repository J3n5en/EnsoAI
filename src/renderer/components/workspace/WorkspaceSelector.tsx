import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger } from '@/components/ui/select';
import type { WorkspaceRecord } from '@shared/types';
import { ChevronDown, Folder, FolderOpen, Plus, Search } from 'lucide-react';
import * as React from 'react';

interface WorkspaceSelectorProps {
  workspaces: WorkspaceRecord[];
  currentWorkspace: WorkspaceRecord | null;
  onSelect: (workspace: WorkspaceRecord) => void;
  onCreateNew?: () => void;
  onOpenFolder?: () => void;
  isLoading?: boolean;
}

export function WorkspaceSelector({
  workspaces,
  currentWorkspace,
  onSelect,
  onCreateNew,
  onOpenFolder,
}: WorkspaceSelectorProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const filteredWorkspaces = workspaces.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIndicator = (_workspace: WorkspaceRecord) => {
    // TODO: Get actual status from git
    const hasUncommittedChanges = false;
    const hasUnpushedCommits = false;

    if (hasUncommittedChanges) {
      return <span className="h-2 w-2 rounded-full bg-green-500" />;
    }
    if (hasUnpushedCommits) {
      return <span className="h-2 w-2 rounded-full bg-blue-500" />;
    }
    return null;
  };

  const handleValueChange = (value: string | null) => {
    if (!value) return;
    const workspace = workspaces.find((w) => w.id?.toString() === value);
    if (workspace) onSelect(workspace);
  };

  return (
    <Select
      value={currentWorkspace?.id?.toString() || ''}
      onValueChange={handleValueChange}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger className="h-12 w-full justify-between border-0 bg-transparent px-3 hover:bg-accent">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{currentWorkspace?.name || '选择工作区'}</span>
          {currentWorkspace && getStatusIndicator(currentWorkspace)}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </SelectTrigger>

      <SelectPopup className="w-64">
        {/* Search */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工作区..."
              className="pl-8"
            />
          </div>
        </div>

        {/* Workspace list */}
        <div className="max-h-64 overflow-y-auto">
          {filteredWorkspaces.length > 0 ? (
            filteredWorkspaces.map((workspace) => (
              <SelectItem
                key={workspace.id}
                value={workspace.id?.toString() || ''}
                className="flex items-center gap-2"
              >
                <div className="flex items-center gap-2">
                  {workspace.id === currentWorkspace?.id ? (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  ) : (
                    <span className="h-2 w-2" />
                  )}
                  <span className="truncate">{workspace.name}</span>
                  {getStatusIndicator(workspace)}
                </div>
              </SelectItem>
            ))
          ) : (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {searchQuery ? '未找到匹配的工作区' : '暂无工作区'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t p-1">
          {onCreateNew && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
            >
              <Plus className="h-4 w-4" />
              新建工作区
            </button>
          )}
          {onOpenFolder && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setOpen(false);
                onOpenFolder();
              }}
            >
              <FolderOpen className="h-4 w-4" />
              打开文件夹
            </button>
          )}
        </div>
      </SelectPopup>
    </Select>
  );
}
