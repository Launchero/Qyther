import type { ElectronAPI as PreloadElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    electronAPI: PreloadElectronAPI;
  }
}

export {};
