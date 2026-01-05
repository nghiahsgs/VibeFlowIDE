/**
 * MCP Bridge - Local server for MCP to communicate with Electron
 * Uses simple TCP socket for IPC between MCP server and Electron app
 */
import net from 'net';
import { BrowserManager } from './browser-manager';

const MCP_BRIDGE_PORT = 9876;
const MAX_PORT_ATTEMPTS = 10;

interface MCPCommand {
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
}

interface MCPResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export class MCPBridge {
  private server: net.Server | null = null;
  private browser: BrowserManager;
  private port: number = MCP_BRIDGE_PORT;

  constructor(browser: BrowserManager) {
    this.browser = browser;
    this.startServer();
  }

  private startServer(attempt: number = 0): void {
    if (attempt >= MAX_PORT_ATTEMPTS) {
      console.error(`MCP Bridge: Failed to find available port after ${MAX_PORT_ATTEMPTS} attempts`);
      return;
    }

    const port = MCP_BRIDGE_PORT + attempt;
    const server = this.createServer(port);

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`MCP Bridge: Port ${port} in use, trying ${port + 1}...`);
        server.close();
        this.startServer(attempt + 1);
      } else {
        console.error('MCP Bridge server error:', err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      this.port = port;
      this.server = server;
      console.log(`MCP Bridge listening on port ${port}`);
    });
  }

  private createServer(port: number): net.Server {
    const server = net.createServer((socket) => {
      console.log('MCP client connected');

      let buffer = '';

      socket.on('data', async (data) => {
        buffer += data.toString();

        // Process complete messages (newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const command: MCPCommand = JSON.parse(line);
              const response = await this.handleCommand(command);
              socket.write(JSON.stringify(response) + '\n');
            } catch (error) {
              const errResponse: MCPResponse = {
                id: 'unknown',
                success: false,
                error: `Parse error: ${error}`
              };
              socket.write(JSON.stringify(errResponse) + '\n');
            }
          }
        }
      });

      socket.on('close', () => {
        console.log('MCP client disconnected');
      });

      socket.on('error', (err) => {
        console.error('MCP socket error:', err);
      });
    });

    return server;
  }

  private async handleCommand(command: MCPCommand): Promise<MCPResponse> {
    const { id, cmd, args } = command;

    try {
      switch (cmd) {
        case 'screenshot': {
          const data = await this.browser.screenshot();
          return { id, success: true, data };
        }

        case 'click': {
          const selector = args?.selector as string;
          if (!selector) {
            return { id, success: false, error: 'Missing selector' };
          }
          const clicked = await this.browser.click(selector);
          return { id, success: clicked, data: clicked ? 'Clicked' : 'Element not found' };
        }

        case 'navigate': {
          const url = args?.url as string;
          if (!url) {
            return { id, success: false, error: 'Missing URL' };
          }
          const success = await this.browser.navigate(url);
          return { id, success, data: success ? `Navigated to ${url}` : `Failed to navigate to ${url}` };
        }

        case 'getDOM': {
          const selector = args?.selector as string | undefined;
          const html = await this.browser.getDOM(selector);
          return { id, success: true, data: html };
        }

        case 'getConsoleLogs': {
          const logs = await this.browser.getConsoleLogs();
          return { id, success: true, data: logs };
        }

        case 'getNetworkRequests': {
          const requests = this.browser.getNetworkRequests();
          return { id, success: true, data: requests };
        }

        case 'typeText': {
          const selector = args?.selector as string;
          const text = args?.text as string;
          if (!selector || text === undefined) {
            return { id, success: false, error: 'Missing selector or text' };
          }
          const typed = await this.browser.typeText(selector, text);
          return { id, success: typed, data: typed ? 'Typed' : 'Element not found' };
        }

        case 'evaluateJS': {
          const code = args?.code as string;
          if (!code) {
            return { id, success: false, error: 'Missing code' };
          }
          const result = await this.browser.evaluateJS(code);
          return { id, success: true, data: result };
        }

        case 'getCurrentURL': {
          const url = this.browser.getCurrentURL();
          return { id, success: true, data: url };
        }

        case 'goBack': {
          this.browser.goBack();
          return { id, success: true, data: 'Went back' };
        }

        case 'goForward': {
          this.browser.goForward();
          return { id, success: true, data: 'Went forward' };
        }

        case 'reload': {
          this.browser.reload();
          return { id, success: true, data: 'Reloaded' };
        }

        default:
          return { id, success: false, error: `Unknown command: ${cmd}` };
      }
    } catch (error) {
      return { id, success: false, error: `Command failed: ${error}` };
    }
  }

  close(): void {
    this.server?.close();
  }

  getPort(): number {
    return this.port;
  }
}
