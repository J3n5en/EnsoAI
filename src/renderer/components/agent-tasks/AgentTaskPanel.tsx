import type { AgentTask } from '@shared/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ListTodo, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { slideRightVariants, springFast } from '@/lib/motion';
import { Z_INDEX } from '@/lib/z-index';
import { useAgentTasksStore } from '@/stores/agentTasks';
import { AgentTaskList } from './AgentTaskList';

interface AgentTaskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToSession: (task: AgentTask) => void;
}

export function AgentTaskPanel({ open, onOpenChange, onNavigateToSession }: AgentTaskPanelProps) {
  const { t } = useI18n();
  const activeTaskCount = useAgentTasksStore((s) => s._activeTaskCountCache);

  // ESC key to close
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={slideRightVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={springFast}
          className="fixed right-0 top-0 bottom-0 flex w-80 flex-col border-l bg-popover shadow-lg no-drag"
          style={{
            zIndex: Z_INDEX.SETTINGS_WINDOW,
          }}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              <span className="font-medium">{t('Agent Tasks')}</span>
              {activeTaskCount > 0 && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-normal text-primary">
                  {activeTaskCount}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              <AgentTaskList onTaskClick={onNavigateToSession} />
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
