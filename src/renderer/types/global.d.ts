/**
 * Global type declarations for renderer process
 * Extends Window interface with preload APIs
 */

interface TerminalAPI {
  create: (id: string, cwd?: string) => void;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  kill: (id: string) => void;
  getCwd: (id: string) => Promise<string>;
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
  getConsoleLogs: () => Promise<string[]>;
  clearConsoleLogs: () => void;
  screenshot: () => Promise<string>;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  type: string;
  mimeType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseSize: number;
  error?: string;
}

interface NetworkAPI {
  onUpdate: (callback: (requests: NetworkRequest[]) => void) => () => void;
  clear: () => void;
  getRequests: () => Promise<NetworkRequest[]>;
}

export interface PortProcess {
  pid: number;
  name: string;
  port: number;
  type: string;
  cwd?: string;
}

interface PortsAPI {
  scan: () => Promise<PortProcess[]>;
  kill: (pid: number) => Promise<boolean>;
  killPort: (port: number) => Promise<boolean>;
}

export interface SimulatorDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Shutting Down' | 'Creating';
  isAvailable: boolean;
  deviceTypeIdentifier: string;
  runtime: string;
  runtimeVersion: string;
}

export interface SimulatorStatus {
  available: boolean;
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  permissionGranted: boolean;
}

interface SimulatorAPI {
  listDevices: () => Promise<SimulatorDevice[]>;
  boot: (udid: string) => Promise<boolean>;
  shutdown: (udid: string) => Promise<boolean>;
  screenshot: () => Promise<string>;
  getStatus: () => Promise<SimulatorStatus>;
  tap: (x: number, y: number) => Promise<boolean>;
  launchApp: (bundleId: string) => Promise<boolean>;
  openUrl: (url: string) => Promise<boolean>;
  startStreaming: (frameRate?: number) => void;
  stopStreaming: () => void;
  onFrame: (callback: (base64: string) => void) => () => void;
}

declare global {
  interface Window {
    terminal: TerminalAPI;
    browser: BrowserAPI;
    network: NetworkAPI;
    ports: PortsAPI;
    simulator: SimulatorAPI;
  }
}

export {};
