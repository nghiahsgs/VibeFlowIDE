/**
 * Electron Main Process
 * Manages app lifecycle, creates windows, and handles IPC
 */
import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PtyManager } from './pty-manager';
import { BrowserManager } from './browser-manager';
import { MCPBridge } from './mcp-bridge';
import { PortManager } from './port-manager';

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let browserManager: BrowserManager | null = null;
let mcpBridge: MCPBridge | null = null;
let portManager: PortManager | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // Required for node-pty IPC
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  // Initialize managers
  ptyManager = new PtyManager();
  browserManager = new BrowserManager(mainWindow);
  mcpBridge = new MCPBridge(browserManager);
  portManager = new PortManager();

  // Setup IPC handlers
  setupTerminalIPC();
  setupBrowserIPC();
  setupNetworkIPC();
  setupPortsIPC();

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // DevTools disabled by default - use View menu or Cmd+Option+I to open

  mainWindow.on('closed', () => {
    ptyManager?.killAll();
    mcpBridge?.close();
    mainWindow = null;
  });

  // Handle window resize for browser bounds
  mainWindow.on('resize', () => {
    browserManager?.updateBounds();
  });
}

// Terminal IPC handlers
function setupTerminalIPC(): void {
  ipcMain.on('terminal:create', (event, payload: string | { id: string; cwd?: string }) => {
    // Support both old (string) and new ({id, cwd}) formats
    const id = typeof payload === 'string' ? payload : payload.id;
    const cwd = typeof payload === 'string' ? undefined : payload.cwd;

    ptyManager?.create(id, (data) => {
      mainWindow?.webContents.send('terminal:data', { id, data });
    }, cwd);
  });

  ipcMain.on('terminal:write', (_, { id, data }: { id: string; data: string }) => {
    ptyManager?.write(id, data);
  });

  ipcMain.on('terminal:resize', (_, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    ptyManager?.resize(id, cols, rows);
  });

  ipcMain.on('terminal:kill', (_, id: string) => {
    ptyManager?.kill(id);
  });

  ipcMain.handle('terminal:getCwd', async (_, id: string) => {
    return ptyManager?.getCwd(id) || '';
  });
}

// Browser IPC handlers
function setupBrowserIPC(): void {
  ipcMain.on('browser:navigate', (_, url: string) => {
    browserManager?.navigate(url);
  });

  ipcMain.on('browser:back', () => browserManager?.goBack());
  ipcMain.on('browser:forward', () => browserManager?.goForward());
  ipcMain.on('browser:reload', () => browserManager?.reload());
  ipcMain.on('browser:devtools', () => browserManager?.openDevTools());

  ipcMain.handle('browser:url', () => {
    return browserManager?.getCurrentURL() || '';
  });

  ipcMain.on('browser:set-bounds', (_, bounds: { x: number; y: number; width: number; height: number }) => {
    browserManager?.setBounds(bounds);
  });

  ipcMain.handle('browser:console-logs', () => {
    return browserManager?.getConsoleLogs() || [];
  });

  ipcMain.on('browser:clear-console', () => {
    browserManager?.clearConsoleLogs();
  });
}

// Network IPC handlers
function setupNetworkIPC(): void {
  ipcMain.on('network:clear', () => {
    browserManager?.clearNetworkRequests();
  });

  ipcMain.handle('network:get-requests', () => {
    return browserManager?.getNetworkRequests() || [];
  });
}

// Ports IPC handlers
function setupPortsIPC(): void {
  ipcMain.handle('ports:scan', async () => {
    return portManager?.scanPorts() || [];
  });

  ipcMain.handle('ports:kill', async (_, pid: number) => {
    return portManager?.killProcess(pid) || false;
  });

  ipcMain.handle('ports:kill-port', async (_, port: number) => {
    return portManager?.killPort(port) || false;
  });
}

// App lifecycle
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vibeflow.ide');

  // Watch for shortcut keys
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
