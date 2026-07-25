import { cn } from '@/lib/utils';
import type { GraphLane, GraphRow } from './commitGraphLayout';

interface CommitGraphProps {
  row: GraphRow;
  maxColumns: number;
  isSelected: boolean;
  rowHeight?: number;
  columnWidth?: number;
  className?: string;
}

const GRAPH_COLORS = [
  'var(--color-blue-500)',
  'var(--color-violet-700)',
  '#EA5C00',
  '#FFB000',
  '#DC267F',
  '#994F00',
  '#40B0A6',
  '#B66DFF',
] as const;

function getGraphColor(index: number): string {
  return GRAPH_COLORS[index % GRAPH_COLORS.length];
}

function getLaneX(column: number, columnWidth: number): number {
  return 6 + column * columnWidth;
}

function getLanePath(
  fromColumn: number,
  fromY: number,
  toColumn: number,
  toY: number,
  columnWidth: number
): string {
  const fromX = getLaneX(fromColumn, columnWidth);
  const toX = getLaneX(toColumn, columnWidth);
  if (fromColumn === toColumn) return `M ${fromX} ${fromY} L ${toX} ${toY}`;

  const middleY = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${toY}`;
}

function findLastLaneColumn(lanes: GraphLane[], hash: string): number {
  return lanes.map((lane) => lane.hash).lastIndexOf(hash);
}

export function CommitGraph({
  row,
  maxColumns,
  isSelected,
  rowHeight = 22,
  columnWidth = 11,
  className,
}: CommitGraphProps) {
  const graphWidth = Math.max(22, getLaneX(Math.max(0, maxColumns - 1), columnWidth) + 6);
  const centerY = rowHeight / 2;
  const nodeX = getLaneX(row.column, columnWidth);
  const isHollow = row.kind === 'HEAD' || row.kind === 'incoming' || row.kind === 'outgoing';

  return (
    <svg
      aria-hidden="true"
      className={cn('self-stretch', className)}
      height="100%"
      width={graphWidth}
      viewBox={`0 0 ${graphWidth} ${rowHeight}`}
      style={{ pointerEvents: 'none', flexShrink: 0 }}
    >
      {(() => {
        const inputIndex = row.inputLanes.findIndex((lane) => lane.hash === row.hash);
        let outputIndex = 0;
        const paths: React.ReactNode[] = [];

        for (let inputColumn = 0; inputColumn < row.inputLanes.length; inputColumn++) {
          const lane = row.inputLanes[inputColumn];
          if (inputColumn === inputIndex) {
            if (row.parents.length > 0) outputIndex++;
            continue;
          }
          if (lane.hash === row.hash) {
            paths.push(
              <path
                key={`${row.hash}-joining-${inputColumn}`}
                d={getLanePath(inputColumn, 0, row.column, centerY, columnWidth)}
                fill="none"
                stroke={getGraphColor(lane.color)}
                strokeLinecap="round"
                strokeWidth="2"
              />
            );
            continue;
          }
          if (
            outputIndex >= row.outputLanes.length ||
            lane.hash !== row.outputLanes[outputIndex].hash
          ) {
            continue;
          }

          paths.push(
            <path
              key={`${row.hash}-passing-${inputColumn}-${lane.hash}`}
              d={getLanePath(inputColumn, 0, outputIndex, rowHeight, columnWidth)}
              fill="none"
              stroke={getGraphColor(lane.color)}
              strokeLinecap="round"
              strokeWidth="2"
            />
          );
          outputIndex++;
        }

        return paths;
      })()}

      {row.inputLanes[row.column] && (
        <path
          d={getLanePath(row.column, 0, row.column, centerY, columnWidth)}
          fill="none"
          stroke={getGraphColor(row.inputLanes[row.column].color)}
          strokeLinecap="round"
          strokeWidth="2"
        />
      )}

      {row.parents.length > 0 && (
        <path
          d={getLanePath(row.column, centerY, row.column, rowHeight, columnWidth)}
          fill="none"
          stroke={getGraphColor(row.circleColor)}
          strokeLinecap="round"
          strokeWidth="2"
        />
      )}

      {row.parents.slice(1).map((parent, parentIndex) => {
        const outputColumn = findLastLaneColumn(row.outputLanes, parent);
        if (outputColumn < 0) return null;
        const lane = row.outputLanes[outputColumn];

        return (
          <path
            key={`${row.hash}-parent-${parentIndex}-${parent}`}
            d={getLanePath(row.column, centerY, outputColumn, rowHeight, columnWidth)}
            fill="none"
            stroke={getGraphColor(lane.color)}
            strokeLinecap="round"
            strokeWidth="2"
          />
        );
      })}

      <circle
        className={cn(
          isHollow && 'fill-background group-hover:fill-accent',
          isHollow && isSelected && 'fill-accent'
        )}
        cx={nodeX}
        cy={centerY}
        fill={isHollow ? undefined : getGraphColor(row.circleColor)}
        r="4"
        stroke={getGraphColor(row.circleColor)}
        strokeWidth={isHollow ? 2 : 0}
      />
    </svg>
  );
}
