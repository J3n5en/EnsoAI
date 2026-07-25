import type { GitGraphReference, GitGraphRefs } from '@shared/types';
import { Cloud, GitBranch, Tag, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildGraphReferenceBadges } from './commitRefLabels';

interface CommitGraphRefBadgesProps {
  references: GitGraphReference[];
  graphRefs: GitGraphRefs;
  className?: string;
}

const BADGE_ICONS = {
  head: Target,
  local: GitBranch,
  remote: Cloud,
  tag: Tag,
};

const BADGE_COLOR_CLASSES = [
  'bg-blue-500 text-white',
  'bg-violet-700 text-white',
  'bg-[#EA5C00] text-white',
] as const;

const TAG_BADGE_CLASSES = 'bg-amber-500 text-amber-950';

/** 图表行显示重要引用和版本 Tag，完整引用信息保留在悬浮提示中。 */
export function CommitGraphRefBadges({
  references,
  graphRefs,
  className,
}: CommitGraphRefBadgesProps) {
  const badges = buildGraphReferenceBadges(references, graphRefs);
  if (badges.length === 0) return null;

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      {badges.map((badge) => {
        const Icon = BADGE_ICONS[badge.kind];
        const label = badge.showName
          ? badge.names[0]
          : badge.names.length > 1
            ? badge.names.length
            : null;

        return (
          <span
            key={`${badge.color ?? 'tag'}-${badge.kind}-${badge.names.join('|')}`}
            role="img"
            aria-label={badge.names.join(', ')}
            className={cn(
              'inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium leading-none',
              badge.color === null
                ? TAG_BADGE_CLASSES
                : (BADGE_COLOR_CLASSES[badge.color] ?? 'bg-muted text-muted-foreground')
            )}
            title={badge.names.join(', ')}
          >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label !== null && <span>{label}</span>}
          </span>
        );
      })}
    </div>
  );
}
