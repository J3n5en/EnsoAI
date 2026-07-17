import { useEffect } from 'react';

export function useDiffStatsPolling(
  activePaths: string[],
  shouldPoll: boolean,
  fetchDiffStats: (paths: string[]) => Promise<void>
): void {
  const activePathsKey = JSON.stringify([...new Set(activePaths)].sort());

  useEffect(() => {
    const stablePaths = JSON.parse(activePathsKey) as string[];
    if (stablePaths.length === 0 || !shouldPoll) return;

    fetchDiffStats(stablePaths);
    const interval = setInterval(() => {
      fetchDiffStats(stablePaths);
    }, 30000);
    return () => clearInterval(interval);
  }, [activePathsKey, fetchDiffStats, shouldPoll]);
}
