# Phase 2: Simulator Manager

**Date:** 2026-01-04
**Status:** Pending
**Priority:** High
**Estimated:** 4 hours

## Context Links

- Types: `plans/260104-ios-simulator-panel/phase-01-architecture.md`
- Research: `plans/reports/researcher-260104-ios-simulator-electron-integration.md`
- Pattern: `src/main/browser-manager.ts`

## Overview

Implement SimulatorManager class in main process. Wraps xcrun simctl commands and provides desktopCapturer-based screen streaming.

## Key Insights

1. xcrun simctl returns JSON with `--json` flag - easy parsing
2. desktopCapturer needs window matching by name ("Simulator")
3. Screenshot via xcrun takes ~150-300ms, desktopCapturer is real-time
4. Simulator must be booted before most commands work

## Requirements

- [ ] List all available simulator devices with state
- [ ] Boot/shutdown specific device by UDID
- [ ] Take single screenshot (for MCP)
- [ ] Stream frames to renderer (for panel)
- [ ] Execute tap at coordinates
- [ ] Launch app by bundle ID
- [ ] Open URL in simulator

## Architecture

### Class Structure

```typescript
// src/main/simulator-manager.ts

export class SimulatorManager {
  private parentWindow: BrowserWindow;
  private streamingInterval: NodeJS.Timer | null = null;
  private isStreaming = false;
  private currentFrameRate = 30;

  constructor(parentWindow: BrowserWindow) { }

  // Device management
  listDevices(): SimulatorDevice[]
  bootDevice(udid: string): Promise<void>
  shutdownDevice(udid: string): Promise<void>
  getBootedDevice(): SimulatorDevice | null

  // Screen capture
  screenshot(): Promise<string> // base64
  startStreaming(frameRate?: number): void
  stopStreaming(): void

  // Interaction
  tap(x: number, y: number): Promise<void>
  launchApp(bundleId: string): Promise<void>
  openUrl(url: string): Promise<void>

  // Status
  getStatus(): SimulatorStatus
  isAvailable(): boolean
}
```

## Implementation Steps

### 1. Create SimulatorManager class

```typescript
// src/main/simulator-manager.ts
import { BrowserWindow, desktopCapturer, systemPreferences } from 'electron';
import { execSync, spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { SimulatorDevice, SimulatorStatus, SimulatorListResponse } from './simulator-types';

export class SimulatorManager {
  private parentWindow: BrowserWindow;
  private streamingInterval: NodeJS.Timer | null = null;
  private isStreaming = false;

  constructor(parentWindow: BrowserWindow) {
    this.parentWindow = parentWindow;
  }

  /**
   * Check if simctl is available (Xcode installed)
   */
  isAvailable(): boolean {
    try {
      execSync('xcrun simctl help', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available simulator devices
   */
  listDevices(): SimulatorDevice[] {
    try {
      const output = execSync('xcrun simctl list --json devices available', {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });

      const data = JSON.parse(output) as { devices: Record<string, SimulatorDevice[]> };
      const devices: SimulatorDevice[] = [];

      for (const [runtime, runtimeDevices] of Object.entries(data.devices)) {
        // Extract version from runtime identifier
        // e.g., "com.apple.CoreSimulator.SimRuntime.iOS-17-2" -> "17.2"
        const versionMatch = runtime.match(/iOS-(\d+)-(\d+)/);
        const runtimeVersion = versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : '';

        for (const device of runtimeDevices) {
          if (device.isAvailable) {
            devices.push({
              ...device,
              runtime,
              runtimeVersion
            });
          }
        }
      }

      // Sort by runtime version (newest first), then by name
      return devices.sort((a, b) => {
        const versionCompare = b.runtimeVersion.localeCompare(a.runtimeVersion);
        if (versionCompare !== 0) return versionCompare;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Failed to list devices:', error);
      return [];
    }
  }

  /**
   * Get currently booted device (if any)
   */
  getBootedDevice(): SimulatorDevice | null {
    const devices = this.listDevices();
    return devices.find(d => d.state === 'Booted') || null;
  }

  /**
   * Boot a simulator device
   */
  async bootDevice(udid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'boot', udid]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to boot device (exit code ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Shutdown a simulator device
   */
  async shutdownDevice(udid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'shutdown', udid]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to shutdown device (exit code ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Take screenshot using xcrun simctl
   * Returns base64 encoded PNG
   */
  async screenshot(): Promise<string> {
    const tmpPath = `/tmp/vibeflow-sim-${Date.now()}.png`;

    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'io', 'booted', 'screenshot', tmpPath]);

      proc.on('close', (code) => {
        if (code === 0 && existsSync(tmpPath)) {
          try {
            const buffer = readFileSync(tmpPath);
            unlinkSync(tmpPath);
            resolve(buffer.toString('base64'));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('Screenshot failed - is simulator booted?'));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Start streaming frames to renderer using desktopCapturer
   */
  async startStreaming(frameRate = 30): Promise<void> {
    if (this.isStreaming) return;

    // Check screen recording permission
    const permission = systemPreferences.getMediaAccessStatus('screen');
    if (permission !== 'granted') {
      // Fall back to xcrun polling
      this.startPollingStream(frameRate);
      return;
    }

    this.isStreaming = true;

    // Use desktopCapturer approach
    const captureFrame = async () => {
      if (!this.isStreaming) return;

      try {
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 540, height: 1170 }, // iPhone 15 Pro aspect
          fetchWindowIcons: false
        });

        // Find Simulator window
        const simSource = sources.find(s =>
          s.name.includes('Simulator') ||
          s.name.includes('iPhone') ||
          s.name.includes('iPad')
        );

        if (simSource && simSource.thumbnail) {
          const base64 = simSource.thumbnail.toDataURL().split(',')[1];
          this.parentWindow.webContents.send('simulator:frame', base64);
        }
      } catch (error) {
        console.error('Frame capture error:', error);
      }
    };

    // Start capture loop
    const intervalMs = Math.floor(1000 / frameRate);
    this.streamingInterval = setInterval(captureFrame, intervalMs);

    // Capture first frame immediately
    captureFrame();
  }

  /**
   * Fallback: polling with xcrun screenshots
   */
  private startPollingStream(frameRate = 2): void {
    // Lower frame rate for polling (CPU intensive)
    const effectiveRate = Math.min(frameRate, 5);

    this.isStreaming = true;

    const captureFrame = async () => {
      if (!this.isStreaming) return;

      try {
        const base64 = await this.screenshot();
        this.parentWindow.webContents.send('simulator:frame', base64);
      } catch {
        // Ignore errors, device might not be booted
      }
    };

    const intervalMs = Math.floor(1000 / effectiveRate);
    this.streamingInterval = setInterval(captureFrame, intervalMs);
    captureFrame();
  }

  /**
   * Stop streaming frames
   */
  stopStreaming(): void {
    this.isStreaming = false;
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
  }

  /**
   * Tap at coordinates
   */
  async tap(x: number, y: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Note: simctl doesn't have direct tap command
      // Use AppleScript or simctl's undocumented features
      // For now, we'll use the io command approach
      const proc = spawn('xcrun', [
        'simctl', 'io', 'booted', 'input', 'tap', x.toString(), y.toString()
      ]);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Tap failed'));
      });

      proc.on('error', reject);
    });
  }

  /**
   * Launch app by bundle ID
   */
  async launchApp(bundleId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'launch', 'booted', bundleId]);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to launch ${bundleId}`));
      });

      proc.on('error', reject);
    });
  }

  /**
   * Open URL in simulator
   */
  async openUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'openurl', 'booted', url]);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to open URL: ${url}`));
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get current simulator status
   */
  async getStatus(): Promise<SimulatorStatus> {
    const permission = systemPreferences.getMediaAccessStatus('screen');

    return {
      available: this.isAvailable(),
      bootedDevice: this.getBootedDevice(),
      isStreaming: this.isStreaming,
      permissionGranted: permission === 'granted'
    };
  }

  /**
   * Cleanup on app close
   */
  destroy(): void {
    this.stopStreaming();
  }
}
```

### 2. Add IPC handlers in main/index.ts

```typescript
// Add to src/main/index.ts

import { SimulatorManager } from './simulator-manager';

let simulatorManager: SimulatorManager | null = null;

// In createWindow():
simulatorManager = new SimulatorManager(mainWindow);

// Add function:
function setupSimulatorIPC(): void {
  ipcMain.handle('simulator:list-devices', () => {
    return simulatorManager?.listDevices() || [];
  });

  ipcMain.handle('simulator:boot', async (_, udid: string) => {
    await simulatorManager?.bootDevice(udid);
    return true;
  });

  ipcMain.handle('simulator:shutdown', async (_, udid: string) => {
    await simulatorManager?.shutdownDevice(udid);
    return true;
  });

  ipcMain.handle('simulator:screenshot', async () => {
    return simulatorManager?.screenshot() || '';
  });

  ipcMain.handle('simulator:status', async () => {
    return simulatorManager?.getStatus();
  });

  ipcMain.handle('simulator:tap', async (_, { x, y }: { x: number; y: number }) => {
    await simulatorManager?.tap(x, y);
    return true;
  });

  ipcMain.handle('simulator:launch-app', async (_, bundleId: string) => {
    await simulatorManager?.launchApp(bundleId);
    return true;
  });

  ipcMain.handle('simulator:open-url', async (_, url: string) => {
    await simulatorManager?.openUrl(url);
    return true;
  });

  ipcMain.on('simulator:start-streaming', (_, frameRate?: number) => {
    simulatorManager?.startStreaming(frameRate);
  });

  ipcMain.on('simulator:stop-streaming', () => {
    simulatorManager?.stopStreaming();
  });
}

// Call in createWindow after other setup:
setupSimulatorIPC();

// In mainWindow.on('closed'):
simulatorManager?.destroy();
```

### 3. Add preload API

```typescript
// Add to src/preload/index.ts

// Simulator API
const simulatorAPI = {
  listDevices: () => ipcRenderer.invoke('simulator:list-devices'),
  boot: (udid: string) => ipcRenderer.invoke('simulator:boot', udid),
  shutdown: (udid: string) => ipcRenderer.invoke('simulator:shutdown', udid),
  screenshot: () => ipcRenderer.invoke('simulator:screenshot'),
  getStatus: () => ipcRenderer.invoke('simulator:status'),
  tap: (x: number, y: number) => ipcRenderer.invoke('simulator:tap', { x, y }),
  launchApp: (bundleId: string) => ipcRenderer.invoke('simulator:launch-app', bundleId),
  openUrl: (url: string) => ipcRenderer.invoke('simulator:open-url', url),
  startStreaming: (frameRate?: number) => ipcRenderer.send('simulator:start-streaming', frameRate),
  stopStreaming: () => ipcRenderer.send('simulator:stop-streaming'),
  onFrame: (callback: (base64: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('simulator:frame', handler);
    return () => ipcRenderer.removeListener('simulator:frame', handler);
  }
};

// Expose to renderer
contextBridge.exposeInMainWorld('simulator', simulatorAPI);
```

## Related Code Files

| File | Change |
|------|--------|
| `src/main/simulator-manager.ts` | New file - main implementation |
| `src/main/simulator-types.ts` | New file - type definitions |
| `src/main/index.ts` | Add manager init, IPC handlers |
| `src/preload/index.ts` | Add simulator API |
| `src/preload/index.d.ts` | Add type declarations |

## Todo

- [ ] Create simulator-types.ts with interfaces
- [ ] Implement SimulatorManager class
- [ ] Add IPC handlers in main/index.ts
- [ ] Add preload API for renderer
- [ ] Add type declarations
- [ ] Test with actual simulator

## Success Criteria

1. `listDevices()` returns array of available devices
2. `bootDevice()` successfully boots a simulator
3. `screenshot()` returns valid base64 PNG
4. `startStreaming()` sends frames to renderer at ~30fps
5. `tap()` executes without error on booted simulator

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| xcrun command hangs | Low | High | Add timeout to spawn processes |
| Permission popup annoying | Medium | Low | Cache permission state, show UI hint |
| Frame capture slow | Medium | Medium | Reduce frame rate, use requestAnimationFrame |

## Security Considerations

- Sanitize bundleId before passing to xcrun (alphanumeric + dots only)
- Sanitize URLs before openurl command
- Don't expose raw execSync to renderer

## Next Steps

After this phase:
1. Build SimulatorPanel component (Phase 3)
2. Integrate with MCP bridge (Phase 4)
