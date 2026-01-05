# Phase 4: MCP Tools

**Date:** 2026-01-04
**Status:** Pending
**Priority:** High
**Estimated:** 3 hours

## Context Links

- Existing MCP: `src/mcp-server/index.ts`
- MCP Bridge: `src/main/mcp-bridge.ts`
- SimulatorManager: `phase-02-simulator-manager.md`

## Overview

Extend MCP server with iOS Simulator tools so Claude Code can interact with simulator programmatically. Follow existing pattern for browser_* tools.

## Key Insights

1. MCP server communicates via TCP to MCPBridge in main process
2. MCPBridge calls SimulatorManager methods
3. Tools return structured responses (text or image)
4. Keep tool names consistent: `simulator_*`

## Requirements

- [ ] `simulator_screenshot` - Take screenshot
- [ ] `simulator_tap` - Tap at coordinates
- [ ] `simulator_launch_app` - Launch app by bundle ID
- [ ] `simulator_open_url` - Open URL in simulator
- [ ] `simulator_list_devices` - List available devices
- [ ] `simulator_boot` - Boot a specific device
- [ ] `simulator_shutdown` - Shutdown current device
- [ ] `simulator_get_status` - Get current simulator state

## Architecture

### Tool Definitions

```typescript
// Add to src/mcp-server/index.ts tools array

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
```

## Implementation Steps

### 1. Update MCPBridge to handle simulator commands

```typescript
// Add to src/main/mcp-bridge.ts

import { SimulatorManager } from './simulator-manager';

export class MCPBridge {
  private server: net.Server | null = null;
  private browser: BrowserManager;
  private simulator: SimulatorManager | null = null; // Add this
  private port: number = MCP_BRIDGE_PORT;

  constructor(browser: BrowserManager, simulator?: SimulatorManager) {
    this.browser = browser;
    this.simulator = simulator || null; // Add this
    this.startServer();
  }

  // Add simulator setter for lazy init
  setSimulatorManager(manager: SimulatorManager): void {
    this.simulator = manager;
  }

  private async handleCommand(command: MCPCommand): Promise<MCPResponse> {
    const { id, cmd, args } = command;

    try {
      switch (cmd) {
        // ... existing browser commands ...

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
          const url = args?.url as string;
          if (!url) {
            return { id, success: false, error: 'Missing URL' };
          }
          await this.simulator.openUrl(url);
          return { id, success: true, data: `Opened ${url}` };
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
}
```

### 2. Update MCP Server tool handlers

```typescript
// Add to src/mcp-server/index.ts

// In CallToolRequestSchema handler switch statement:

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
```

### 3. Update main/index.ts to pass SimulatorManager to MCPBridge

```typescript
// In createWindow():
simulatorManager = new SimulatorManager(mainWindow);
browserManager = new BrowserManager(mainWindow);
mcpBridge = new MCPBridge(browserManager, simulatorManager); // Pass both

// Or use setter:
mcpBridge = new MCPBridge(browserManager);
mcpBridge.setSimulatorManager(simulatorManager);
```

### 4. Update tools array in MCP server

```typescript
// src/mcp-server/index.ts

// Merge browser and simulator tools
const tools: Tool[] = [
  // ... existing browser tools ...
  ...simulatorTools
];
```

## Related Code Files

| File | Change |
|------|--------|
| `src/mcp-server/index.ts` | Add simulator tools, handlers |
| `src/main/mcp-bridge.ts` | Add simulator command handling |
| `src/main/index.ts` | Pass simulator manager to bridge |

## Todo

- [ ] Add simulator tool definitions to MCP server
- [ ] Add simulator command handlers to MCPBridge
- [ ] Update MCPBridge constructor to accept SimulatorManager
- [ ] Update main/index.ts initialization
- [ ] Test all tools with Claude Code
- [ ] Update CLAUDE.md with new MCP tools

## Success Criteria

1. `simulator_screenshot` returns valid PNG image
2. `simulator_tap` executes tap and returns success
3. `simulator_launch_app` launches Safari (`com.apple.mobilesafari`)
4. `simulator_open_url` opens URL in simulator
5. `simulator_list_devices` returns device list
6. `simulator_boot` boots selected device
7. All tools show in Claude Code MCP tools list

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Simulator not booted for commands | High | Medium | Return clear error messages |
| Bridge timeout on slow commands | Medium | Medium | Increase timeout for boot/shutdown |
| Tool name conflicts | Low | Low | Use `simulator_` prefix consistently |

## Security Considerations

- Validate bundleId format (no shell injection)
- Validate URL format before passing to simctl
- Don't expose raw error stack traces

## Sample Usage by Claude Code

```markdown
# Claude Code can now:

1. Check simulator status:
   "simulator_get_status"

2. List available devices:
   "simulator_list_devices"

3. Boot iPhone 15 Pro:
   "simulator_boot" with deviceName: "iPhone 15 Pro"

4. Take screenshot:
   "simulator_screenshot"

5. Open URL:
   "simulator_open_url" with url: "http://localhost:3000"

6. Launch Safari:
   "simulator_launch_app" with bundleId: "com.apple.mobilesafari"

7. Tap screen:
   "simulator_tap" with x: 200, y: 400
```

## Next Steps

After this phase:
1. End-to-end testing
2. Documentation update
3. Performance optimization if needed
