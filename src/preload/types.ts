import type { ElectronAPI } from './index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
