# VibeFlow IDE

AI-Native IDE with Terminal + Browser + MCP Server for Claude Code.

## Features

- **Split View Layout** - Terminal, Browser, and iOS Simulator panels
- **Embedded Terminal** - Full xterm.js terminal with pty backend
- **Embedded Browser** - Chrome-based browser with DevTools
- **iOS Simulator** - Control real iOS Simulator from within the IDE (macOS only)
- **MCP Server** - Claude Code can control browser and simulator via MCP tools

## Quick Start

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron
npm run rebuild

# Start development mode
npm run dev
```

## MCP Configuration

To use VibeFlow browser control with Claude Code, add to your Claude config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vibeflow-browser": {
      "command": "node",
      "args": ["/path/to/vibeflow-ide/out/mcp-server/index.js"]
    }
  }
}
```

## Available MCP Tools

### Browser Tools

| Tool | Description |
|------|-------------|
| `browser_screenshot` | Capture browser screenshot |
| `browser_click` | Click element by CSS selector |
| `browser_navigate` | Navigate to URL |
| `browser_get_dom` | Get page HTML |
| `browser_get_console_logs` | Get console logs |
| `browser_type_text` | Type into input field |
| `browser_evaluate_js` | Execute JavaScript |
| `browser_get_url` | Get current URL |

### iOS Simulator Tools (macOS only)

| Tool | Description |
|------|-------------|
| `simulator_screenshot` | Capture simulator screenshot |
| `simulator_tap` | Tap at x,y coordinates |
| `simulator_launch_app` | Launch app by bundle ID |
| `simulator_open_url` | Open URL in simulator |
| `simulator_list_devices` | List available devices |
| `simulator_boot` | Boot a simulator device |
| `simulator_shutdown` | Shutdown booted device |
| `simulator_get_status` | Get simulator status |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        VibeFlow IDE                          │
├─────────────────┬─────────────────────┬──────────────────────┤
│   Terminal      │      Browser        │    iOS Simulator     │
│   (xterm.js)    │  (WebContentsView)  │   (xcrun simctl)     │
└────────┬────────┴──────────┬──────────┴──────────┬───────────┘
         │                   │                     │
         └───────────────────┼─────────────────────┘
                             │
               ┌─────────────▼─────────────┐
               │     MCP Bridge (TCP)      │
               └─────────────▬─────────────┘
                             │
               ┌─────────────▼─────────────┐
               │     MCP Server (stdio)    │
               └─────────────▬─────────────┘
                             │
                     Claude Code CLI
```

## Development

```bash
# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- Electron 30
- React 18 + TypeScript
- xterm.js + node-pty
- react-resizable-panels
- @modelcontextprotocol/sdk
