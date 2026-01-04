/**
 * Type declarations for preload APIs
 */

interface TerminalAPI {
  create: (id: string) => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  kill: (id: string) => void;
  onData: (callback: (payload: { id: string; data: string }) => void) => () => void;
}

interface BrowserAPI {
  navigate: (url: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  openDevTools: () => void;
  getURL: () => Promise<string>;
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onNavigate: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    terminal: TerminalAPI;
    browser: BrowserAPI;
  }
}

export {};
