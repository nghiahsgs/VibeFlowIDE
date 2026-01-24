#!/usr/bin/env node
/**
 * VibeFlow Simulator MCP Server (Standalone)
 * Controls iOS Simulator via xcrun simctl - no VibeFlow IDE required
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { execSync, spawn } from 'child_process';
import { existsSync, unlinkSync, readFileSync } from 'fs';

// Check if simctl is available
function isSimctlAvailable(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    execSync('xcrun simctl help', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Simulator device interface
interface SimulatorDevice {
  udid: string;
  name: string;
  state: string;
  runtime: string;
  runtimeVersion: string;
  isAvailable: boolean;
}

// List available simulator devices
function listDevices(): SimulatorDevice[] {
  if (!isSimctlAvailable()) return [];

  try {
    const output = execSync('xcrun simctl list --json devices available', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    const data = JSON.parse(output) as { devices: Record<string, SimulatorDevice[]> };
    const devices: SimulatorDevice[] = [];

    for (const [runtime, runtimeDevices] of Object.entries(data.devices)) {
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

// Get booted device
function getBootedDevice(): SimulatorDevice | null {
  const devices = listDevices();
  return devices.find(d => d.state === 'Booted') || null;
}

// Take screenshot - returns base64 JPEG
async function screenshot(): Promise<string> {
  const tmpPath = `/tmp/vibeflow-sim-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  return new Promise((resolve, reject) => {
    const proc = spawn('xcrun', ['simctl', 'io', 'booted', 'screenshot', tmpPath]);

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      reject(new Error('Screenshot timeout'));
    }, 10000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      try {
        if (code === 0 && existsSync(tmpPath)) {
          const buffer = readFileSync(tmpPath);
          unlinkSync(tmpPath);
          const base64 = buffer.toString('base64');
          resolve(base64);
        } else {
          reject(new Error('Screenshot failed - is simulator booted?'));
        }
      } catch (e) {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(e);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

// Boot device by UDID or name
async function bootDevice(udid?: string, deviceName?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let target = udid;

    // Find by name if no UDID provided
    if (!target && deviceName) {
      const devices = listDevices();
      const found = devices.find(d => d.name.toLowerCase() === deviceName.toLowerCase());
      if (found) {
        target = found.udid;
      } else {
        reject(new Error(`Device not found: ${deviceName}`));
        return;
      }
    }

    if (!target) {
      reject(new Error('No device specified'));
      return;
    }

    const proc = spawn('xcrun', ['simctl', 'boot', target]);

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Boot timeout'));
    }, 60000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(`Booted device: ${target}`);
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

// Shutdown booted device
async function shutdownDevice(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('xcrun', ['simctl', 'shutdown', 'booted']);

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Shutdown timeout'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve('Simulator shutdown');
      } else {
        reject(new Error(`Failed to shutdown (exit code ${code})`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Get Simulator window position
function getSimulatorWindowPosition(): { x: number; y: number; w: number; h: number } | null {
  try {
    const result = execSync(`osascript -e '
      tell application "Simulator" to activate
      delay 0.2
      tell application "System Events"
        tell process "Simulator"
          set frontWindow to window 1
          set {x, y} to position of frontWindow
          set {w, h} to size of frontWindow
        end tell
      end tell
      return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
    '`, { encoding: 'utf-8' }).trim();

    const [x, y, w, h] = result.split(',').map(Number);
    return { x, y, w, h };
  } catch {
    return null;
  }
}

// Tap at coordinates (relative to simulator screen)
async function tap(x: number, y: number): Promise<string> {
  const win = getSimulatorWindowPosition();
  if (!win) {
    throw new Error('Could not get Simulator window position');
  }

  // Account for window title bar (~28px on macOS)
  const TITLE_BAR_HEIGHT = 28;
  const absX = win.x + x;
  const absY = win.y + TITLE_BAR_HEIGHT + y;

  // Try cliclick first, fallback to AppleScript
  try {
    execSync(`cliclick c:${Math.round(absX)},${Math.round(absY)}`, { stdio: 'pipe' });
    return `Tapped at (${x}, ${y})`;
  } catch {
    // Fallback to AppleScript
    execSync(`osascript -e '
      tell application "Simulator" to activate
      delay 0.2
      tell application "System Events"
        click at {${Math.round(absX)}, ${Math.round(absY)}}
      end tell
    '`, { stdio: 'pipe' });
    return `Tapped at (${x}, ${y})`;
  }
}

// Type text into focused field using pasteboard
async function typeText(text: string): Promise<string> {
  // Copy text to simulator pasteboard
  execSync(`echo -n "${text.replace(/"/g, '\\"')}" | xcrun simctl pbcopy booted`, {
    encoding: 'utf-8',
    shell: '/bin/bash'
  });

  // Paste using Cmd+V
  execSync(`osascript -e '
    tell application "Simulator" to activate
    delay 0.2
    tell application "System Events"
      keystroke "v" using command down
    end tell
  '`, { stdio: 'pipe' });

  return `Typed: ${text}`;
}

// Key code mapping for common keys
const KEY_CODES: Record<string, number> = {
  'delete': 51,
  'backspace': 51,
  'return': 36,
  'enter': 36,
  'tab': 48,
  'escape': 53,
  'up': 126,
  'down': 125,
  'left': 123,
  'right': 124,
  'space': 49,
};

// Press a key or key combination
async function pressKey(key: string, modifiers?: string[]): Promise<string> {
  const keyLower = key.toLowerCase();
  const keyCode = KEY_CODES[keyLower];

  let modifierStr = '';
  if (modifiers && modifiers.length > 0) {
    const modMap: Record<string, string> = {
      'cmd': 'command down',
      'command': 'command down',
      'shift': 'shift down',
      'alt': 'option down',
      'option': 'option down',
      'ctrl': 'control down',
      'control': 'control down',
    };
    modifierStr = modifiers.map(m => modMap[m.toLowerCase()] || '').filter(Boolean).join(', ');
  }

  if (keyCode !== undefined) {
    // Use key code for special keys
    const script = modifierStr
      ? `key code ${keyCode} using {${modifierStr}}`
      : `key code ${keyCode}`;

    execSync(`osascript -e '
      tell application "Simulator" to activate
      delay 0.2
      tell application "System Events"
        ${script}
      end tell
    '`, { stdio: 'pipe' });
  } else if (key.length === 1) {
    // Single character - use keystroke
    const script = modifierStr
      ? `keystroke "${key}" using {${modifierStr}}`
      : `keystroke "${key}"`;

    execSync(`osascript -e '
      tell application "Simulator" to activate
      delay 0.2
      tell application "System Events"
        ${script}
      end tell
    '`, { stdio: 'pipe' });
  } else {
    throw new Error(`Unknown key: ${key}`);
  }

  return `Pressed: ${modifiers?.length ? modifiers.join('+') + '+' : ''}${key}`;
}

// Launch app by bundle ID
async function launchApp(bundleId: string): Promise<string> {
  // Validate bundle ID
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
      if (code === 0) {
        resolve(`Launched: ${bundleId}`);
      } else {
        reject(new Error(`Failed to launch ${bundleId}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Open URL
async function openUrl(url: string): Promise<string> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

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
      if (code === 0) {
        resolve(`Opened: ${url}`);
      } else {
        reject(new Error(`Failed to open URL: ${url}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Tool definitions
const tools: Tool[] = [
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
    description: 'Tap at specific coordinates on the iOS Simulator screen (relative to simulator content, not window)',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate from left of simulator screen' },
        y: { type: 'number', description: 'Y coordinate from top of simulator screen' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'simulator_type_text',
    description: 'Type text into the currently focused input field in iOS Simulator',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' }
      },
      required: ['text']
    }
  },
  {
    name: 'simulator_press_key',
    description: 'Press a key or key combination in iOS Simulator. Use for navigation, delete, enter, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press: delete, backspace, return, enter, tab, escape, up, down, left, right, space, or single character (a-z)' },
        modifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional modifiers: cmd, shift, alt, ctrl. Example: ["cmd", "a"] for select all'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'simulator_launch_app',
    description: 'Launch an app in the iOS Simulator by bundle ID',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: { type: 'string', description: 'App bundle identifier (e.g., com.apple.mobilesafari)' }
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
        url: { type: 'string', description: 'URL to open (e.g., https://example.com)' }
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
        udid: { type: 'string', description: 'Device UDID (get from simulator_list_devices)' },
        deviceName: { type: 'string', description: 'Or use device name (e.g., "iPhone 16 Pro")' }
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
    description: 'Get the current iOS Simulator status (booted device, available)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Main server
async function main() {
  // Check platform
  if (process.platform !== 'darwin') {
    console.error('Error: iOS Simulator only works on macOS');
    process.exit(1);
  }

  if (!isSimctlAvailable()) {
    console.error('Error: Xcode/simctl not found. Install Xcode from App Store.');
    process.exit(1);
  }

  const server = new Server(
    {
      name: 'vibeflow-simulator',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'simulator_screenshot': {
          const data = await screenshot();
          return {
            content: [{
              type: 'image',
              data,
              mimeType: 'image/png'
            }]
          };
        }

        case 'simulator_tap': {
          const result = await tap(args?.x as number, args?.y as number);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_type_text': {
          const result = await typeText(args?.text as string);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_press_key': {
          const result = await pressKey(args?.key as string, args?.modifiers as string[] | undefined);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_launch_app': {
          const result = await launchApp(args?.bundleId as string);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_open_url': {
          const result = await openUrl(args?.url as string);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_list_devices': {
          const devices = listDevices();
          const booted = devices.filter(d => d.state === 'Booted');
          const available = devices.filter(d => d.state !== 'Booted');

          let output = '';
          if (booted.length > 0) {
            output += '🟢 BOOTED:\n';
            booted.forEach(d => {
              output += `  • ${d.name} (iOS ${d.runtimeVersion}) [${d.udid}]\n`;
            });
            output += '\n';
          }

          output += '📱 AVAILABLE:\n';
          available.slice(0, 20).forEach(d => {
            output += `  • ${d.name} (iOS ${d.runtimeVersion}) [${d.udid}]\n`;
          });

          if (available.length > 20) {
            output += `  ... and ${available.length - 20} more\n`;
          }

          return { content: [{ type: 'text', text: output }] };
        }

        case 'simulator_boot': {
          const result = await bootDevice(args?.udid as string, args?.deviceName as string);
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_shutdown': {
          const result = await shutdownDevice();
          return { content: [{ type: 'text', text: result }] };
        }

        case 'simulator_get_status': {
          const available = isSimctlAvailable();
          const booted = getBootedDevice();

          let status = `iOS Simulator Status:\n`;
          status += `• Available: ${available ? 'Yes' : 'No'}\n`;
          status += `• Booted: ${booted ? `${booted.name} (iOS ${booted.runtimeVersion})` : 'None'}\n`;

          if (booted) {
            status += `• UDID: ${booted.udid}`;
          }

          return { content: [{ type: 'text', text: status }] };
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
  console.error('VibeFlow Simulator MCP Server started (standalone)');
}

main().catch(console.error);
