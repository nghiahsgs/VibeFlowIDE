#!/usr/bin/env node
/**
 * VibeFlow MCP Server
 * Provides browser control tools for Claude Code
 * Communicates with Electron app via TCP socket
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import net from 'net';

const MCP_BRIDGE_PORT = 9876;

// Tool definitions
const tools: Tool[] = [
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the embedded browser in VibeFlow IDE',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'browser_click',
    description: 'Click an element in the browser by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to click'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_get_dom',
    description: 'Get the DOM HTML content, optionally filtered by selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to get specific element HTML'
        }
      },
      required: []
    }
  },
  {
    name: 'browser_get_console_logs',
    description: 'Get console logs from the browser',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'browser_type_text',
    description: 'Type text into an input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input element'
        },
        text: {
          type: 'string',
          description: 'Text to type'
        }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_evaluate_js',
    description: 'Execute JavaScript code in the browser and return the result',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'browser_get_url',
    description: 'Get the current URL of the browser',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Bridge to Electron app
class ElectronBridge {
  private socket: net.Socket | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = '';

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port: MCP_BRIDGE_PORT, host: '127.0.0.1' });

      this.socket.on('connect', () => {
        this.connected = true;
        console.error('Connected to VibeFlow IDE');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                this.pendingRequests.delete(response.id);
                if (response.success) {
                  pending.resolve(response.data);
                } else {
                  pending.reject(new Error(response.error));
                }
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      });

      this.socket.on('error', (err) => {
        console.error('Bridge connection error:', err.message);
        if (!this.connected) {
          reject(new Error('VibeFlow IDE is not running. Please start VibeFlow IDE first.'));
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
        console.error('Disconnected from VibeFlow IDE');
      });
    });
  }

  async sendCommand(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.socket) {
      try {
        await this.connect();
      } catch {
        throw new Error('VibeFlow IDE is not running');
      }
    }

    const id = `req_${++this.requestId}`;
    const message = JSON.stringify({ id, cmd, args }) + '\n';

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Command timeout'));
        }
      }, 30000);

      this.socket?.write(message);
    });
  }
}

// Main server
async function main() {
  const bridge = new ElectronBridge();

  // Try to connect initially
  try {
    await bridge.connect();
  } catch (e) {
    console.error('Warning: Could not connect to VibeFlow IDE initially');
  }

  const server = new Server(
    {
      name: 'vibeflow-browser',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'browser_screenshot': {
          const data = await bridge.sendCommand('screenshot');
          return {
            content: [
              {
                type: 'image',
                data: data as string,
                mimeType: 'image/png'
              }
            ]
          };
        }

        case 'browser_click': {
          const result = await bridge.sendCommand('click', { selector: args?.selector });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'browser_navigate': {
          const result = await bridge.sendCommand('navigate', { url: args?.url });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'browser_get_dom': {
          const html = await bridge.sendCommand('getDOM', { selector: args?.selector });
          return {
            content: [{ type: 'text', text: String(html) }]
          };
        }

        case 'browser_get_console_logs': {
          const logs = (await bridge.sendCommand('getConsoleLogs')) as string[];
          return {
            content: [{ type: 'text', text: logs.join('\n') || 'No console logs' }]
          };
        }

        case 'browser_type_text': {
          const result = await bridge.sendCommand('typeText', {
            selector: args?.selector,
            text: args?.text
          });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'browser_evaluate_js': {
          const result = await bridge.sendCommand('evaluateJS', { code: args?.code });
          // Handle undefined/null results properly
          const resultText = result === undefined ? 'undefined'
            : result === null ? 'null'
            : typeof result === 'string' ? result
            : JSON.stringify(result, null, 2);
          return {
            content: [{ type: 'text', text: resultText }]
          };
        }

        case 'browser_get_url': {
          const url = await bridge.sendCommand('getCurrentURL');
          return {
            content: [{ type: 'text', text: String(url) }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error}` }],
        isError: true
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('VibeFlow MCP Server started');
}

main().catch(console.error);
