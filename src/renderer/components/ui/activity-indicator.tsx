import { motion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentActivityState } from '@/stores/worktreeActivity';

interface ActivityIndicatorProps {
  state: AgentActivityState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

const colorClasses: Record<AgentActivityState, string> = {
  idle: '',
  running: 'bg-green-500',
  waiting_input: 'bg-amber-500',
  completed: 'bg-blue-500',
};

const titleKeys: Record<AgentActivityState, string> = {
  idle: '',
  running: 'Agent is running',
  waiting_input: 'Waiting for user input',
  completed: 'Task completed',
};

/**
 * Activity indicator dot for agent status display
 * - running: green with pulse animation
 * - waiting_input: amber with pulse animation
 * - completed: blue, static
 * - idle: hidden
 */
export function ActivityIndicator({ state, size = 'md', className }: ActivityIndicatorProps) {
  const { t } = useI18n();

  if (state === 'idle') return null;

  const isAnimated = state === 'running' || state === 'waiting_input';
  const title = titleKeys[state] ? t(titleKeys[state]) : '';

  return (
    <motion.span
      className={cn(
        'inline-block rounded-full shrink-0',
        sizeClasses[size],
        colorClasses[state],
        className
      )}
      animate={
        isAnimated
          ? state === 'running'
            ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }
            : { opacity: [0.6, 1, 0.6] }
          : undefined
      }
      transition={
        isAnimated
          ? {
              duration: state === 'running' ? 1 : 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }
          : undefined
      }
      title={title}
    />
  );
}
