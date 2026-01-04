# MCP Browser Control Integration Research
**Date:** 2026-01-04 | **Status:** Research Complete

---

## Executive Summary

Building an MCP server for browser control in Electron requires three components: (1) MCP server via `@modelcontextprotocol/sdk` exposing tools via stdio, (2) Electron integration using Chrome DevTools Protocol, (3) Claude CLI/Code connection via config file pointing to server command.

---

## 1. MCP Server Architecture

### Core Structure
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "browser-control",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

const transport = new StdioServerTransport();
server.connect(transport);
```

**Key Points:**
- Stdio transport: JSON-RPC 2.0 over stdin/stdout (process isolation, secure)
- Never write to stdout in stdio servers (corrupts JSON-RPC). Use stderr/logging instead
- HTTP/SSE available but not recommended for Electron embedding
- Install: `npm install @modelcontextprotocol/sdk zod`

---

## 2. Browser Control Tools

### Tool Definition Schema
```typescript
server.registerTool("click_element", {
  title: "Click DOM element",
  description: "Click element by selector",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector"),
    timeout: z.number().optional().describe("Wait time (ms)")
  })
}, async ({ selector, timeout }) => {
  // Implementation
  return { content: [{ type: "text", text: "Clicked" }] };
});
```

### Recommended Tools (based on Browser MCP patterns)
1. **clickElement(selector)** - Click by CSS selector
2. **getDOM(selector?)** - Extract DOM structure as text
3. **screenshot()** - Capture page as base64
4. **getConsoleLogs()** - Retrieve console output
5. **typeText(selector, text)** - Input text into element
6. **navigate(url)** - Go to URL
7. **evaluateJS(code)** - Execute arbitrary JavaScript
8. **getPageContent()** - Full page HTML

---

## 3. Electron Integration

### Enable Remote Debugging
```javascript
// In Electron main.js
if (process.env.NODE_ENV === 'development') {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}
```

### Connect via Chrome DevTools Protocol
```typescript
import CDP from 'chrome-remote-interface';

const client = await CDP({ port: 9222 });
const { Runtime, DOM, Page } = client;

// Take screenshot
const { data } = await Page.captureScreenshot({ format: 'png' });

// Get DOM
const { root } = await DOM.getDocument();

// Execute JS
const result = await Runtime.evaluate({ expression: 'document.title' });

await client.close();
```

**Alternative:** Use Playwright/Puppeteer which handles CDP internally (easier, more stable).

---

## 4. Claude Code Connection

### Configuration (Claude Desktop)
```json
{
  "mcpServers": {
    "browser-control": {
      "command": "node",
      "args": ["/absolute/path/to/server/dist/index.js"]
    }
  }
}
```

**File Locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Testing
```bash
# Restart Claude completely (not just close window)
# Look for "browser-control" in connectors menu
# Verify via tail ~/Library/Logs/Claude/mcp*.log
```

---

## 5. Complete Minimal Example

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod";

const server = new Server({
  name: "browser-control",
  version: "1.0.0"
}, { capabilities: { tools: {} } });

server.registerTool("screenshot", {
  title: "Take screenshot",
  inputSchema: z.object({})
}, async () => {
  // Use Playwright or CDP here
  return {
    content: [{
      type: "image",
      data: "base64_image_data",
      mimeType: "image/png"
    }]
  };
});

server.registerTool("click", {
  title: "Click element",
  inputSchema: z.object({
    selector: z.string()
  })
}, async ({ selector }) => {
  // Click element via CDP/Playwright
  return { content: [{ type: "text", text: "Clicked" }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
```

---

## 6. Transport Decision

| Transport | Use Case | Pros | Cons |
|-----------|----------|------|------|
| **Stdio** | Electron embedded | Process isolation, secure, simple | Can't restart without app restart |
| **HTTP** | Remote server | Can restart independently | Network latency, CORS complexity |
| **Streamable HTTP** | Recommended for new | Better than HTTP+SSE | More complex setup |

**Decision:** Use stdio for Electron embedding—clean subprocess model.

---

## 7. Key Implementation Notes

1. **Never use `console.log` in stdio servers** → logs must go to stderr/file
2. **Always use absolute paths** in Claude config
3. **Restart Claude completely** after config changes (not just close window)
4. **Input validation:** Use Zod for schema validation
5. **Error handling:** Return error content objects, never throw uncaught
6. **Build output:** TypeScript must compile to `/dist/index.js`

---

## 8. Reference Implementations

- **Browser MCP:** [browsermcp.io](https://browsermcp.io/) - Chrome extension + server
- **Electron MCP:** [amafjarkasi/electron-mcp-server](https://github.com/amafjarkasi/electron-mcp-server) - CDP integration
- **Official examples:** typescript-sdk `examples/server/` directory
- **Inspector:** `@modelcontextprotocol/inspector` for debugging tools

---

## Unresolved Questions

1. **Playwright vs CDP directly?** Playwright abstracts CDP but adds dependency weight
2. **Subprocess restart strategy?** How to handle server crashes in Electron context
3. **Window/tab management?** Tool design for multiple browser windows/tabs
4. **Performance:** Network latency impact of CDP over localhost
5. **Session persistence?** Handling cookies/auth across server restarts

---

## Sources
- [GitHub TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Build Server Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)
- [DEV: Build MCP Servers Tutorial](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28)
- [Electron MCP Server](https://github.com/amafjarkasi/electron-mcp-server)
- [Browser MCP](https://browsermcp.io/)
