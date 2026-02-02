import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';
import { GitService } from './GitService';

// 默认间隔：3 分钟
const FETCH_INTERVAL_MS = 3 * 60 * 1000;
// 窗口焦点检查最小间隔：1 分钟
const MIN_FOCUS_INTERVAL_MS = 1 * 60 * 1000;

class GitAutoFetchService {
  private mainWindow: BrowserWindow | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastFetchTime = 0;
  private worktreePaths: Set<string> = new Set();
  private enabled = true;
  private onFocusHandler: (() => void) | null = null;

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

    this.start();
  }

  cleanup(): void {
    this.stop();
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
    }
  }

  registerWorktree(path: string): void {
    this.worktreePaths.add(path);
  }

  unregisterWorktree(path: string): void {
    this.worktreePaths.delete(path);
  }

  clearWorktrees(): void {
    this.worktreePaths.clear();
  }

  private async fetchAll(): Promise<void> {
    if (!this.enabled || this.worktreePaths.size === 0) return;

    this.lastFetchTime = Date.now();

    // 串行执行，避免网络拥堵
    for (const path of this.worktreePaths) {
      try {
        const git = new GitService(path);
        await git.fetch();

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
}

export const gitAutoFetchService = new GitAutoFetchService();
