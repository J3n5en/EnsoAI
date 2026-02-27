import { is } from '@electron-toolkit/utils';
import type { ProxySettings } from '@shared/types';
import type { BrowserWindow } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';
import { getUpdaterProxyConfig } from '../proxy/ProxyConfig';

const { autoUpdater } = electronUpdater;

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: UpdateInfo;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    total: number;
    transferred: number;
  };
  error?: string;
}

// Check interval: 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// Minimum interval between focus checks: 30 minutes
const MIN_FOCUS_CHECK_INTERVAL_MS = 30 * 60 * 1000;

class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateDownloaded = false;
  private _isQuittingForUpdate = false;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private lastCheckTime = 0;
  private onFocusHandler: (() => void) | null = null;

  init(window: BrowserWindow, autoUpdateEnabled = true): void {
    this.mainWindow = window;

    // Enable logging in dev mode
    if (is.dev) {
      autoUpdater.logger = console;
    }

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      this.sendStatus({ status: 'available', info });
    });

    autoUpdater.on('update-not-available', (info) => {
      this.sendStatus({ status: 'not-available', info });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendStatus({
        status: 'downloading',
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          total: progress.total,
          transferred: progress.transferred,
        },
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.updateDownloaded = true;
      // Stop all future update checks to prevent race conditions
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
      this.sendStatus({ status: 'downloaded', info });
    });

    autoUpdater.on('error', (error) => {
      this.sendStatus({ status: 'error', error: error.message });
    });

    autoUpdater.autoDownload = autoUpdateEnabled;

    // Check on window focus (with 30-minute debounce)
    this.onFocusHandler = () => {
      if (autoUpdater.autoDownload) {
        const now = Date.now();
        if (now - this.lastCheckTime >= MIN_FOCUS_CHECK_INTERVAL_MS) {
          this.checkForUpdates();
        }
      }
    };
    window.on('focus', this.onFocusHandler);

    // Apply initial auto-update setting
    this.setAutoUpdateEnabled(autoUpdateEnabled);
  }

  cleanup(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    if (this.mainWindow && this.onFocusHandler) {
      this.mainWindow.off('focus', this.onFocusHandler);
      this.onFocusHandler = null;
    }
  }

  private sendStatus(status: UpdateStatus): void {
    // Once update is downloaded, don't send other status updates
    // This prevents the update dialog from disappearing due to subsequent checks
    if (this.updateDownloaded && status.status !== 'downloaded') {
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status', status);
    }
  }

  async checkForUpdates(): Promise<void> {
    // Skip if update already downloaded to prevent race conditions
    if (this.updateDownloaded) {
      return;
    }
    try {
      this.lastCheckTime = Date.now();
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      throw error;
    }
  }

  quitAndInstall(): void {
    if (this.updateDownloaded) {
      this._isQuittingForUpdate = true;
      autoUpdater.quitAndInstall();
    }
  }

  isUpdateDownloaded(): boolean {
    return this.updateDownloaded;
  }

  isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  setAutoUpdateEnabled(enabled: boolean): void {
    autoUpdater.autoDownload = enabled;
    autoUpdater.autoInstallOnAppQuit = enabled;

    if (enabled) {
      if (!this.checkIntervalId) {
        this.checkIntervalId = setInterval(() => {
          this.checkForUpdates();
        }, CHECK_INTERVAL_MS);
      }
      setTimeout(() => this.checkForUpdates(), 3000);
    } else {
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
    }
  }

  /**
   * Apply proxy settings directly to electron-updater's dedicated session.
   * electron-updater uses session.fromPartition("electron-updater") with
   * electron.net.request(), which respects session-level proxy config.
   * builder-util-runtime does not read process.env for proxy settings.
   *
   * @param settings - Optional settings to use directly (e.g. read from disk at
   *   startup). When omitted, falls back to the current module-level proxy state.
   */
  async applyCurrentProxySettings(settings?: ProxySettings): Promise<void> {
    const config = settings != null ? getUpdaterProxyConfig(settings) : getUpdaterProxyConfig();
    await this.applyUpdaterProxyConfig(config);
  }

  private async applyUpdaterProxyConfig(config: Electron.ProxyConfig | null): Promise<void> {
    if (config) {
      await autoUpdater.netSession.setProxy(config);
    } else {
      await autoUpdater.netSession.setProxy({ mode: 'direct' });
    }
  }
}

export const autoUpdaterService = new AutoUpdaterService();
