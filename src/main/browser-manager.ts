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

export class BrowserManager {
  private view: WebContentsView | null = null;
  private parentWindow: BrowserWindow;
  private currentBounds: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  private consoleLogs: string[] = [];
  private networkInterceptor: NetworkInterceptor;
  private browserSession: Electron.Session;

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
    this.view.webContents.on('did-finish-load', () => {
      this.injectConsoleOverride();
    });

    // Handle navigation events
    this.view.webContents.on('did-navigate', (_, url) => {
      this.parentWindow.webContents.send('browser:navigated', url);
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

    // Attach network interceptor after page loads
    this.view.webContents.on('did-finish-load', () => {
      this.attachNetworkInterceptor();
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
    if (!this.view) return;

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
   */
  private async attachNetworkInterceptor(): Promise<void> {
    if (this.view) {
      await this.networkInterceptor.attach(this.view.webContents);
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

      const onDidFinish = () => {
        cleanup();
        resolve(true);
      };

      const onDidFail = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        webContents.removeListener('did-finish-load', onDidFinish);
        webContents.removeListener('did-fail-load', onDidFail);
      };

      // Set timeout in case load takes too long
      const timeout = setTimeout(() => {
        cleanup();
        resolve(true); // Resolve anyway after timeout
      }, 15000);

      webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        onDidFinish();
      });

      webContents.once('did-fail-load', () => {
        clearTimeout(timeout);
        onDidFail();
      });

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
   * Take screenshot, copy to clipboard, and return base64
   */
  async screenshot(): Promise<string> {
    if (!this.view) return '';
    const image = await this.view.webContents.capturePage();
    // Copy to clipboard using Electron's clipboard API
    clipboard.writeImage(image);
    return image.toDataURL().split(',')[1]; // Return base64 without prefix
  }

  /**
   * Click element by selector
   */
  async click(selector: string): Promise<boolean> {
    if (!this.view) return false;
    try {
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (el) {
            el.click();
            return true;
          }
          return false;
        })()
      `);
      return true;
    } catch (error) {
      console.error('Click failed:', error);
      return false;
    }
  }

  /**
   * Wait for element to appear (for modals, dynamic content)
   */
  async waitForSelector(selector: string, timeout: number = 5000): Promise<boolean> {
    if (!this.view) return false;
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
    if (!this.view) return '';
    try {
      const script = selector
        ? `document.querySelector('${selector.replace(/'/g, "\\'")}')?.outerHTML || ''`
        : `document.documentElement.outerHTML`;
      return await this.view.webContents.executeJavaScript(script);
    } catch (error) {
      console.error('getDOM failed:', error);
      return '';
    }
  }

  /**
   * Type text into element
   */
  async typeText(selector: string, text: string): Promise<boolean> {
    if (!this.view) return false;
    try {
      // Properly escape text by passing it as a parameter
      const result = await this.view.webContents.executeJavaScript(`
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
   */
  async evaluateJS(code: string): Promise<unknown> {
    if (!this.view) return null;
    try {
      return await this.view.webContents.executeJavaScript(code);
    } catch (error) {
      console.error('evaluateJS failed:', error);
      return null;
    }
  }

  /**
   * Get console logs from injected history
   */
  async getConsoleLogs(): Promise<string[]> {
    if (!this.view) return [];

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
    if (this.view) {
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
    if (!this.view) return false;
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
   */
  async scroll(options: {
    selector?: string;
    x?: number;
    y?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
  }): Promise<boolean> {
    if (!this.view) return false;
    try {
      const result = await this.view.webContents.executeJavaScript(`
        (function(options) {
          const { selector, x, y, direction, amount = 300 } = options;

          // Scroll to element
          if (selector) {
            const el = document.querySelector(selector);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
            return false;
          }

          // Scroll to coordinates
          if (x !== undefined || y !== undefined) {
            window.scrollTo({
              left: x ?? window.scrollX,
              top: y ?? window.scrollY,
              behavior: 'smooth'
            });
            return true;
          }

          // Scroll by direction
          if (direction) {
            const scrollOptions = { behavior: 'smooth' };
            switch (direction) {
              case 'up':
                window.scrollBy({ ...scrollOptions, top: -amount });
                break;
              case 'down':
                window.scrollBy({ ...scrollOptions, top: amount });
                break;
              case 'left':
                window.scrollBy({ ...scrollOptions, left: -amount });
                break;
              case 'right':
                window.scrollBy({ ...scrollOptions, left: amount });
                break;
            }
            return true;
          }

          return false;
        })(${JSON.stringify(options)})
      `);
      return result === true;
    } catch (error) {
      console.error('scroll failed:', error);
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
    if (!this.view) return false;
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
    if (!this.view) return false;
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
