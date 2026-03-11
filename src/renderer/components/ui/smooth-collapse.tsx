import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SmoothCollapseProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * GPU-accelerated collapse animation using CSS grid-template-rows.
 * Best for natural-height content (lists, tree nodes). Not suitable for
 * flex-allocated panels where height depends on sibling sizing.
 */
export function SmoothCollapse({ open, children, className }: SmoothCollapseProps) {
  return (
    <div
      className={cn(
        'grid min-h-0 transition-[grid-template-rows,opacity] duration-200 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
    >
      <div className={cn('min-h-0 overflow-hidden', className)}>{children}</div>
    </div>
  );
}
