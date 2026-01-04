# Research Report: Electron App with xterm.js, BrowserView & Split View

**Research Date:** 2026-01-04
**Scope:** Electron 28-30, TypeScript + React, 2024-2025 best practices

---

## Executive Summary

Building production Electron terminals requires three key components: xterm.js for rendering, node-pty for shell spawning, and a split-pane library for layout. Major shift in 2024: **BrowserView deprecated (Electron 30), replaced by WebContentsView**. xterm.js used by VS Code & Hyper provides proven foundation. For split views, react-resizable-panels offers best TypeScript support; build custom if <100 lines needed for control.

---

## Key Findings

### 1. xterm.js Integration (Electron Direct Method)
- **Recommended packages:** `xterm@5.x`, `node-pty@0.11.x`, `@electron/rebuild`
- **Architecture:** No Socket.io needed in Electron—node-pty runs directly in renderer (Electron allows native modules)
- **Setup:** Install node-pty → run `electron-rebuild` to compile native bindings → initialize PTY in renderer process
- **Platform handling:** Use `os.platform()` to select shell (`powershell.exe` Windows, `bash` Unix)
- **Performance:** xterm.js uses 4-layer canvas rendering (text/selection/link/cursor), only repaints deltas

### 2. BrowserView → WebContentsView Migration
- **Status:** BrowserView deprecated since Electron 30 (Spring 2024), removed in future versions
- **Migration:** Constructor/webPreferences same as BrowserView; drop-in replacement
- **Key methods preserved:** `webContents`, `setBounds()`, `getBounds()`, `setBackgroundColor()`
- **Why change:** Aligns with Chromium Views API, reduces bugs, simplifies future upgrades
- **Alternative:** Use `<iframe>` or avoid embedded content by design

### 3. Split View Pane Options
| Library | Size | TypeScript | Best For |
|---------|------|-----------|----------|
| **react-resizable-panels** | ~10KB | ✓ Full | Professional apps, nested layouts |
| **allotment** | ~5KB | ✓ Full | VS Code–like split views, snapping |
| **react-split-pane** | ~3KB | ✗ Partial | Simple 2-pane layouts |
| **Custom (scratch)** | <150 lines | ✓ Optional | Maximum control, learning |

**Recommended:** react-resizable-panels for TypeScript projects; allotment for VS Code parity.

---

## Implementation Patterns

### xterm.js + node-pty Initialization
```typescript
import { Terminal } from 'xterm';
import { spawn } from 'node-pty';
import os from 'os';

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
const ptyProcess = spawn(shell, [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
});

const term = new Terminal();
ptyProcess.onData((data) => term.write(data));
term.onData((data) => ptyProcess.write(data));
```

### react-resizable-panels Split Layout
```tsx
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

export const SplitView = () => (
  <PanelGroup direction="horizontal">
    <Panel minSize={20} defaultSize={50}>
      <Editor />
    </Panel>
    <PanelResizeHandle />
    <Panel minSize={20}>
      <Terminal />
    </Panel>
  </PanelGroup>
);
```

### WebContentsView for Embedded Content
```typescript
const view = new WebContentsView({
  webPreferences: {
    preload: preloadPath,
    sandbox: true,
  },
});

mainWindow.contentView.addChildView(view);
view.setBounds({ x: 0, y: 0, width: 400, height: 300 });
view.webContents.loadURL('https://example.com');
```

---

## Gotchas & Tips

1. **node-pty native module:** Must run `electron-rebuild` after install, or it won't load. Some CI environments may fail—pin versions
2. **Terminal encoding:** Set `LANG=en_US.UTF-8` before spawning pty; xterm.js has excellent Unicode/emoji/CJK support but input must be UTF-8
3. **Memory in large terminals:** xterm.js GPU renderer on by default—disable with `Terminal({ gpu: false })` if low-end hardware
4. **IPC overhead:** If moving terminal data through IPC, batch writes or use SharedArrayBuffer; direct renderer access is faster
5. **BrowserView gotcha:** Old code checking `browserView instanceof BrowserView` breaks with WebContentsView—use duck typing on `webContents`
6. **Split pane resize:** Allotment has `snap` prop for snapping behavior; react-resizable-panels use `collapsible` + min/max sizes
7. **Electron versions:** 28+ stable; 29+ recommended for WebContentsView support; 30+ for BrowserView deprecation warnings

---

## Recommended Tech Stack

```json
{
  "dependencies": {
    "electron": "^30.0.0",
    "xterm": "^5.3.0",
    "node-pty": "^0.11.3",
    "react-resizable-panels": "^2.0.0",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Resources

- [xterm.js Official Docs](https://xtermjs.org/)
- [GitHub xterm.js](https://github.com/xtermjs/xterm.js)
- [Electron WebContentsView Migration](https://www.electronjs.org/blog/migrate-to-webcontentsview)
- [Browser-based Terminals with Electron & xterm.js](https://www.opcito.com/blogs/browser-based-terminals-with-xtermjs-and-electronjs)
- [react-resizable-panels](https://www.npmjs.com/package/react-resizable-panels)
- [Allotment React Component](https://github.com/johnwalley/allotment)
- [How VS Code Implemented Fast Terminals](https://weihanglo.tw/posts/2017/how-is-new-terminal-in-vs-code-so-fast/)

---

## Unresolved Questions

1. Performance impact of WebContentsView vs BrowserView in large-scale apps (no benchmark data found)
2. Optimal memory tuning for 1000+ line terminal buffers in resource-constrained environments
3. Hardware acceleration behavior of xterm.js across different GPU architectures
