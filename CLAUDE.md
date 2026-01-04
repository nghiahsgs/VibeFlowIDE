# VibeFlow IDE

AI-Native IDE combining Terminal + Browser + MCP Server for Claude Code integration.

## Commands

```bash
# Development
npm install          # Install dependencies
npm run rebuild      # Rebuild native modules (node-pty)
npm run dev          # Start development mode
npm run build        # Build for production
npm run typecheck    # Type check

# MCP Server (standalone)
node out/mcp-server/index.js
```

## Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts         # App entry, window creation
│   ├── pty-manager.ts   # Terminal shell management
│   ├── browser-manager.ts # WebContentsView control
│   └── mcp-bridge.ts    # TCP bridge for MCP server
├── preload/        # IPC bridge
│   └── index.ts         # contextBridge APIs
├── renderer/       # React frontend
│   ├── App.tsx          # Main layout
│   ├── components/
│   │   ├── terminal-panel.tsx
│   │   └── browser-panel.tsx
│   └── styles/
└── mcp-server/     # Standalone MCP server
    └── index.ts         # MCP tools for browser control
```

## MCP Tools Available

- `browser_screenshot` - Capture browser
- `browser_click` - Click by CSS selector
- `browser_navigate` - Go to URL
- `browser_get_dom` - Get page HTML
- `browser_get_console_logs` - Get console output
- `browser_type_text` - Type into input
- `browser_evaluate_js` - Execute JavaScript
- `browser_get_url` - Get current URL

## Key Dependencies

- Electron 30 (WebContentsView)
- @xterm/xterm + node-pty (Terminal)
- react-resizable-panels (Split view)
- @modelcontextprotocol/sdk (MCP Server)
