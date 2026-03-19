import { existsSync, type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { GitService } from './GitService';

// Default interval: 3 minutes
const FETCH_INTERVAL_MS = 3 * 60 * 1000;
// Minimum interval between focus-triggered fetches: 1 minute
const MIN_FOCUS_INTERVAL_MS = 1 * 60 * 1000;
// Debounce delay for HEAD file change notifications
const HEAD_CHANGE_DEBOUNCE_MS = 300;

class GitAutoFetchService {
  private mainWindow: BrowserWindow | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastFetchTime = 0;
  private worktreePaths: Set<string> = new Set();
  private enabled = false;
  private fetching = false;
  private onFocusHandler: (() => void) | null = null;
  private headWatchers: Map<string, FSWatcher> = new Map();
  private headDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  init(window: BrowserWindow): void {
    // 防止重复初始化导致多个事件监听器
    if (this.mainWindow) {
      console.warn('GitAutoFetchService already initialized');
      return;
    }
    this.mainWindow = window;

    // 窗口获得焦点时检查（带防抖）
    this.onFocusHandler = () => {
      if (this.enabled) {
        const now = Date.now();
        if (now - this.lastFetchTime >= MIN_FOCUS_INTERVAL_MS) {
          this.fetchAll();
        }
      }
    };
    window.on('focus', this.onFocusHandler);

    if (this.enabled) {
      this.start();
    }
  }

  cleanup(): void {
    this.stop();
    // Collect keys first to avoid modifying Map during iteration
    for (const path of [...this.headWatchers.keys()]) {
      this.unwatchHead(path);
    }
    if (this.mainWindow && this.onFocusHandler) {
      this.mainWindow.off('focus', this.onFocusHandler);
      this.onFocusHandler = null;
    }
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.fetchAll();
    }, FETCH_INTERVAL_MS);

    // 启动后延迟 5 秒执行首次 fetch
    setTimeout(() => this.fetchAll(), 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.start();
    } else {
      this.stop();
      this.fetching = false;
    }
  }

  registerWorktree(path: string): void {
    this.worktreePaths.add(path);
    this.watchHead(path);
  }

  unregisterWorktree(path: string): void {
    this.worktreePaths.delete(path);
    this.unwatchHead(path);
  }

  clearWorktrees(): void {
    for (const path of this.worktreePaths) {
      this.unwatchHead(path);
    }
    this.worktreePaths.clear();
  }

  private async fetchAll(): Promise<void> {
    if (!this.enabled || this.worktreePaths.size === 0 || this.fetching) return;
    this.fetching = true;

    try {
      this.lastFetchTime = Date.now();

      // 串行执行，避免网络拥堵
      for (const path of this.worktreePaths) {
        if (!this.enabled) break;
        try {
          const git = new GitService(path);
          await Promise.race([
            git.fetch(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout')), 30000)),
          ]);

          if (!this.enabled) break;

          // 并行 fetch 已初始化的子模块（带超时控制）
          const submodules = await git.listSubmodules();
          const submodulePromises = submodules
            .filter((s) => s.initialized)
            .map((s) =>
              Promise.race([
                git.fetchSubmodule(s.path),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
              ]).catch((err) => {
                console.debug(`Auto fetch submodule failed for ${s.path}:`, err);
              })
            );
          await Promise.all(submodulePromises);
        } catch (error) {
          // 静默失败，不打扰用户
          console.debug(`Auto fetch failed for ${path}:`, error);
        }
      }
    } finally {
      this.fetching = false;
    }

    // 通知渲染进程刷新状态
    this.notifyCompleted();
  }

  private notifyCompleted(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.GIT_AUTO_FETCH_COMPLETED, {
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Watch the .git/HEAD file for a worktree so branch switches triggered
   * externally (terminal, AI agents) are detected immediately.
   */
  private watchHead(worktreePath: string): void {
    // Avoid duplicate watchers
    if (this.headWatchers.has(worktreePath)) return;

    const headPath = join(worktreePath, '.git', 'HEAD');
    if (!existsSync(headPath)) return;

    try {
      const watcher = watch(headPath, () => {
        // Debounce rapid successive events (e.g. git writes HEAD twice during checkout)
        const existing = this.headDebounceTimers.get(worktreePath);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          this.headDebounceTimers.delete(worktreePath);
          this.notifyCompleted();
        }, HEAD_CHANGE_DEBOUNCE_MS);

        this.headDebounceTimers.set(worktreePath, timer);
      });

      watcher.on('error', () => this.unwatchHead(worktreePath));
      this.headWatchers.set(worktreePath, watcher);
    } catch {
      // Silent fail — polling remains as fallback
    }
  }

  private unwatchHead(worktreePath: string): void {
    const timer = this.headDebounceTimers.get(worktreePath);
    if (timer) {
      clearTimeout(timer);
      this.headDebounceTimers.delete(worktreePath);
    }

    const watcher = this.headWatchers.get(worktreePath);
    if (watcher) {
      watcher.close();
      this.headWatchers.delete(worktreePath);
    }
  }
}

export const gitAutoFetchService = new GitAutoFetchService();
