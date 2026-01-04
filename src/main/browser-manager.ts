/**
 * Browser Manager - Manages embedded browser via WebContentsView
 * Provides navigation controls and exposes webContents for MCP
 */
import { BrowserWindow, WebContentsView } from 'electron';

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

  constructor(parentWindow: BrowserWindow) {
    this.parentWindow = parentWindow;
    this.create();
  }

  /**
   * Create the WebContentsView
   */
  private create(): void {
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Add to parent window
    this.parentWindow.contentView.addChildView(this.view);

    // Capture console logs
    this.view.webContents.on('console-message', (_, level, message) => {
      const logEntry = `[${['verbose', 'info', 'warning', 'error'][level] || 'log'}] ${message}`;
      this.consoleLogs.push(logEntry);
      // Keep only last 100 logs
      if (this.consoleLogs.length > 100) {
        this.consoleLogs.shift();
      }
    });

    // Handle navigation events
    this.view.webContents.on('did-navigate', (_, url) => {
      this.parentWindow.webContents.send('browser:navigated', url);
    });

    this.view.webContents.on('did-navigate-in-page', (_, url) => {
      this.parentWindow.webContents.send('browser:navigated', url);
    });

    // Load default page
    this.view.webContents.loadURL('https://www.google.com');
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
   * Navigate to URL
   */
  navigate(url: string): void {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    this.view?.webContents.loadURL(url);
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
   * Take screenshot (returns base64)
   */
  async screenshot(): Promise<string> {
    if (!this.view) return '';
    const image = await this.view.webContents.capturePage();
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
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (el) {
            el.focus();
            el.value = '${text.replace(/'/g, "\\'")}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          return false;
        })()
      `);
      return true;
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
   * Get console logs
   */
  getConsoleLogs(): string[] {
    return [...this.consoleLogs];
  }

  /**
   * Clear console logs
   */
  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }
}
