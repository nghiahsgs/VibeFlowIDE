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

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let browserManager: BrowserManager | null = null;
let mcpBridge: MCPBridge | null = null;

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

  // Setup IPC handlers
  setupTerminalIPC();
  setupBrowserIPC();
  setupNetworkIPC();

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

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
  ipcMain.on('terminal:create', (event, id: string) => {
    ptyManager?.create(id, (data) => {
      mainWindow?.webContents.send('terminal:data', { id, data });
    });
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
