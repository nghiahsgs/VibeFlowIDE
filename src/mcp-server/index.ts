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
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_MCP_BRIDGE_PORT = 9876;
const INSTANCES_FILE = path.join(os.homedir(), '.vibeflow-instances.json');

interface InstanceInfo {
  pid: number;
  port: number;
  cwd: string;
  startTime: number;
}

/**
 * Find the best matching VibeFlow instance for current CWD
 * Priority: 1) Exact CWD match, 2) CWD is subdirectory, 3) Most recent instance
 */
function findBestInstance(): InstanceInfo | null {
  try {
    if (!fs.existsSync(INSTANCES_FILE)) {
      return null;
    }

    const content = fs.readFileSync(INSTANCES_FILE, 'utf-8');
    const instances: InstanceInfo[] = JSON.parse(content);

    if (instances.length === 0) {
      return null;
    }

    const currentCwd = process.cwd();

    // 1) Exact match
    const exactMatch = instances.find(i => i.cwd === currentCwd);
    if (exactMatch) {
      return exactMatch;
    }

    // 2) Current CWD is subdirectory of an instance's CWD
    const parentMatch = instances
      .filter(i => currentCwd.startsWith(i.cwd + '/'))
      .sort((a, b) => b.cwd.length - a.cwd.length)[0]; // Longest match first
    if (parentMatch) {
      return parentMatch;
    }

    // 3) Fall back to most recently started instance
    return instances.sort((a, b) => b.startTime - a.startTime)[0];
  } catch (error) {
    return null;
  }
}

/**
 * Get MCP Bridge port from instances registry
 * Matches by CWD or falls back to most recent instance
 */
function getMCPBridgePort(): number {
  const instance = findBestInstance();
  if (instance) {
    console.error(`Found VibeFlow instance: PID=${instance.pid}, CWD=${instance.cwd}`);
    return instance.port;
  }
  console.error('No VibeFlow instance found, using default port');
  return DEFAULT_MCP_BRIDGE_PORT;
}

// Browser tool definitions
const browserTools: Tool[] = [
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
    name: 'browser_get_network_requests',
    description: 'Get network requests captured from the browser',
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

// iOS Simulator tool definitions
const simulatorTools: Tool[] = [
  {
    name: 'simulator_screenshot',
    description: 'Take a screenshot of the iOS Simulator',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'simulator_tap',
    description: 'Tap at specific coordinates on the iOS Simulator screen',
    inputSchema: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate (from left)'
        },
        y: {
          type: 'number',
          description: 'Y coordinate (from top)'
        }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'simulator_launch_app',
    description: 'Launch an app in the iOS Simulator by bundle ID',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: {
          type: 'string',
          description: 'App bundle identifier (e.g., com.apple.mobilesafari)'
        }
      },
      required: ['bundleId']
    }
  },
  {
    name: 'simulator_open_url',
    description: 'Open a URL in the iOS Simulator',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open (e.g., https://example.com)'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'simulator_list_devices',
    description: 'List available iOS Simulator devices',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'simulator_boot',
    description: 'Boot a specific iOS Simulator device',
    inputSchema: {
      type: 'object',
      properties: {
        udid: {
          type: 'string',
          description: 'Device UDID (get from simulator_list_devices)'
        },
        deviceName: {
          type: 'string',
          description: 'Or use device name (e.g., "iPhone 15 Pro")'
        }
      },
      required: []
    }
  },
  {
    name: 'simulator_shutdown',
    description: 'Shutdown the currently booted iOS Simulator',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'simulator_get_status',
    description: 'Get the current iOS Simulator status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Combined tools
const tools: Tool[] = [...browserTools, ...simulatorTools];

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
      const port = getMCPBridgePort();
      console.error(`Connecting to VibeFlow IDE on port ${port}...`);
      this.socket = net.createConnection({ port, host: '127.0.0.1' });

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

        case 'browser_get_network_requests': {
          const requests = (await bridge.sendCommand('getNetworkRequests')) as Array<{
            id: string;
            url: string;
            method: string;
            status?: number;
            startTime: number;
            endTime?: number;
            duration?: number;
            type: string;
            mimeType: string;
            requestHeaders?: Record<string, string>;
            responseHeaders?: Record<string, string>;
            requestBody?: string;
            responseBody?: string;
            responseSize: number;
            error?: string;
          }>;

          if (!requests || requests.length === 0) {
            return {
              content: [{ type: 'text', text: 'No network requests captured' }]
            };
          }

          const formatted = requests.map((req, idx) => {
            const parts = [
              `[${idx + 1}] ${req.method} ${req.url}`,
              `    Status: ${req.status || 'pending'}`,
              `    Type: ${req.type}`,
              `    Time: ${new Date(req.startTime).toISOString()}`,
              req.duration ? `    Duration: ${req.duration}ms` : null,
              req.error ? `    Error: ${req.error}` : null
            ].filter(Boolean) as string[];

            if (req.requestHeaders) {
              parts.push(`    Request Headers: ${JSON.stringify(req.requestHeaders, null, 2)}`);
            }

            if (req.responseHeaders) {
              parts.push(`    Response Headers: ${JSON.stringify(req.responseHeaders, null, 2)}`);
            }

            if (req.requestBody) {
              parts.push(`    Request Body: ${req.requestBody}`);
            }

            if (req.responseBody) {
              parts.push(`    Response Body: ${req.responseBody}`);
            }

            return parts.join('\n');
          });

          return {
            content: [{ type: 'text', text: formatted.join('\n\n') }]
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

        // iOS Simulator tools
        case 'simulator_screenshot': {
          const data = await bridge.sendCommand('simulator:screenshot');
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

        case 'simulator_tap': {
          const result = await bridge.sendCommand('simulator:tap', {
            x: args?.x,
            y: args?.y
          });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'simulator_launch_app': {
          const result = await bridge.sendCommand('simulator:launchApp', {
            bundleId: args?.bundleId
          });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'simulator_open_url': {
          const result = await bridge.sendCommand('simulator:openUrl', {
            url: args?.url
          });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'simulator_list_devices': {
          const devices = await bridge.sendCommand('simulator:listDevices');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(devices, null, 2)
            }]
          };
        }

        case 'simulator_boot': {
          const result = await bridge.sendCommand('simulator:boot', {
            udid: args?.udid,
            deviceName: args?.deviceName
          });
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'simulator_shutdown': {
          const result = await bridge.sendCommand('simulator:shutdown');
          return {
            content: [{ type: 'text', text: String(result) }]
          };
        }

        case 'simulator_get_status': {
          const status = await bridge.sendCommand('simulator:getStatus');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(status, null, 2)
            }]
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
