import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

import { killWindowsProcessTreeAsync } from '../processUtils';

interface FakeChild {
  child: ChildProcess;
  kill: ReturnType<typeof vi.fn>;
}

function createFakeChild(): FakeChild {
  const emitter = new EventEmitter();
  const kill = vi.fn();
  Object.assign(emitter, { kill });
  return {
    child: emitter as unknown as ChildProcess,
    kill,
  };
}

describe('processUtils Windows process cleanup', () => {
  beforeEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
  });

  it('runs taskkill asynchronously and resolves on close', async () => {
    const fake = createFakeChild();
    spawnMock.mockReturnValue(fake.child);

    const pending = killWindowsProcessTreeAsync(4321);

    expect(spawnMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4321', '/t', '/f'],
      expect.objectContaining({ stdio: 'ignore', windowsHide: true })
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();

    fake.child.emit('close', 0);
    await expect(pending).resolves.toBeUndefined();
  });

  it('does not wait forever when taskkill itself hangs', async () => {
    vi.useFakeTimers();
    const fake = createFakeChild();
    spawnMock.mockReturnValue(fake.child);

    const pending = killWindowsProcessTreeAsync(4322, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBeUndefined();
    expect(fake.kill).toHaveBeenCalledTimes(1);
  });

  it('resolves when taskkill cannot start', async () => {
    const fake = createFakeChild();
    spawnMock.mockReturnValue(fake.child);

    const pending = killWindowsProcessTreeAsync(4323);
    fake.child.emit('error', new Error('taskkill unavailable'));

    await expect(pending).resolves.toBeUndefined();
  });
});
