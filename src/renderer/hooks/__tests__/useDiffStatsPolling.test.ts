// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDiffStatsPolling } from '../useDiffStatsPolling';

describe('useDiffStatsPolling', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('fetches initial active paths once as a sorted unique array', () => {
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();

    renderHook(() =>
      useDiffStatsPolling(['C:/worktree-b', 'C:/worktree-a', 'C:/worktree-b'], true, fetchDiffStats)
    );

    expect(fetchDiffStats).toHaveBeenCalledTimes(1);
    expect(fetchDiffStats).toHaveBeenCalledWith(['C:/worktree-a', 'C:/worktree-b']);
  });

  it('does not restart polling for a new array with the same semantic path set', () => {
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();
    const { rerender } = renderHook(
      ({ activePaths }) => useDiffStatsPolling(activePaths, true, fetchDiffStats),
      { initialProps: { activePaths: ['C:/worktree-b', 'C:/worktree-a'] } }
    );

    rerender({ activePaths: ['C:/worktree-a', 'C:/worktree-b', 'C:/worktree-a'] });

    expect(fetchDiffStats).toHaveBeenCalledTimes(1);
  });

  it('polls once after 30 seconds and not before', () => {
    vi.useFakeTimers();
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();

    renderHook(() => useDiffStatsPolling(['C:/worktree-a'], true, fetchDiffStats));

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(fetchDiffStats).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchDiffStats).toHaveBeenCalledTimes(2);
  });

  it('stops polling after unmount', () => {
    vi.useFakeTimers();
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();
    const { unmount } = renderHook(() =>
      useDiffStatsPolling(['C:/worktree-a'], true, fetchDiffStats)
    );

    unmount();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(fetchDiffStats).toHaveBeenCalledTimes(1);
  });

  it('restarts polling immediately when the semantic path set changes', () => {
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();
    const { rerender } = renderHook(
      ({ activePaths }) => useDiffStatsPolling(activePaths, true, fetchDiffStats),
      { initialProps: { activePaths: ['C:/worktree-b'] } }
    );

    rerender({ activePaths: ['C:/worktree-b', 'C:/worktree-a', 'C:/worktree-a'] });

    expect(fetchDiffStats).toHaveBeenCalledTimes(2);
    expect(fetchDiffStats).toHaveBeenLastCalledWith(['C:/worktree-a', 'C:/worktree-b']);
  });

  it('does not fetch while polling is disabled or active paths are empty', () => {
    const fetchDiffStats = vi.fn<(paths: string[]) => Promise<void>>().mockResolvedValue();
    const { rerender } = renderHook(
      ({ activePaths, shouldPoll }) => useDiffStatsPolling(activePaths, shouldPoll, fetchDiffStats),
      { initialProps: { activePaths: ['C:/worktree-a'], shouldPoll: false } }
    );

    rerender({ activePaths: [], shouldPoll: true });

    expect(fetchDiffStats).not.toHaveBeenCalled();
  });
});
