import type { GitGraphReference, GitGraphReferenceKind, GitGraphRefs } from '@shared/types';
import { GRAPH_COLOR } from './commitGraphLayout';

// 引用排序参考 Microsoft VS Code src/vs/workbench/contrib/scm/browser/scmHistory.ts；
// 官方提交 74fa2fb017164c88058b1ed8c2dd5c5dadaee47d，MIT License。
export interface GraphReferenceBadge {
  color: number | null;
  kind: GitGraphReferenceKind;
  names: string[];
  showName: boolean;
}

export function getGraphReferenceColor(
  reference: GitGraphReference,
  refs: GitGraphRefs
): number | undefined {
  if (reference.id === refs.current?.id) return GRAPH_COLOR.current;
  if (reference.id === refs.remote?.id) return GRAPH_COLOR.remote;
  if (reference.id === refs.base?.id) return GRAPH_COLOR.base;
  return undefined;
}

export function sortGraphReferences(
  references: GitGraphReference[],
  refs: GitGraphRefs
): GitGraphReference[] {
  const getOrder = (reference: GitGraphReference): number => {
    if (reference.id === refs.current?.id) return 1;
    if (reference.id === refs.remote?.id) return 2;
    if (reference.id === refs.base?.id) return 3;
    if (getGraphReferenceColor(reference, refs) !== undefined) return 4;
    return 99;
  };

  return references
    .map((reference, index) => ({ reference, index }))
    .sort((left, right) => {
      const order = getOrder(left.reference) - getOrder(right.reference);
      return order !== 0 ? order : left.index - right.index;
    })
    .map(({ reference }) => reference);
}

export function buildGraphReferenceBadges(
  references: GitGraphReference[],
  refs: GitGraphRefs
): GraphReferenceBadge[] {
  const sortedReferences = sortGraphReferences(references, refs);
  const coloredReferences = sortedReferences.flatMap((reference) => {
    const color = getGraphReferenceColor(reference, refs);
    return color === undefined ? [] : [{ reference, color }];
  });
  const tagBadges: GraphReferenceBadge[] = sortedReferences
    .filter((reference) => reference.kind === 'tag')
    .map((reference) => ({
      color: null,
      kind: 'tag',
      names: [reference.name],
      showName: true,
    }));
  if (coloredReferences.length === 0) return tagBadges;

  const [first, ...remaining] = coloredReferences;
  const badges: GraphReferenceBadge[] = [
    {
      color: first.color,
      kind: first.reference.kind,
      names: [first.reference.name],
      showName: true,
    },
  ];
  const groupedBadges = new Map<string, GraphReferenceBadge>();

  for (const { reference, color } of remaining) {
    const key = `${color}:${reference.kind}`;
    const existing = groupedBadges.get(key);
    if (existing) {
      existing.names.push(reference.name);
      continue;
    }

    const badge: GraphReferenceBadge = {
      color,
      kind: reference.kind,
      names: [reference.name],
      showName: false,
    };
    groupedBadges.set(key, badge);
    badges.push(badge);
  }

  return [...badges, ...tagBadges];
}

// 旧列表仍消费短引用字符串；图表接入结构化引用后会停止调用此函数。
export type CommitRefKind = GitGraphReferenceKind;

export interface CommitRefLabel {
  name: string;
  kind: CommitRefKind;
}

export function parseCommitRefs(refs?: string): CommitRefLabel[] {
  if (!refs) return [];

  return refs
    .split(',')
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => {
      if (ref.startsWith('HEAD ->')) {
        return { name: ref.slice('HEAD ->'.length).trim(), kind: 'head' as const };
      }
      if (ref.startsWith('tag:')) {
        return { name: ref.slice('tag:'.length).trim(), kind: 'tag' as const };
      }
      if (ref.startsWith('origin/') || ref.startsWith('remotes/')) {
        return { name: ref.replace(/^remotes\//, ''), kind: 'remote' as const };
      }
      return { name: ref, kind: 'local' as const };
    });
}
