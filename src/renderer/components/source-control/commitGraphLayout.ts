import type { GitGraphLogEntry, GitGraphRefs } from '@shared/types';

export const GRAPH_INCOMING_CHANGES_ID = 'scm-graph-incoming-changes';
export const GRAPH_OUTGOING_CHANGES_ID = 'scm-graph-outgoing-changes';

export const GRAPH_COLOR = {
  current: 0,
  remote: 1,
  base: 2,
  firstExtra: 3,
  lastExtra: 7,
} as const;

export type GraphRowKind = 'HEAD' | 'node' | 'incoming' | 'outgoing';
export type GraphSegmentKind = 'straight' | 'branch' | 'merge' | 'dangling';

export interface GraphSegment {
  fromColumn: number;
  toColumn: number;
  kind: GraphSegmentKind;
}

export interface GraphLane {
  hash: string;
  color: number;
}

export interface GraphHistoryItem {
  id: string;
  parentIds: string[];
  commit: GitGraphLogEntry | null;
  label?: string;
  author?: string;
}

export interface GraphRow {
  kind: GraphRowKind;
  historyItem: GraphHistoryItem;
  hash: string;
  parents: string[];
  column: number;
  circleColor: number;
  inputLanes: GraphLane[];
  outputLanes: GraphLane[];
  activeColumns: string[];
  lanes: Array<GraphLane | null>;
  segments: GraphSegment[];
}

function cloneLanes(lanes: GraphLane[]): GraphLane[] {
  return lanes.map((lane) => ({ ...lane }));
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function createReferenceColorMap(refs: GitGraphRefs): Map<string, number> {
  const colorMap = new Map<string, number>();
  if (refs.current) colorMap.set(refs.current.id, GRAPH_COLOR.current);
  if (refs.remote) colorMap.set(refs.remote.id, GRAPH_COLOR.remote);
  if (refs.base) colorMap.set(refs.base.id, GRAPH_COLOR.base);
  return colorMap;
}

function getReferenceColor(
  commit: GitGraphLogEntry,
  colorMap: ReadonlyMap<string, number>
): number | undefined {
  // 多个引用指向同一提交时，按提交数据中的引用顺序决定使用的颜色。
  for (const reference of commit.references) {
    const color = colorMap.get(reference.id);
    if (color !== undefined) return color;
  }
  return undefined;
}

function getColumn(itemId: string, inputLanes: GraphLane[]): number {
  const inputIndex = inputLanes.findIndex((lane) => lane.hash === itemId);
  return inputIndex >= 0 ? inputIndex : inputLanes.length;
}

function buildSegments(
  parentIds: string[],
  column: number,
  outputLanes: GraphLane[],
  knownHashes: ReadonlySet<string>
): GraphSegment[] {
  return parentIds.flatMap((parent, parentIndex) => {
    const parentColumn =
      parentIndex === 0 ? column : outputLanes.map((lane) => lane.hash).lastIndexOf(parent);
    if (parentColumn < 0) return [];

    return [
      {
        fromColumn: column,
        toColumn: parentColumn,
        kind: !knownHashes.has(parent)
          ? ('dangling' as const)
          : parentColumn === column
            ? ('straight' as const)
            : parentIndex > 0
              ? ('merge' as const)
              : ('branch' as const),
      },
    ];
  });
}

function createRow(
  kind: GraphRowKind,
  historyItem: GraphHistoryItem,
  inputLanes: GraphLane[],
  outputLanes: GraphLane[],
  knownHashes: ReadonlySet<string>,
  forcedCircleColor?: number
): GraphRow {
  const column = getColumn(historyItem.id, inputLanes);
  const circleColor =
    forcedCircleColor ??
    (column < outputLanes.length
      ? outputLanes[column].color
      : column < inputLanes.length
        ? inputLanes[column].color
        : GRAPH_COLOR.current);

  return {
    kind,
    historyItem,
    hash: historyItem.id,
    parents: historyItem.parentIds,
    column,
    circleColor,
    inputLanes,
    outputLanes,
    activeColumns: outputLanes.map((lane) => lane.hash),
    lanes: outputLanes.map((lane) => ({ ...lane })),
    segments: buildSegments(historyItem.parentIds, column, outputLanes, knownHashes),
  };
}

/**
 * 算法改写自 Microsoft VS Code：
 * src/vs/workbench/contrib/scm/browser/scmHistory.ts
 * Commit: 74fa2fb017164c88058b1ed8c2dd5c5dadaee47d
 * License: MIT
 */
export function buildCommitGraphLayout(
  commits: GitGraphLogEntry[],
  refs: GitGraphRefs,
  mergeBase: string | null
): GraphRow[] {
  const commitsByHash = new Map<string, GitGraphLogEntry>();
  for (const commit of commits) {
    // 保留第一次出现的提交，与原来的 Array.find 行为一致。
    if (!commitsByHash.has(commit.hash)) commitsByHash.set(commit.hash, commit);
  }
  const knownHashes = new Set(commitsByHash.keys());
  const colorMap = createReferenceColorMap(refs);
  const rows: GraphRow[] = [];
  let nextExtraColor: number = GRAPH_COLOR.firstExtra;

  const allocateExtraColor = () => {
    const color = nextExtraColor;
    nextExtraColor =
      nextExtraColor >= GRAPH_COLOR.lastExtra ? GRAPH_COLOR.firstExtra : nextExtraColor + 1;
    return color;
  };

  for (const commit of commits) {
    const inputLanes = cloneLanes(rows.at(-1)?.outputLanes ?? []);
    const outputLanes: GraphLane[] = [];
    let firstParentAdded = false;

    if (commit.parents.length > 0) {
      for (const lane of inputLanes) {
        if (lane.hash === commit.hash) {
          if (!firstParentAdded) {
            outputLanes.push({
              hash: commit.parents[0],
              color: getReferenceColor(commit, colorMap) ?? lane.color,
            });
            firstParentAdded = true;
          }
          continue;
        }

        outputLanes.push({ ...lane });
      }
    }

    for (let index = firstParentAdded ? 1 : 0; index < commit.parents.length; index++) {
      const parentHash = commit.parents[index];
      const parentCommit = commitsByHash.get(parentHash);
      const color =
        index === 0
          ? getReferenceColor(commit, colorMap)
          : parentCommit
            ? getReferenceColor(parentCommit, colorMap)
            : undefined;

      outputLanes.push({
        hash: parentHash,
        color: color ?? allocateExtraColor(),
      });
    }

    rows.push(
      createRow(
        commit.hash === refs.current?.revision ? 'HEAD' : 'node',
        {
          id: commit.hash,
          parentIds: commit.parents,
          commit,
        },
        inputLanes,
        outputLanes,
        knownHashes,
        getReferenceColor(commit, colorMap)
      )
    );
  }

  addIncomingOutgoingRows(rows, refs, mergeBase, knownHashes);
  return rows;
}

function addIncomingOutgoingRows(
  rows: GraphRow[],
  refs: GitGraphRefs,
  mergeBase: string | null,
  knownHashes: ReadonlySet<string>
): void {
  if (
    !refs.current ||
    !refs.remote ||
    refs.current.revision === refs.remote.revision ||
    !mergeBase
  ) {
    return;
  }

  if (refs.remote.revision !== mergeBase) {
    const beforeIndex = findLastIndex(rows, (row) =>
      row.outputLanes.some((lane) => lane.hash === mergeBase)
    );
    const afterIndex = rows.findIndex((row) => row.historyItem.id === mergeBase);

    if (beforeIndex >= 0 && afterIndex >= 0) {
      const beforeRow = rows[beforeIndex];
      const incomingAlreadyMerged =
        beforeRow.historyItem.parentIds.length === 2 &&
        beforeRow.historyItem.parentIds.includes(mergeBase);

      if (!incomingAlreadyMerged) {
        const replaceRemoteMergeBase = (lane: GraphLane): GraphLane =>
          lane.hash === mergeBase && lane.color === GRAPH_COLOR.remote
            ? { ...lane, hash: GRAPH_INCOMING_CHANGES_ID }
            : lane;

        const nextBeforeRow = {
          ...beforeRow,
          inputLanes: beforeRow.inputLanes.map(replaceRemoteMergeBase),
          outputLanes: beforeRow.outputLanes.map(replaceRemoteMergeBase),
        };
        rows[beforeIndex] = {
          ...nextBeforeRow,
          activeColumns: nextBeforeRow.outputLanes.map((lane) => lane.hash),
          lanes: cloneLanes(nextBeforeRow.outputLanes),
        };

        rows.splice(
          afterIndex,
          0,
          createRow(
            'incoming',
            {
              id: GRAPH_INCOMING_CHANGES_ID,
              parentIds: [mergeBase],
              commit: null,
              label: 'Incoming Changes',
              author: refs.remote.name,
            },
            cloneLanes(rows[beforeIndex].outputLanes),
            cloneLanes(rows[afterIndex].inputLanes),
            knownHashes,
            GRAPH_COLOR.remote
          )
        );
      }
    }
  }

  if (refs.current.revision !== mergeBase) {
    const headIndex = rows.findIndex(
      (row) => row.kind === 'HEAD' && row.historyItem.id === refs.current?.revision
    );
    if (headIndex < 0) return;

    const inputLanes = cloneLanes(rows[headIndex].inputLanes);
    const outputLanes = [
      ...cloneLanes(inputLanes),
      { hash: refs.current.revision, color: GRAPH_COLOR.current },
    ];
    rows.splice(
      headIndex,
      0,
      createRow(
        'outgoing',
        {
          id: GRAPH_OUTGOING_CHANGES_ID,
          parentIds: [refs.current.revision],
          commit: null,
          label: 'Outgoing Changes',
          author: refs.current.name,
        },
        inputLanes,
        outputLanes,
        knownHashes,
        GRAPH_COLOR.current
      )
    );

    const headRow = rows[headIndex + 1];
    rows[headIndex + 1] = {
      ...headRow,
      inputLanes: [
        ...headRow.inputLanes,
        { hash: refs.current.revision, color: GRAPH_COLOR.current },
      ],
    };
  }
}
