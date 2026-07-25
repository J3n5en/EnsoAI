import type {
  GitGraphRef,
  GitGraphReference,
  GitGraphReferenceKind,
  GitGraphRefs,
} from '@shared/types';

// 引用解析参考 Microsoft VS Code extensions/git/src/historyProvider.ts 与 extensions/git/src/git.ts；
// 官方提交 74fa2fb017164c88058b1ed8c2dd5c5dadaee47d，MIT License。
const ORIGIN_HEAD = 'refs/remotes/origin/HEAD';

export function isMissingGitRevisionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.toLowerCase().includes('needed a single revision');
}

export function getGitGraphRefName(id: string): string {
  if (id === 'HEAD') return 'HEAD';

  return id
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^refs\/tags\//, '');
}

function getReferenceKind(id: string, isHead: boolean): GitGraphReferenceKind | null {
  if (isHead || id === 'HEAD') return 'head';
  if (id.startsWith('refs/heads/')) return 'local';
  if (id.startsWith('refs/remotes/')) return 'remote';
  if (id.startsWith('refs/tags/')) return 'tag';
  return null;
}

export function parseGitGraphReferences(
  refs: string | undefined,
  revision: string
): GitGraphReference[] {
  if (!refs) return [];

  return refs.split(',').flatMap((rawRef) => {
    const value = rawRef.trim();
    const isHead = value.startsWith('HEAD -> ');
    const isTag = value.startsWith('tag: ');
    const id = isHead
      ? value.slice('HEAD -> '.length)
      : isTag
        ? value.slice('tag: '.length)
        : value;

    // VS Code 的 Git 扩展会排除此符号引用，避免与真实远程分支重复显示。
    if (id === ORIGIN_HEAD) return [];

    const kind = getReferenceKind(id, isHead);
    if (!kind) return [];

    return [{ id, name: getGitGraphRefName(id), revision, kind }];
  });
}

export function normalizeGitGraphRefs(
  current: GitGraphRef | null,
  remote: GitGraphRef | null,
  base: GitGraphRef | null
): GitGraphRefs {
  return {
    current,
    remote,
    base: base?.id === remote?.id ? null : base,
  };
}
