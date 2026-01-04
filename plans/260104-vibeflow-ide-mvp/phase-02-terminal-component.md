# Phase 02: Terminal Component

**Status:** ⏳ Pending | **Priority:** High

---

## Context

Implement xterm.js terminal với node-pty backend giống VS Code/Hyper.

**Related:** [plan.md](./plan.md) | [Phase 01](./phase-01-project-setup.md)

---

## Overview

- xterm.js renders terminal UI
- node-pty spawns real shell (zsh/bash)
- IPC bridge giữa main/renderer process
- Resize handling

---

## Requirements

- [ ] Render xterm.js trong React component
- [ ] Spawn shell via node-pty (main process)
- [ ] Bi-directional data flow via IPC
- [ ] Terminal resize handling
- [ ] Basic styling (dark theme)

---

## Architecture

```
Renderer Process          Main Process
┌──────────────┐         ┌──────────────┐
│  TerminalUI  │◄───────►│  PtyManager  │
│  (xterm.js)  │   IPC   │  (node-pty)  │
└──────────────┘         └──────────────┘
       │                        │
       ▼                        ▼
   User input             Shell output
```

---

## Implementation Steps

### 1. Main process: PtyManager
```typescript
// src/main/pty-manager.ts
import { spawn, IPty } from 'node-pty';
import os from 'os';

export class PtyManager {
  private pty: IPty | null = null;

  create(onData: (data: string) => void) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'zsh';
    this.pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    });

    this.pty.onData(onData);
  }

  write(data: string) {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number) {
    this.pty?.resize(cols, rows);
  }

  kill() {
    this.pty?.kill();
  }
}
```

### 2. IPC handlers
```typescript
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { PtyManager } from './pty-manager';

export function setupTerminalIPC(mainWindow: BrowserWindow) {
  const pty = new PtyManager();

  ipcMain.on('terminal:create', () => {
    pty.create((data) => {
      mainWindow.webContents.send('terminal:data', data);
    });
  });

  ipcMain.on('terminal:write', (_, data: string) => {
    pty.write(data);
  });

  ipcMain.on('terminal:resize', (_, { cols, rows }) => {
    pty.resize(cols, rows);
  });
}
```

### 3. Preload script
```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('terminal', {
  create: () => ipcRenderer.send('terminal:create'),
  write: (data: string) => ipcRenderer.send('terminal:write', data),
  resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', { cols, rows }),
  onData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal:data', (_, data) => callback(data));
  }
});
```

### 4. React Terminal component
```tsx
// src/renderer/components/Terminal.tsx
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function TerminalComponent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#1e1e1e' }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    window.terminal.create();
    window.terminal.onData((data) => term.write(data));
    term.onData((data) => window.terminal.write(data));

    termRef.current = term;

    return () => term.dispose();
  }, []);

  return <div ref={containerRef} style={{ height: '100%' }} />;
}
```

---

## Todo List

- [ ] Create PtyManager class
- [ ] Setup IPC handlers
- [ ] Write preload script
- [ ] Create Terminal React component
- [ ] Add xterm-addon-fit for resize
- [ ] Style terminal (dark theme)
- [ ] Test with Claude Code CLI

---

## Success Criteria

- Terminal renders in app
- Can type commands and see output
- `claude` command works
- Resize handled properly

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| node-pty crash | High | Error handling, restart logic |
| UTF-8 issues | Medium | Set LANG env var |
| Performance on large output | Low | Use xterm GPU renderer |
