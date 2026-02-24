import { KanbanSquare } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';
import { KanbanBoard } from './KanbanBoard';

interface TodoPanelProps {
  repoPath?: string;
  worktreePath?: string;
  isActive?: boolean;
  onSwitchToAgent?: () => void;
}

export function TodoPanel({ repoPath, worktreePath, onSwitchToAgent }: TodoPanelProps) {
  const { t } = useI18n();

  if (!repoPath) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty className="border-0">
          <EmptyMedia variant="icon">
            <KanbanSquare className="h-4.5 w-4.5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t('No repository selected')}</EmptyTitle>
            <EmptyDescription>{t('Select a repository to manage tasks')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <KanbanBoard
        repoPath={repoPath}
        worktreePath={worktreePath}
        onSwitchToAgent={onSwitchToAgent}
      />
    </div>
  );
}
