/**
 * Browser Manager - Manages embedded browser via WebContentsView
 * Provides navigation controls and exposes webContents for MCP
 */
import { BrowserWindow, WebContentsView, clipboard, session } from 'electron';
import { NetworkInterceptor, NetworkRequest } from './network-interceptor';

interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Device emulation presets */
export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  mobile: boolean;
}

export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  desktop: {
    name: 'Desktop',
    width: 0, // 0 means use container width
    height: 0,
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    mobile: false
  },
  'iphone-15-pro': {
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    mobile: true
  },
  'iphone-se': {
    name: 'iPhone SE',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    mobile: true
  },
  'ipad-pro': {
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    mobile: true
  },
  'pixel-7': {
    name: 'Pixel 7',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    mobile: true
  },
  'galaxy-s23': {
    name: 'Galaxy S23',
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    mobile: true
  }
};

/** Cached element info from annotation */
interface AnnotatedElement {
  index: number;
  tag: string;
  type?: string;  // for inputs
  text: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
}

export class BrowserManager {
  private view: WebContentsView | null = null;
  private parentWindow: BrowserWindow;
  private currentBounds: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  private consoleLogs: string[] = [];
  private networkInterceptor: NetworkInterceptor;
  private browserSession: Electron.Session;

  // Cached annotated elements from last annotateScreenshot() call
  private annotatedElements: AnnotatedElement[] = [];

  // Current device emulation mode
  private currentDevice: string = 'desktop';

  // Chrome-like User-Agent to avoid bot detection
  private static readonly CHROME_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  constructor(parentWindow: BrowserWindow) {
    this.parentWindow = parentWindow;
    this.networkInterceptor = new NetworkInterceptor();

    // Create persistent session to preserve cookies/login state
    this.browserSession = session.fromPartition('persist:vibeflow-browser', {
      cache: true
    });

    // Set Chrome-like User-Agent
    this.browserSession.setUserAgent(BrowserManager.CHROME_USER_AGENT);

    this.create();
  }

  /**
   * Create the WebContentsView with persistent session
   */
  private create(): void {
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: this.browserSession  // Use persistent session
      }
    });

    // Increase max listeners to prevent warnings during normal operation
    this.view.webContents.setMaxListeners(20);

    // Add to parent window
    this.parentWindow.contentView.addChildView(this.view);

    // Capture console logs with proper object serialization
    this.view.webContents.on('console-message', (_, level, message) => {
      const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
      const logEntry = `[${levelName}] ${message}`;
      this.consoleLogs.push(logEntry);
      // Keep only last 100 logs
      if (this.consoleLogs.length > 100) {
        this.consoleLogs.shift();
      }
    });

    // Inject console override to serialize objects as JSON
    // Use arrow function to maintain 'this' context
    const handleDidFinishLoad = () => {
      this.injectConsoleOverride();
      this.attachNetworkInterceptor();
    };
    this.view.webContents.on('did-finish-load', handleDidFinishLoad);

    // Handle navigation events
    this.view.webContents.on('did-navigate', (_, url) => {
      this.parentWindow.webContents.send('browser:navigated', url);
      // Clear annotated elements cache on navigation (stale data)
      this.annotatedElements = [];
    });

    this.view.webContents.on('did-navigate-in-page', (_, url) => {
      this.parentWindow.webContents.send('browser:navigated', url);
    });

    // Handle popups - open in same view instead of external window
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      // Navigate current view to popup URL instead of opening new window
      if (url && url !== 'about:blank') {
        this.view?.webContents.loadURL(url);
      }
      return { action: 'deny' }; // Prevent external popup
    });

    // Handle renderer process crashes with better recovery
    this.view.webContents.on('render-process-gone', (_, details) => {
      console.error('Renderer process gone:', details.reason, details.exitCode);

      if (details.reason === 'clean-exit') {
        return;
      }

      // Clear any cached state that might be stale
      this.annotatedElements = [];
      this.consoleLogs = [];

      // Attempt to reload the page after a crash
      setTimeout(() => {
        if (this.view && !this.view.webContents.isDestroyed()) {
          console.log('Attempting to recover from crash...');
          try {
            // Try to get the current URL to reload it
            const url = this.view.webContents.getURL();
            if (url && url !== 'about:blank') {
              this.view.webContents.loadURL(url);
            } else {
              this.view.webContents.loadURL('https://www.google.com');
            }
          } catch (error) {
            console.error('Failed to recover from crash:', error);
          }
        }
      }, 1500);
    });

    // Handle unresponsive pages
    this.view.webContents.on('unresponsive', () => {
      console.warn('Browser became unresponsive');
    });

    this.view.webContents.on('responsive', () => {
      console.log('Browser became responsive again');
    });

    // Setup network update callback
    this.networkInterceptor.onUpdate((requests) => {
      this.parentWindow.webContents.send('network:update', requests);
    });

    // Load default page
    this.view.webContents.loadURL('https://www.google.com');
  }

  /**
   * Inject console override to properly serialize objects
   */
  private async injectConsoleOverride(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return;

    try {
      await this.view.webContents.executeJavaScript(`
        (function() {
          // Create global console history array if it doesn't exist
          if (!window.__consoleHistory) {
            window.__consoleHistory = [];
          }

          // Store original console methods
          const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error
          };

          // Helper to serialize any value to string with JSON formatting
          function serializeValue(val) {
            try {
              if (val === null) return 'null';
              if (val === undefined) return 'undefined';
              if (typeof val === 'string') return val;
              if (typeof val === 'number' || typeof val === 'boolean') return String(val);
              if (typeof val === 'function') return val.toString();
              if (val instanceof Error) return val.stack || val.message;

              // For objects and arrays, use JSON.stringify with pretty formatting
              return JSON.stringify(val, (key, value) => {
                // Handle circular references
                if (typeof value === 'object' && value !== null) {
                  if (value instanceof Error) return value.message;
                  return value;
                }
                return value;
              }, 2);
            } catch (err) {
              return String(val);
            }
          }

          // Override console methods to capture in history
          ['log', 'info', 'warn', 'error'].forEach(method => {
            console[method] = function(...args) {
              // Call original method for DevTools
              originalConsole[method].apply(console, args);

              // Serialize all arguments and store in history
              const serialized = args.map(serializeValue).join(' ');
              const levelName = method === 'warn' ? 'warning' : method;
              window.__consoleHistory.push('[' + levelName + '] ' + serialized);

              // Keep only last 100 logs
              if (window.__consoleHistory.length > 100) {
                window.__consoleHistory.shift();
              }
            };
          });
        })();
      `);
    } catch (error) {
      console.error('Failed to inject console override:', error);
    }
  }

  /**
   * Attach network interceptor to webContents
   * Safely handles errors to prevent crashes
   */
  private async attachNetworkInterceptor(): Promise<void> {
    if (this.view && !this.view.webContents.isDestroyed()) {
      try {
        await this.networkInterceptor.attach(this.view.webContents);
      } catch (error) {
        console.error('Failed to attach network interceptor:', error);
      }
    }
  }

  /**
   * Set browser bounds (called from renderer)
   */
  setBounds(bounds: BrowserBounds): void {
    this.currentBounds = bounds;
    this.view?.setBounds(bounds);
  }

  /**
   * Update bounds based on window size
   */
  updateBounds(): void {
    if (this.currentBounds.width > 0) {
      this.view?.setBounds(this.currentBounds);
    }
  }

  /**
   * Get current device mode
   */
  getDeviceMode(): string {
    return this.currentDevice;
  }

  /**
   * Get list of available device presets
   */
  getDevicePresets(): { id: string; name: string }[] {
    return Object.entries(DEVICE_PRESETS).map(([id, preset]) => ({
      id,
      name: preset.name
    }));
  }

  /**
   * Set device emulation mode (mobile/tablet/desktop)
   * Changes viewport, user-agent, and touch emulation
   */
  async setDeviceMode(deviceId: string): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;

    const preset = DEVICE_PRESETS[deviceId];
    if (!preset) {
      console.error(`Unknown device: ${deviceId}`);
      return false;
    }

    this.currentDevice = deviceId;
    const webContents = this.view.webContents;

    // Temporarily detach network interceptor to avoid debugger conflicts
    const wasNetworkAttached = this.networkInterceptor['debuggerAttached'];
    if (wasNetworkAttached) {
      this.networkInterceptor.detach();
    }

    try {
      // Check if debugger is already attached
      const alreadyAttached = webContents.debugger.isAttached();

      if (!alreadyAttached) {
        await webContents.debugger.attach('1.3');
      }

      // For desktop mode, disable emulation
      if (deviceId === 'desktop') {
        await webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
        await webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: false
        });
        await webContents.debugger.sendCommand('Emulation.setUserAgentOverride', {
          userAgent: BrowserManager.CHROME_USER_AGENT
        });

        // Reset session user agent
        this.browserSession.setUserAgent(BrowserManager.CHROME_USER_AGENT);

        // Notify renderer about device change
        this.parentWindow.webContents.send('browser:device-changed', {
          deviceId,
          name: preset.name,
          mobile: false
        });
      } else {
        // For mobile/tablet modes, enable emulation
        // Set device metrics (viewport size, scale)
        await webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: preset.width,
          height: preset.height,
          deviceScaleFactor: preset.deviceScaleFactor,
          mobile: preset.mobile,
          screenWidth: preset.width,
          screenHeight: preset.height
        });

        // Enable touch emulation for mobile devices
        await webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: preset.mobile,
          maxTouchPoints: preset.mobile ? 5 : 0
        });

        // Set mobile user agent
        await webContents.debugger.sendCommand('Emulation.setUserAgentOverride', {
          userAgent: preset.userAgent,
          platform: preset.mobile ? (preset.userAgent.includes('iPhone') || preset.userAgent.includes('iPad') ? 'iPhone' : 'Linux armv81') : 'MacIntel'
        });

        // Update session user agent for new requests
        this.browserSession.setUserAgent(preset.userAgent);

        // Notify renderer about device change
        this.parentWindow.webContents.send('browser:device-changed', {
          deviceId,
          name: preset.name,
          mobile: preset.mobile,
          width: preset.width,
          height: preset.height
        });
      }

      // Don't detach debugger - let network interceptor reuse it
      // Reload page to apply changes
      webContents.reload();

      // Re-attach network interceptor after a short delay to allow page reload
      if (wasNetworkAttached) {
        setTimeout(() => {
          this.attachNetworkInterceptor();
        }, 1000);
      }

      return true;
    } catch (error) {
      console.error('setDeviceMode failed:', error);
      return false;
    }
  }

  /**
   * Navigate to URL and wait for page to load
   */
  async navigate(url: string): Promise<boolean> {
    if (!this.view) return false;

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    return new Promise((resolve) => {
      const webContents = this.view!.webContents;
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        webContents.removeListener('did-finish-load', onDidFinish);
        webContents.removeListener('did-fail-load', onDidFail);
      };

      const onDidFinish = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(true);
      };

      const onDidFail = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(false);
      };

      // Set timeout in case load takes too long
      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(true); // Resolve anyway after timeout
      }, 15000);

      // Use once to ensure auto-cleanup
      webContents.once('did-finish-load', onDidFinish);
      webContents.once('did-fail-load', onDidFail);

      webContents.loadURL(url);
    });
  }

  /**
   * Go back in history
   */
  goBack(): void {
    if (this.view?.webContents.canGoBack()) {
      this.view.webContents.goBack();
    }
  }

  /**
   * Go forward in history
   */
  goForward(): void {
    if (this.view?.webContents.canGoForward()) {
      this.view.webContents.goForward();
    }
  }

  /**
   * Reload page
   */
  reload(): void {
    this.view?.webContents.reload();
  }

  /**
   * Open DevTools
   */
  openDevTools(): void {
    this.view?.webContents.openDevTools({ mode: 'detach' });
  }

  /**
   * Get current URL
   */
  getCurrentURL(): string {
    return this.view?.webContents.getURL() || '';
  }

  /**
   * Get webContents for MCP operations
   */
  getWebContents() {
    return this.view?.webContents;
  }

  /**
   * Take screenshot, copy to clipboard, and return base64 JPEG
   * Resizes to max 1280px and compresses to JPEG to reduce file size
   */
  async screenshot(): Promise<{ data: string; mimeType: string }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { data: '', mimeType: 'image/jpeg' };
    }

    // Store current window focus state to restore later
    const wasFocused = this.parentWindow.isFocused();

    let image = await this.view.webContents.capturePage();

    // Resize to max 1280px to keep file size small for API requests
    const MAX_SIZE = 1280;
    const size = image.getSize();
    if (size.width > MAX_SIZE || size.height > MAX_SIZE) {
      const scale = Math.min(MAX_SIZE / size.width, MAX_SIZE / size.height);
      const newWidth = Math.floor(size.width * scale);
      const newHeight = Math.floor(size.height * scale);
      image = image.resize({ width: newWidth, height: newHeight, quality: 'good' });
    }

    // Return as JPEG (much smaller than PNG) with 80% quality
    const jpegBuffer = image.toJPEG(80);

    // If window wasn't focused before, blur it to prevent stealing focus
    if (!wasFocused && process.platform === 'darwin') {
      // On macOS, if the window gained focus during the operation, blur it
      if (this.parentWindow.isFocused()) {
        this.parentWindow.blur();
      }
    }

    return {
      data: jpegBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    };
  }

  /**
   * Copy current page screenshot to clipboard (for manual use, not MCP)
   */
  async copyScreenshotToClipboard(): Promise<void> {
    if (!this.view) return;
    const image = await this.view.webContents.capturePage();
    clipboard.writeImage(image);
  }

  /**
   * Take screenshot with numbered badges on interactive elements.
   * Caches element mapping for subsequent clickByIndex/typeByIndex calls.
   */
  async annotateScreenshot(): Promise<{
    data: string;
    mimeType: string;
    elements: AnnotatedElement[];
  }> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return { data: '', mimeType: 'image/jpeg', elements: [] };
    }

    // Store current window focus state to restore later
    const wasFocused = this.parentWindow.isFocused();

    let elements: AnnotatedElement[] = [];

    try {
      // Inject badges and collect element info
      elements = await this.view.webContents.executeJavaScript(`
      (function() {
        // Remove any existing badges first
        document.querySelectorAll('[data-vibeflow-badge]').forEach(el => el.remove());

        // Find all interactive elements
        const selectors = 'a, button, input, textarea, select, [role="button"], [onclick], [tabindex="0"]';
        const allElements = Array.from(document.querySelectorAll(selectors));

        // Filter visible elements only
        const visibleElements = allElements.filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0' &&
                 rect.top < window.innerHeight &&
                 rect.bottom > 0 &&
                 rect.left < window.innerWidth &&
                 rect.right > 0;
        });

        // Limit to first 50 elements for performance
        const elements = visibleElements.slice(0, 50);
        const result = [];

        elements.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          const index = idx + 1;

          // Create badge
          const badge = document.createElement('div');
          badge.setAttribute('data-vibeflow-badge', index.toString());
          badge.style.cssText = \`
            position: fixed;
            left: \${rect.left - 2}px;
            top: \${rect.top - 2}px;
            background: #ff6b35;
            color: white;
            font-size: 11px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            z-index: 999999;
            pointer-events: none;
            font-family: monospace;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          \`;
          badge.textContent = index.toString();
          document.body.appendChild(badge);

          // Generate unique selector
          let selector = '';
          if (el.id) {
            selector = '#' + el.id;
          } else {
            // Build a path selector
            const tag = el.tagName.toLowerCase();
            const classes = Array.from(el.classList).slice(0, 2).join('.');
            selector = classes ? tag + '.' + classes : tag;
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c =>
                c.tagName === el.tagName
              );
              if (siblings.length > 1) {
                const idx = siblings.indexOf(el) + 1;
                selector += ':nth-of-type(' + idx + ')';
              }
            }
          }

          // Get text content
          let text = el.textContent?.trim().substring(0, 50) || '';
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            text = el.placeholder || el.value || '';
          }

          result.push({
            index,
            tag: el.tagName.toLowerCase(),
            type: el.type || undefined,
            text,
            selector,
            rect: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        });

        return result;
      })()
    `);

      // Cache elements for later use
      this.annotatedElements = elements;

      // Take screenshot with badges
      let image = await this.view.webContents.capturePage();

      // Remove badges after screenshot (ignore errors)
      try {
        await this.view.webContents.executeJavaScript(`
          document.querySelectorAll('[data-vibeflow-badge]').forEach(el => el.remove());
        `);
      } catch {
        // Ignore cleanup errors
      }

      // Resize for API limits
      const MAX_SIZE = 1280;
      const size = image.getSize();
      if (size.width > MAX_SIZE || size.height > MAX_SIZE) {
        const scale = Math.min(MAX_SIZE / size.width, MAX_SIZE / size.height);
        const newWidth = Math.floor(size.width * scale);
        const newHeight = Math.floor(size.height * scale);
        image = image.resize({ width: newWidth, height: newHeight, quality: 'good' });
      }

      const jpegBuffer = image.toJPEG(80);

      // If window wasn't focused before, blur it to prevent stealing focus
      if (!wasFocused && process.platform === 'darwin') {
        // On macOS, if the window gained focus during the operation, blur it
        if (this.parentWindow.isFocused()) {
          this.parentWindow.blur();
        }
      }

      return {
        data: jpegBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        elements
      };
    } catch (error) {
      console.error('annotateScreenshot failed:', error);
      return { data: '', mimeType: 'image/jpeg', elements: [] };
    }
  }

  /**
   * Check if page is ready for script execution
   */
  private async isPageReady(): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      return false;
    }

    const url = this.view.webContents.getURL();
    if (!url || url === 'about:blank') {
      return false;
    }

    // Check if page is loading
    if (this.view.webContents.isLoading()) {
      // Wait for page to finish loading (max 5 seconds)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000);
        this.view?.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    return true;
  }

  /**
   * Click element by index (from annotateScreenshot)
   */
  async clickByIndex(index: number): Promise<boolean> {
    const element = this.annotatedElements.find(el => el.index === index);
    if (!element) {
      console.error(`Element index ${index} not found in cache. Call browser_annotate first.`);
      return false;
    }

    if (!await this.isPageReady()) {
      console.error('clickByIndex failed: page not ready');
      return false;
    }

    // Click using center coordinates (more reliable than selector)
    const centerX = element.rect.x + element.rect.width / 2;
    const centerY = element.rect.y + element.rect.height / 2;

    // Validate coordinates
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      console.error(`clickByIndex failed: invalid coordinates (${centerX}, ${centerY})`);
      return false;
    }

    try {
      const result = await this.view!.webContents.executeJavaScript(`
        (function() {
          try {
            const el = document.elementFromPoint(${centerX}, ${centerY});
            if (el) {
              el.click();
              return true;
            }
            return false;
          } catch (e) {
            console.error('Click script error:', e);
            return false;
          }
        })()
      `);

      if (!result) {
        console.error(`clickByIndex failed: no element found at (${centerX}, ${centerY})`);
      }
      return result === true;
    } catch (error) {
      console.error('clickByIndex failed:', error);
      console.error(`  Element [${index}]: ${element.tag} "${element.text}"`);
      console.error(`  Coordinates: (${centerX}, ${centerY})`);
      console.error(`  Selector: ${element.selector}`);
      return false;
    }
  }

  /**
   * Type text into element by index (from annotateScreenshot)
   */
  async typeByIndex(index: number, text: string): Promise<boolean> {
    const element = this.annotatedElements.find(el => el.index === index);
    if (!element) {
      console.error(`Element index ${index} not found in cache. Call browser_annotate first.`);
      return false;
    }

    if (!await this.isPageReady()) {
      console.error('typeByIndex failed: page not ready');
      return false;
    }

    const centerX = element.rect.x + element.rect.width / 2;
    const centerY = element.rect.y + element.rect.height / 2;

    // Validate coordinates
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      console.error(`typeByIndex failed: invalid coordinates (${centerX}, ${centerY})`);
      return false;
    }

    try {
      const result = await this.view!.webContents.executeJavaScript(`
        (function(x, y, text) {
          try {
            const el = document.elementFromPoint(x, y);
            if (!el) return false;

            el.focus();

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;

            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(el, text);
            } else {
              el.value = text;
            }

            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            return true;
          } catch (e) {
            console.error('Type script error:', e);
            return false;
          }
        })(${centerX}, ${centerY}, ${JSON.stringify(text)})
      `);

      if (!result) {
        console.error(`typeByIndex failed: no element found at (${centerX}, ${centerY})`);
      }
      return result === true;
    } catch (error) {
      console.error('typeByIndex failed:', error);
      console.error(`  Element [${index}]: ${element.tag} "${element.text}"`);
      console.error(`  Coordinates: (${centerX}, ${centerY})`);
      console.error(`  Selector: ${element.selector}`);
      return false;
    }
  }

  /**
   * Get cached annotated elements
   */
  getAnnotatedElements(): AnnotatedElement[] {
    return this.annotatedElements;
  }

  /**
   * Click element by selector
   */
  async click(selector: string): Promise<boolean> {
    if (!await this.isPageReady()) {
      console.error('Click failed: page not ready');
      return false;
    }

    try {
      const result = await this.view!.webContents.executeJavaScript(`
        (function(selector) {
          const el = document.querySelector(selector);
          if (el) {
            el.click();
            return true;
          }
          return false;
        })(${JSON.stringify(selector)})
      `);
      return result === true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const url = this.view?.webContents.getURL() || 'unknown';
      console.error(`Click failed: ${errorMessage}`);
      console.error(`Selector: ${selector}`);
      console.error(`URL: ${url}`);
      return false;
    }
  }

  /**
   * Wait for element to appear (for modals, dynamic content)
   */
  async waitForSelector(selector: string, timeout: number = 5000): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(selector, timeout) {
          return new Promise((resolve) => {
            // Check if already exists
            if (document.querySelector(selector)) {
              resolve(true);
              return;
            }

            // Use MutationObserver to watch for element
            const observer = new MutationObserver(() => {
              if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(true);
              }
            });

            observer.observe(document.body, {
              childList: true,
              subtree: true
            });

            // Timeout
            setTimeout(() => {
              observer.disconnect();
              resolve(false);
            }, timeout);
          });
        })(${JSON.stringify(selector)}, ${timeout})
      `);
      return result === true;
    } catch (error) {
      console.error('waitForSelector failed:', error);
      return false;
    }
  }

  /**
   * Wait for specified milliseconds
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get DOM content
   */
  async getDOM(selector?: string): Promise<string> {
    if (!await this.isPageReady()) {
      console.error('getDOM failed: page not ready');
      return '';
    }

    try {
      if (selector) {
        return await this.view!.webContents.executeJavaScript(`
          (function(selector) {
            return document.querySelector(selector)?.outerHTML || '';
          })(${JSON.stringify(selector)})
        `);
      }
      return await this.view!.webContents.executeJavaScript(`document.documentElement.outerHTML`);
    } catch (error) {
      console.error('getDOM failed:', error);
      return '';
    }
  }

  /**
   * Type text into element
   */
  async typeText(selector: string, text: string): Promise<boolean> {
    if (!await this.isPageReady()) {
      console.error('typeText failed: page not ready');
      return false;
    }

    try {
      const result = await this.view!.webContents.executeJavaScript(`
        (function(selector, text) {
          const el = document.querySelector(selector);
          if (!el) return false;

          // Focus the element
          el.focus();

          // Set value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;

          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, text);
          } else {
            el.value = text;
          }

          // Dispatch events that React forms listen to
          el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

          return true;
        })(${JSON.stringify(selector)}, ${JSON.stringify(text)})
      `);
      return result === true;
    } catch (error) {
      console.error('typeText failed:', error);
      return false;
    }
  }

  /**
   * Execute arbitrary JavaScript
   * Returns null on error instead of throwing to prevent app crash
   */
  async evaluateJS(code: string): Promise<unknown> {
    // Extra safety check - verify view and webContents are valid
    if (!this.view || this.view.webContents.isDestroyed()) {
      console.error('evaluateJS failed: browser view destroyed');
      return null;
    }

    if (!await this.isPageReady()) {
      console.error('evaluateJS failed: page not ready');
      return null;
    }

    try {
      return await this.view.webContents.executeJavaScript(code);
    } catch (error) {
      // Log error but DON'T throw - prevents app crash
      const errorMessage = error instanceof Error ? error.message : String(error);
      const url = this.view?.webContents.getURL() || 'unknown';
      console.error(`evaluateJS failed: ${errorMessage}`);
      console.error(`Code: ${code.substring(0, 100)}...`);
      console.error(`URL: ${url}`);
      return null; // Return null instead of throwing
    }
  }

  /**
   * Get console logs from injected history
   */
  async getConsoleLogs(): Promise<string[]> {
    if (!this.view || this.view.webContents.isDestroyed()) return [];

    try {
      // Try to get from injected console history first
      const history = await this.view.webContents.executeJavaScript(
        'window.__consoleHistory || []'
      );
      if (Array.isArray(history) && history.length > 0) {
        return history;
      }
    } catch (error) {
      console.error('Failed to get console history:', error);
    }

    // Fallback to captured logs from console-message event
    return [...this.consoleLogs];
  }

  /**
   * Clear console logs
   */
  async clearConsoleLogs(): Promise<void> {
    this.consoleLogs = [];

    // Also clear injected console history
    if (this.view && !this.view.webContents.isDestroyed()) {
      try {
        await this.view.webContents.executeJavaScript('window.__consoleHistory = [];');
      } catch (error) {
        console.error('Failed to clear console history:', error);
      }
    }
  }

  /**
   * Get network requests
   */
  getNetworkRequests(): NetworkRequest[] {
    return this.networkInterceptor.getRequests();
  }

  /**
   * Clear network requests
   */
  clearNetworkRequests(): void {
    this.networkInterceptor.clear();
  }

  /**
   * Hover over element by selector
   */
  async hover(selector: string): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(selector) {
          const el = document.querySelector(selector);
          if (!el) return false;

          const event = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(event);

          const enterEvent = new MouseEvent('mouseenter', {
            bubbles: false,
            cancelable: false,
            view: window
          });
          el.dispatchEvent(enterEvent);

          return true;
        })(${JSON.stringify(selector)})
      `);
      return result === true;
    } catch (error) {
      console.error('hover failed:', error);
      return false;
    }
  }

  /**
   * Scroll page or to element
   * Smart scroll detection: tries window first, then finds scrollable containers
   */
  async scroll(options: {
    selector?: string;
    x?: number;
    y?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
  }): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;

    // Check page readiness
    if (!await this.isPageReady()) {
      console.error('scroll failed: page not ready');
      return false;
    }

    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(options) {
          try {
            const { selector, x, y, direction, amount = 300 } = options;

            // Find scrollable container (prefer main, body, or largest container)
            function findScrollableContainer() {
              // Priority 1: Check common main content selectors
              const mainSelectors = ['main', '[role="main"]', '.main-content', '#main', 'body'];
              for (const sel of mainSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                  const style = window.getComputedStyle(el);
                  const overflowY = style.overflowY;
                  if ((overflowY === 'auto' || overflowY === 'scroll') &&
                      el.scrollHeight > el.clientHeight) {
                    return el;
                  }
                }
              }

              // Priority 2: Check if window/document is scrollable
              if (document.documentElement.scrollHeight > window.innerHeight) {
                return window;
              }

              // Priority 3: Find largest scrollable element
              const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const style = window.getComputedStyle(el);
                const overflowY = style.overflowY;
                return (overflowY === 'auto' || overflowY === 'scroll') &&
                       el.scrollHeight > el.clientHeight &&
                       el.clientHeight > 100; // Ignore small containers
              });

              // Return largest by scroll area (height * scrollable range)
              const sorted = scrollables.sort((a, b) => {
                const scoreA = a.clientHeight * (a.scrollHeight - a.clientHeight);
                const scoreB = b.clientHeight * (b.scrollHeight - b.clientHeight);
                return scoreB - scoreA;
              });

              return sorted[0] || window;
            }

            // Scroll to element
            if (selector) {
              const el = document.querySelector(selector);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return true;
              }
              console.error('Scroll failed: element not found:', selector);
              return false;
            }

            const container = findScrollableContainer();
            const isWindow = container === window;

            // Debug info
            if (!isWindow) {
              console.log('Scroll container:', container.tagName,
                         'scrollTop:', container.scrollTop,
                         'scrollHeight:', container.scrollHeight,
                         'clientHeight:', container.clientHeight);
            }

            // Scroll to coordinates
            if (x !== undefined || y !== undefined) {
              if (isWindow) {
                window.scrollTo({
                  left: x ?? window.scrollX,
                  top: y ?? window.scrollY,
                  behavior: 'smooth'
                });
              } else {
                container.scrollTo({
                  left: x ?? container.scrollLeft,
                  top: y ?? container.scrollTop,
                  behavior: 'smooth'
                });
              }
              return true;
            }

            // Scroll by direction
            if (direction) {
              let scrollTop = 0, scrollLeft = 0;

              switch (direction) {
                case 'up':
                  scrollTop = -amount;
                  break;
                case 'down':
                  scrollTop = amount;
                  break;
                case 'left':
                  scrollLeft = -amount;
                  break;
                case 'right':
                  scrollLeft = amount;
                  break;
              }

              if (isWindow) {
                window.scrollBy({ top: scrollTop, left: scrollLeft, behavior: 'smooth' });
              } else {
                // Use scrollBy if available, otherwise fallback to scrollTop/scrollLeft
                if (typeof container.scrollBy === 'function') {
                  container.scrollBy({ top: scrollTop, left: scrollLeft, behavior: 'smooth' });
                } else {
                  // Fallback for older browsers or elements without scrollBy
                  container.scrollTop += scrollTop;
                  container.scrollLeft += scrollLeft;
                }
              }
              return true;
            }

            console.error('Scroll failed: no valid scroll option provided');
            return false;
          } catch (e) {
            console.error('Scroll script error:', e);
            return false;
          }
        })(${JSON.stringify(options)})
      `);

      if (!result) {
        console.error('scroll failed with options:', JSON.stringify(options));
      }
      return result === true;
    } catch (error) {
      console.error('scroll failed:', error);
      console.error('  Options:', JSON.stringify(options));
      return false;
    }
  }

  /**
   * Select option from dropdown
   */
  async selectOption(selector: string, options: {
    value?: string;
    label?: string;
    index?: number;
  }): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(selector, options) {
          const el = document.querySelector(selector);
          if (!el || el.tagName !== 'SELECT') return false;

          const { value, label, index } = options;

          if (value !== undefined) {
            el.value = value;
          } else if (label !== undefined) {
            const option = Array.from(el.options).find(opt => opt.text === label);
            if (option) el.value = option.value;
            else return false;
          } else if (index !== undefined) {
            if (index >= 0 && index < el.options.length) {
              el.selectedIndex = index;
            } else return false;
          }

          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })(${JSON.stringify(selector)}, ${JSON.stringify(options)})
      `);
      return result === true;
    } catch (error) {
      console.error('selectOption failed:', error);
      return false;
    }
  }

  /**
   * Press keyboard key
   */
  async pressKey(key: string, selector?: string): Promise<boolean> {
    if (!this.view || this.view.webContents.isDestroyed()) return false;
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(key, selector) {
          let target = document.activeElement || document.body;

          if (selector) {
            const el = document.querySelector(selector);
            if (el) {
              el.focus();
              target = el;
            }
          }

          const keyMap = {
            'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
            'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
            'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
            'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
            'Space': { key: ' ', code: 'Space', keyCode: 32 }
          };

          const keyInfo = keyMap[key] || { key, code: key, keyCode: key.charCodeAt(0) };

          const eventInit = {
            key: keyInfo.key,
            code: keyInfo.code,
            keyCode: keyInfo.keyCode,
            which: keyInfo.keyCode,
            bubbles: true,
            cancelable: true
          };

          target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
          target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

          return true;
        })(${JSON.stringify(key)}, ${JSON.stringify(selector)})
      `);
      return result === true;
    } catch (error) {
      console.error('pressKey failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources when app is closing
   */
  destroy(): void {
    this.networkInterceptor.detach();
    this.view = null;
  }
}
