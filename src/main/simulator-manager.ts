/**
 * Simulator Manager - Controls iOS Simulator via xcrun simctl
 * Provides device management, screen capture, and interaction APIs
 */
import { BrowserWindow, desktopCapturer, systemPreferences } from 'electron';
import { execSync, spawn } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { SimulatorDevice, SimulatorStatus } from './simulator-types';

export class SimulatorManager {
  private parentWindow: BrowserWindow;
  private streamingInterval: ReturnType<typeof setInterval> | null = null;
  private isStreaming = false;

  constructor(parentWindow: BrowserWindow) {
    this.parentWindow = parentWindow;
  }

  /**
   * Check if simctl is available (Xcode installed)
   */
  isAvailable(): boolean {
    if (process.platform !== 'darwin') return false;

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
    if (!this.isAvailable()) return [];

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
        const versionMatch = runtime.match(/iOS-([\d]+)-([\d]+)/);
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

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Boot timeout'));
      }, 60000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          // Don't open Simulator.app - we'll stream in IDE instead
          resolve();
        } else {
          reject(new Error(`Failed to boot device (exit code ${code})`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Shutdown a simulator device
   */
  async shutdownDevice(udid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'shutdown', udid]);

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Shutdown timeout'));
      }, 30000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to shutdown device (exit code ${code})`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Take screenshot using xcrun simctl
   * Returns base64 encoded PNG
   */
  async screenshot(): Promise<string> {
    const tmpPath = `/tmp/vibeflow-sim-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'io', 'booted', 'screenshot', tmpPath]);

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        // Clean up temp file on timeout
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(new Error('Screenshot timeout'));
      }, 10000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        try {
          if (code === 0 && existsSync(tmpPath)) {
            const buffer = readFileSync(tmpPath);
            unlinkSync(tmpPath);
            resolve(buffer.toString('base64'));
          } else {
            reject(new Error('Screenshot failed - is simulator booted?'));
          }
        } catch (e) {
          // Always try to clean up temp file
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(e);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        // Clean up temp file on error
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(err);
      });
    });
  }

  /**
   * Start streaming frames to renderer
   */
  async startStreaming(frameRate = 30): Promise<void> {
    // Always stop existing streaming first to prevent memory leaks
    this.stopStreaming();

    // Always use xcrun simctl screenshot polling - no need for Simulator.app to be visible
    // This allows headless operation where only the IDE shows the simulator screen
    console.log('[Simulator] Starting xcrun polling stream');
    this.startPollingStream(frameRate);
    return;

    // Note: desktopCapturer approach commented out - requires Simulator.app window to be visible
    // const permission = systemPreferences.getMediaAccessStatus('screen');
    // if (permission === 'granted') { ... }

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
    console.log('[Simulator] Polling started at', effectiveRate, 'fps');

    const captureFrame = async () => {
      if (!this.isStreaming) return;

      try {
        const base64 = await this.screenshot();
        console.log('[Simulator] Frame captured, size:', base64.length);
        this.parentWindow.webContents.send('simulator:frame', base64);
      } catch (err) {
        console.error('[Simulator] Polling capture error:', err);
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
      // Use simctl's undocumented io input tap command
      const proc = spawn('xcrun', [
        'simctl', 'io', 'booted', 'tap', x.toString(), y.toString()
      ]);

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Tap timeout'));
      }, 5000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error('Tap failed'));
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Launch app by bundle ID
   */
  async launchApp(bundleId: string): Promise<void> {
    // Strict bundleId validation: must start with letter, contain only alphanumeric/dots/hyphens
    // No consecutive dots, no leading/trailing dots or hyphens
    if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(bundleId)) {
      throw new Error('Invalid bundle ID format');
    }
    if (bundleId.length > 200) {
      throw new Error('Bundle ID too long');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'launch', 'booted', bundleId]);

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Launch timeout'));
      }, 15000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Failed to launch ${bundleId}`));
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Open URL in simulator
   */
  async openUrl(url: string): Promise<void> {
    // Strict URL validation with scheme whitelist
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Only allow safe schemes
    const allowedSchemes = ['http:', 'https:', 'tel:', 'mailto:'];
    if (!allowedSchemes.includes(parsedUrl.protocol)) {
      throw new Error(`URL scheme not allowed: ${parsedUrl.protocol}`);
    }

    if (url.length > 2000) {
      throw new Error('URL too long');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('xcrun', ['simctl', 'openurl', 'booted', url]);

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Open URL timeout'));
      }, 15000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Failed to open URL: ${url}`));
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
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
