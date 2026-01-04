# Phase 04: MCP Server

**Status:** ⏳ Pending | **Priority:** Critical

---

## Context

Build MCP Server để Claude Code có thể điều khiển browser embedded.

**Related:** [plan.md](./plan.md) | [MCP Research](../reports/260104-mcp-browser-control-research.md)

---

## Overview

- Standalone MCP server (Node.js process)
- Communicate với Electron via IPC/HTTP
- Expose tools: screenshot, click, getDOM, navigate
- Claude connects via stdio

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │◄───►│   MCP Server    │◄───►│   Electron App  │
│   (Terminal)    │stdio│  (Node.js)      │ IPC │   (Browser)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                         Tools:
                         - screenshot
                         - click
                         - getDOM
                         - navigate
                         - getConsoleLogs
```

---

## Implementation Steps

### 1. MCP Server entry point
```typescript
// src/mcp-server/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrowserBridge } from "./browser-bridge.js";

const server = new Server(
  { name: "vibeflow-browser", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const bridge = new BrowserBridge();

// Screenshot tool
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "screenshot":
      const image = await bridge.screenshot();
      return {
        content: [{
          type: "image",
          data: image,
          mimeType: "image/png"
        }]
      };

    case "click":
      await bridge.click(args.selector);
      return { content: [{ type: "text", text: "Clicked" }] };

    case "navigate":
      await bridge.navigate(args.url);
      return { content: [{ type: "text", text: `Navigated to ${args.url}` }] };

    case "getDOM":
      const html = await bridge.getDOM(args.selector);
      return { content: [{ type: "text", text: html }] };

    case "getConsoleLogs":
      const logs = await bridge.getConsoleLogs();
      return { content: [{ type: "text", text: logs.join('\n') }] };
  }
});

// List available tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "screenshot",
      description: "Take screenshot of browser",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "click",
      description: "Click element by CSS selector",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"]
      }
    },
    {
      name: "navigate",
      description: "Navigate to URL",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    },
    {
      name: "getDOM",
      description: "Get DOM HTML, optionally filtered by selector",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string" } }
      }
    },
    {
      name: "getConsoleLogs",
      description: "Get browser console logs",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

const transport = new StdioServerTransport();
server.connect(transport);
```

### 2. Browser Bridge (communicate with Electron)
```typescript
// src/mcp-server/browser-bridge.ts
import net from 'net';

export class BrowserBridge {
  private socket: net.Socket | null = null;
  private port = 9876; // Local IPC port

  async connect() {
    this.socket = net.createConnection({ port: this.port });
    // Handle connection...
  }

  async screenshot(): Promise<string> {
    return this.sendCommand('screenshot');
  }

  async click(selector: string): Promise<void> {
    await this.sendCommand('click', { selector });
  }

  async navigate(url: string): Promise<void> {
    await this.sendCommand('navigate', { url });
  }

  async getDOM(selector?: string): Promise<string> {
    return this.sendCommand('getDOM', { selector });
  }

  async getConsoleLogs(): Promise<string[]> {
    return this.sendCommand('getConsoleLogs');
  }

  private async sendCommand(cmd: string, args?: object): Promise<any> {
    // Send to Electron via socket
  }
}
```

### 3. Electron-side IPC Server
```typescript
// src/main/mcp-bridge.ts
import net from 'net';
import { BrowserManager } from './browser-manager';

export class MCPBridge {
  private server: net.Server;

  constructor(private browser: BrowserManager) {
    this.server = net.createServer((socket) => {
      socket.on('data', async (data) => {
        const { cmd, args } = JSON.parse(data.toString());
        const result = await this.handleCommand(cmd, args);
        socket.write(JSON.stringify(result));
      });
    });

    this.server.listen(9876);
  }

  private async handleCommand(cmd: string, args: any) {
    const webContents = this.browser.getWebContents();

    switch (cmd) {
      case 'screenshot':
        const image = await webContents?.capturePage();
        return image?.toDataURL().split(',')[1]; // base64

      case 'click':
        await webContents?.executeJavaScript(
          `document.querySelector('${args.selector}')?.click()`
        );
        return { success: true };

      case 'navigate':
        webContents?.loadURL(args.url);
        return { success: true };

      case 'getDOM':
        return await webContents?.executeJavaScript(
          args.selector
            ? `document.querySelector('${args.selector}')?.outerHTML`
            : `document.documentElement.outerHTML`
        );

      case 'getConsoleLogs':
        // Implement console log collection
        return [];
    }
  }
}
```

### 4. Claude configuration
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "vibeflow-browser": {
      "command": "node",
      "args": ["/path/to/vibeflow-ide/dist/mcp-server/index.js"]
    }
  }
}
```

---

## Todo List

- [ ] Create MCP server với @modelcontextprotocol/sdk
- [ ] Implement BrowserBridge class
- [ ] Setup local socket IPC
- [ ] Electron MCPBridge to handle commands
- [ ] Implement all 5 tools
- [ ] Add error handling
- [ ] Test with Claude Code

---

## Success Criteria

- MCP server starts without errors
- Claude Code recognizes "vibeflow-browser" server
- All 5 tools work:
  - screenshot returns image
  - click works
  - navigate changes URL
  - getDOM returns HTML
  - getConsoleLogs returns logs

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Socket connection fails | High | Retry logic, error messages |
| Claude config wrong | Medium | Clear instructions, validation |
| Tool timeout | Medium | Set reasonable timeouts |
