/**
 * MCP Bridge - Local server for MCP to communicate with Electron
 * Uses simple TCP socket for IPC between MCP server and Electron app
 */
import net from 'net';
import { BrowserManager } from './browser-manager';

const MCP_BRIDGE_PORT = 9876;

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
  private server: net.Server;
  private browser: BrowserManager;

  constructor(browser: BrowserManager) {
    this.browser = browser;
    this.server = this.createServer();
  }

  private createServer(): net.Server {
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

    server.listen(MCP_BRIDGE_PORT, '127.0.0.1', () => {
      console.log(`MCP Bridge listening on port ${MCP_BRIDGE_PORT}`);
    });

    server.on('error', (err) => {
      console.error('MCP Bridge server error:', err);
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
          this.browser.navigate(url);
          return { id, success: true, data: `Navigating to ${url}` };
        }

        case 'getDOM': {
          const selector = args?.selector as string | undefined;
          const html = await this.browser.getDOM(selector);
          return { id, success: true, data: html };
        }

        case 'getConsoleLogs': {
          const logs = this.browser.getConsoleLogs();
          return { id, success: true, data: logs };
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
    this.server.close();
  }
}
