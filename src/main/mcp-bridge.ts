/**
 * MCP Bridge - Local server for MCP to communicate with Electron
 * Uses simple TCP socket for IPC between MCP server and Electron app
 */
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrowserManager } from './browser-manager';
import { SimulatorManager } from './simulator-manager';

const MCP_BRIDGE_PORT = 9876;
const MAX_PORT_ATTEMPTS = 10;
const INSTANCES_FILE = path.join(os.homedir(), '.vibeflow-instances.json');

interface InstanceInfo {
  pid: number;
  port: number;
  cwd: string;
  startTime: number;
}

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
  private simulator: SimulatorManager | null = null;
  private port: number = MCP_BRIDGE_PORT;

  constructor(browser: BrowserManager, simulator?: SimulatorManager) {
    this.browser = browser;
    this.simulator = simulator || null;
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
      // Register this instance for MCP server discovery
      this.registerInstance(port);
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

        case 'waitForSelector': {
          const selector = args?.selector as string;
          const timeout = (args?.timeout as number) || 5000;
          if (!selector) {
            return { id, success: false, error: 'Missing selector' };
          }
          const found = await this.browser.waitForSelector(selector, timeout);
          return { id, success: found, data: found ? `Found: ${selector}` : `Timeout waiting for: ${selector}` };
        }

        case 'wait': {
          const ms = (args?.ms as number) || 1000;
          await this.browser.wait(ms);
          return { id, success: true, data: `Waited ${ms}ms` };
        }

        case 'hover': {
          const selector = args?.selector as string;
          if (!selector) {
            return { id, success: false, error: 'Missing selector' };
          }
          const hovered = await this.browser.hover(selector);
          return { id, success: hovered, data: hovered ? `Hovered: ${selector}` : 'Element not found' };
        }

        case 'scroll': {
          const scrolled = await this.browser.scroll({
            selector: args?.selector as string | undefined,
            x: args?.x as number | undefined,
            y: args?.y as number | undefined,
            direction: args?.direction as 'up' | 'down' | 'left' | 'right' | undefined,
            amount: args?.amount as number | undefined
          });
          return { id, success: scrolled, data: scrolled ? 'Scrolled' : 'Scroll failed' };
        }

        case 'selectOption': {
          const selector = args?.selector as string;
          if (!selector) {
            return { id, success: false, error: 'Missing selector' };
          }
          const selected = await this.browser.selectOption(selector, {
            value: args?.value as string | undefined,
            label: args?.label as string | undefined,
            index: args?.index as number | undefined
          });
          return { id, success: selected, data: selected ? 'Option selected' : 'Select failed' };
        }

        case 'pressKey': {
          const key = args?.key as string;
          if (!key) {
            return { id, success: false, error: 'Missing key' };
          }
          const pressed = await this.browser.pressKey(key, args?.selector as string | undefined);
          return { id, success: pressed, data: pressed ? `Pressed: ${key}` : 'Key press failed' };
        }

        case 'clearConsoleLogs': {
          await this.browser.clearConsoleLogs();
          return { id, success: true, data: 'Console logs cleared' };
        }

        case 'clearNetworkRequests': {
          this.browser.clearNetworkRequests();
          return { id, success: true, data: 'Network requests cleared' };
        }

        // Annotated screenshot & index-based interactions
        case 'annotate': {
          const result = await this.browser.annotateScreenshot();
          return { id, success: true, data: result };
        }

        case 'clickIndex': {
          const index = args?.index as number;
          if (typeof index !== 'number') {
            return { id, success: false, error: 'Missing index' };
          }
          const clicked = await this.browser.clickByIndex(index);
          return { id, success: clicked, data: clicked ? `Clicked element [${index}]` : `Element [${index}] not found` };
        }

        case 'typeIndex': {
          const index = args?.index as number;
          const text = args?.text as string;
          if (typeof index !== 'number' || text === undefined) {
            return { id, success: false, error: 'Missing index or text' };
          }
          const typed = await this.browser.typeByIndex(index, text);
          return { id, success: typed, data: typed ? `Typed into element [${index}]` : `Element [${index}] not found` };
        }

        case 'getAnnotatedElements': {
          const elements = this.browser.getAnnotatedElements();
          return { id, success: true, data: elements };
        }

        // Device emulation commands
        case 'setDeviceMode': {
          const deviceId = args?.deviceId as string;
          if (!deviceId) {
            return { id, success: false, error: 'Missing deviceId' };
          }
          const success = await this.browser.setDeviceMode(deviceId);
          return { id, success, data: success ? `Device mode set to: ${deviceId}` : `Unknown device: ${deviceId}` };
        }

        case 'getDeviceMode': {
          const mode = this.browser.getDeviceMode();
          return { id, success: true, data: mode };
        }

        case 'getDevicePresets': {
          const presets = this.browser.getDevicePresets();
          return { id, success: true, data: presets };
        }

        // Simulator commands
        case 'simulator:screenshot': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const data = await this.simulator.screenshot();
          return { id, success: true, data };
        }

        case 'simulator:tap': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const x = args?.x as number;
          const y = args?.y as number;
          if (x === undefined || y === undefined) {
            return { id, success: false, error: 'Missing x or y coordinate' };
          }
          await this.simulator.tap(x, y);
          return { id, success: true, data: `Tapped at (${x}, ${y})` };
        }

        case 'simulator:launchApp': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const bundleId = args?.bundleId as string;
          if (!bundleId) {
            return { id, success: false, error: 'Missing bundleId' };
          }
          await this.simulator.launchApp(bundleId);
          return { id, success: true, data: `Launched ${bundleId}` };
        }

        case 'simulator:openUrl': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const simUrl = args?.url as string;
          if (!simUrl) {
            return { id, success: false, error: 'Missing URL' };
          }
          await this.simulator.openUrl(simUrl);
          return { id, success: true, data: `Opened ${simUrl}` };
        }

        case 'simulator:listDevices': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const devices = this.simulator.listDevices();
          return { id, success: true, data: devices };
        }

        case 'simulator:boot': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          let udid = args?.udid as string;
          const deviceName = args?.deviceName as string;

          // If deviceName provided, find UDID
          if (!udid && deviceName) {
            const devices = this.simulator.listDevices();
            const device = devices.find(d =>
              d.name.toLowerCase() === deviceName.toLowerCase()
            );
            if (!device) {
              return { id, success: false, error: `Device not found: ${deviceName}` };
            }
            udid = device.udid;
          }

          if (!udid) {
            return { id, success: false, error: 'Missing udid or deviceName' };
          }

          await this.simulator.bootDevice(udid);
          return { id, success: true, data: `Booted device ${udid}` };
        }

        case 'simulator:shutdown': {
          if (!this.simulator) {
            return { id, success: false, error: 'Simulator not available' };
          }
          const booted = this.simulator.getBootedDevice();
          if (!booted) {
            return { id, success: false, error: 'No device currently booted' };
          }
          await this.simulator.shutdownDevice(booted.udid);
          return { id, success: true, data: 'Simulator shutdown' };
        }

        case 'simulator:getStatus': {
          if (!this.simulator) {
            return { id, success: true, data: { available: false } };
          }
          const status = await this.simulator.getStatus();
          return { id, success: true, data: status };
        }

        default:
          return { id, success: false, error: `Unknown command: ${cmd}` };
      }
    } catch (error) {
      return { id, success: false, error: `Command failed: ${error}` };
    }
  }

  /**
   * Register this instance in the shared instances file
   */
  private registerInstance(port: number): void {
    try {
      const instances = this.readInstances();

      // Remove any stale entries for this PID (shouldn't happen but just in case)
      const filtered = instances.filter(i => i.pid !== process.pid);

      // Add this instance
      const newInstance: InstanceInfo = {
        pid: process.pid,
        port,
        cwd: process.cwd(),
        startTime: Date.now()
      };
      filtered.push(newInstance);

      fs.writeFileSync(INSTANCES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
      console.log(`MCP Bridge registered: PID=${process.pid}, Port=${port}, CWD=${process.cwd()}`);
    } catch (error) {
      console.error('Failed to register instance:', error);
    }
  }

  /**
   * Remove this instance from the registry
   */
  private unregisterInstance(): void {
    try {
      const instances = this.readInstances();
      const filtered = instances.filter(i => i.pid !== process.pid);

      if (filtered.length > 0) {
        fs.writeFileSync(INSTANCES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
      } else {
        // No instances left, remove the file
        if (fs.existsSync(INSTANCES_FILE)) {
          fs.unlinkSync(INSTANCES_FILE);
        }
      }
    } catch (error) {
      console.error('Failed to unregister instance:', error);
    }
  }

  /**
   * Read all registered instances, cleaning up dead ones
   */
  private readInstances(): InstanceInfo[] {
    try {
      if (!fs.existsSync(INSTANCES_FILE)) {
        return [];
      }

      const content = fs.readFileSync(INSTANCES_FILE, 'utf-8');
      const instances: InstanceInfo[] = JSON.parse(content);

      // Filter out dead processes
      return instances.filter(instance => this.isProcessAlive(instance.pid));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if a process is still running
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // Signal 0 just checks if process exists
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.server?.close();
    this.unregisterInstance();
  }

  getPort(): number {
    return this.port;
  }
}
