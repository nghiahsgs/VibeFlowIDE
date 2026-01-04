# VibeFlow IDE - MVP Implementation Plan

**Created:** 2026-01-04 | **Status:** Planning → Implementation
**Goal:** Electron app với Terminal + Browser + MCP Server để Claude Code điều khiển browser

---

## Overview

VibeFlow IDE là AI-Native IDE kết hợp:
- **Terminal** (xterm.js + node-pty) - Chạy Claude Code
- **Browser** (WebContentsView) - Embedded Chrome với DevTools
- **MCP Server** - Bridge để Claude điều khiển browser

---

## Phases

| Phase | Name | Status | Progress | Link |
|-------|------|--------|----------|------|
| 01 | Project Setup | ✅ Done | 100% | [phase-01-project-setup.md](./phase-01-project-setup.md) |
| 02 | Terminal Component | ✅ Done | 100% | [phase-02-terminal-component.md](./phase-02-terminal-component.md) |
| 03 | Browser Component | ✅ Done | 100% | [phase-03-browser-component.md](./phase-03-browser-component.md) |
| 04 | MCP Server | ✅ Done | 100% | [phase-04-mcp-server.md](./phase-04-mcp-server.md) |
| 05 | Integration & Testing | ✅ Done | 100% | [phase-05-integration-testing.md](./phase-05-integration-testing.md) |

---

## Tech Stack

```
├── Electron 30.x (WebContentsView, not deprecated BrowserView)
├── React 18 + TypeScript 5.3
├── xterm.js 5.3 + node-pty 0.11
├── react-resizable-panels 2.0
├── @modelcontextprotocol/sdk (MCP Server)
├── Playwright (Browser automation via CDP)
└── Vite (bundler for renderer)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    VibeFlow IDE                     │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │    Terminal     │  │        Browser           │  │
│  │   (xterm.js)    │  │   (WebContentsView)      │  │
│  │                 │  │                          │  │
│  │ $ claude code   │  │  ┌──────────────────┐    │  │
│  │ > navigate to.. │  │  │   localhost:3000 │    │  │
│  │ > click button  │  │  │   [Your App]     │    │  │
│  │                 │  │  └──────────────────┘    │  │
│  └────────┬────────┘  └───────────┬──────────────┘  │
│           │                       │                 │
│           │    ┌──────────────────┤                 │
│           │    │                  │                 │
│  ┌────────▼────▼──────────────────▼──────────────┐  │
│  │              MCP Server (stdio)               │  │
│  │  Tools: screenshot, click, getDOM, navigate  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
              Claude Code CLI (external)
```

---

## Success Criteria

1. App mở được với split view Terminal | Browser
2. Terminal chạy được shell commands (zsh/bash)
3. Browser load được URL và có thể mở DevTools
4. Claude Code trong terminal có thể:
   - Screenshot browser
   - Click element by selector
   - Get page content
   - Navigate to URL

---

## Research Reports

- [Electron + xterm.js Research](../reports/260104-electron-xterm-research.md)
- [MCP Browser Control Research](../reports/260104-mcp-browser-control-research.md)

---

## Next Steps

1. ✅ Research complete
2. ✅ Create phase detail files
3. ✅ All phases implemented
4. ⏳ Configure Claude Code MCP integration
5. ⏳ Test with real Claude Code commands
