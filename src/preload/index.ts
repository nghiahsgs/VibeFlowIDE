/**
 * Preload Script - Bridge between main process and renderer
 * Exposes safe IPC APIs to renderer via contextBridge
 */
import { contextBridge, ipcRenderer } from 'electron';

// Terminal API
const terminalAPI = {
  create: (id: string, cwd?: string) => ipcRenderer.send('terminal:create', { id, cwd }),
  write: (id: string, data: string) => ipcRenderer.send('terminal:write', { id, data }),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', { id, cols, rows }),
  kill: (id: string) => ipcRenderer.send('terminal:kill', id),
  getCwd: (id: string) => ipcRenderer.invoke('terminal:getCwd', id) as Promise<string>,
  onData: (callback: (payload: { id: string; data: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
      callback(payload);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  }
};

// Browser API
const browserAPI = {
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  back: () => ipcRenderer.send('browser:back'),
  forward: () => ipcRenderer.send('browser:forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  openDevTools: () => ipcRenderer.send('browser:devtools'),
  getURL: () => ipcRenderer.invoke('browser:url') as Promise<string>,
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send('browser:set-bounds', bounds),
  onNavigate: (callback: (url: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('browser:navigated', handler);
    return () => ipcRenderer.removeListener('browser:navigated', handler);
  },
  getConsoleLogs: () => ipcRenderer.invoke('browser:console-logs') as Promise<string[]>,
  clearConsoleLogs: () => ipcRenderer.send('browser:clear-console'),
  screenshot: () => ipcRenderer.invoke('browser:screenshot') as Promise<string>
};

// Network API
const networkAPI = {
  onUpdate: (callback: (requests: unknown[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, requests: unknown[]) => callback(requests);
    ipcRenderer.on('network:update', handler);
    return () => ipcRenderer.removeListener('network:update', handler);
  },
  clear: () => ipcRenderer.send('network:clear'),
  getRequests: () => ipcRenderer.invoke('network:get-requests') as Promise<unknown[]>
};

// Ports API
const portsAPI = {
  scan: () => ipcRenderer.invoke('ports:scan') as Promise<unknown[]>,
  kill: (pid: number) => ipcRenderer.invoke('ports:kill', pid) as Promise<boolean>,
  killPort: (port: number) => ipcRenderer.invoke('ports:kill-port', port) as Promise<boolean>
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('terminal', terminalAPI);
contextBridge.exposeInMainWorld('browser', browserAPI);
contextBridge.exposeInMainWorld('network', networkAPI);
contextBridge.exposeInMainWorld('ports', portsAPI);

// Type declarations for renderer
export type TerminalAPI = typeof terminalAPI;
export type BrowserAPI = typeof browserAPI;
