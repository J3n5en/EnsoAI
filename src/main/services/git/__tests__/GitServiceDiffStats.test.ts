import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';

const { createSimpleGitMock, diffMock } = vi.hoisted(() => ({
  createSimpleGitMock: vi.fn<(workdir: string) => { diff: (args: string[]) => Promise<string> }>(),
  diffMock: vi.fn<(args: string[]) => Promise<string>>(),
}));

vi.mock('../runtime', () => ({
  createSimpleGit: createSimpleGitMock,
}));

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('GitService.getDiffStats', () => {
  beforeEach(() => {
    createSimpleGitMock.mockReset();
    diffMock.mockReset();
    createSimpleGitMock.mockReturnValue({ diff: diffMock });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one pending diff request between concurrent callers', async () => {
    const pendingDiff = createDeferred<string>();
    diffMock.mockReturnValue(pendingDiff.promise);
    const service = new GitService('C:\\example.invalid\\repo');

    const first = service.getDiffStats();
    const second = service.getDiffStats();

    expect(diffMock).toHaveBeenCalledTimes(1);
    pendingDiff.resolve(' 3 files changed, 10 insertions(+), 5 deletions(-)');

    await expect(Promise.all([first, second])).resolves.toEqual([
      { insertions: 10, deletions: 5 },
      { insertions: 10, deletions: 5 },
    ]);
  });

  it('keeps cache and in-flight work isolated per GitService instance', async () => {
    const firstPendingDiff = createDeferred<string>();
    const secondPendingDiff = createDeferred<string>();
    const firstDiff = vi
      .fn<(args: string[]) => Promise<string>>()
      .mockReturnValue(firstPendingDiff.promise);
    const secondDiff = vi
      .fn<(args: string[]) => Promise<string>>()
      .mockReturnValue(secondPendingDiff.promise);
    createSimpleGitMock
      .mockReset()
      .mockReturnValueOnce({ diff: firstDiff })
      .mockReturnValueOnce({ diff: secondDiff });
    const firstService = new GitService('C:\\example.invalid\\repo-one');
    const secondService = new GitService('C:\\example.invalid\\repo-two');

    const firstRequest = firstService.getDiffStats();
    const secondRequest = secondService.getDiffStats();

    expect(firstDiff).toHaveBeenCalledTimes(1);
    expect(secondDiff).toHaveBeenCalledTimes(1);
    firstPendingDiff.resolve(' 1 file changed, 3 insertions(+), 1 deletion(-)');
    secondPendingDiff.resolve(' 2 files changed, 8 insertions(+), 5 deletions(-)');
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { insertions: 3, deletions: 1 },
      { insertions: 8, deletions: 5 },
    ]);

    await expect(firstService.getDiffStats()).resolves.toEqual({ insertions: 3, deletions: 1 });
    await expect(secondService.getDiffStats()).resolves.toEqual({ insertions: 8, deletions: 5 });
    expect(firstDiff).toHaveBeenCalledTimes(1);
    expect(secondDiff).toHaveBeenCalledTimes(1);
  });

  it('reuses a completed result at 1,999 ms and refreshes it at exactly 2,000 ms', async () => {
    diffMock
      .mockResolvedValueOnce(' 1 file changed, 3 insertions(+), 1 deletion(-)')
      .mockResolvedValueOnce(' 2 files changed, 8 insertions(+), 2 deletions(-)');
    const service = new GitService('C:\\example.invalid\\repo');

    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 3, deletions: 1 });

    vi.advanceTimersByTime(1_999);
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 3, deletions: 1 });
    expect(diffMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 8, deletions: 2 });
    expect(diffMock).toHaveBeenCalledTimes(2);
  });

  it('starts the full cache TTL when a long-running diff resolves', async () => {
    const pendingDiff = createDeferred<string>();
    diffMock
      .mockReturnValueOnce(pendingDiff.promise)
      .mockResolvedValueOnce(' 2 files changed, 9 insertions(+), 3 deletions(-)');
    const service = new GitService('C:\\example.invalid\\repo');

    const first = service.getDiffStats();
    vi.advanceTimersByTime(5_000);
    pendingDiff.resolve(' 1 file changed, 4 insertions(+), 2 deletions(-)');
    await expect(first).resolves.toEqual({ insertions: 4, deletions: 2 });

    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 4, deletions: 2 });
    vi.advanceTimersByTime(1_999);
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 4, deletions: 2 });
    expect(diffMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 9, deletions: 3 });
    expect(diffMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['empty output', () => Promise.resolve('')],
    ['a git error', () => Promise.reject(new Error('HEAD is unavailable'))],
  ])('caches the zero fallback for %s', async (_caseName, runDiff) => {
    diffMock.mockImplementation(runDiff);
    const service = new GitService('C:\\example.invalid\\repo');

    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 0, deletions: 0 });
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 0, deletions: 0 });

    expect(diffMock).toHaveBeenCalledTimes(1);
  });

  it('clears completed in-flight state so an expired request can run normally', async () => {
    const pendingDiff = createDeferred<string>();
    diffMock
      .mockReturnValueOnce(pendingDiff.promise)
      .mockResolvedValueOnce(' 1 file changed, 7 insertions(+), 4 deletions(-)');
    const service = new GitService('C:\\example.invalid\\repo');

    const first = service.getDiffStats();
    const concurrent = service.getDiffStats();
    pendingDiff.resolve(' 1 file changed, 2 insertions(+), 1 deletion(-)');

    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      { insertions: 2, deletions: 1 },
      { insertions: 2, deletions: 1 },
    ]);
    expect(diffMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_001);
    await expect(service.getDiffStats()).resolves.toEqual({ insertions: 7, deletions: 4 });
    expect(diffMock).toHaveBeenCalledTimes(2);
  });
});
