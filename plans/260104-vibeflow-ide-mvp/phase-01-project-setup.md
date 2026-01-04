# Phase 01: Project Setup

**Status:** ⏳ Pending | **Priority:** High

---

## Context

Setup Electron + React + TypeScript project với proper tooling cho native modules (node-pty).

**Related:** [plan.md](./plan.md) | [Electron Research](../reports/260104-electron-xterm-research.md)

---

## Overview

- Initialize Electron app với Vite
- Configure TypeScript + React
- Setup native module rebuild cho node-pty
- Create basic window với split layout

---

## Requirements

- [ ] Electron 30.x với WebContentsView support
- [ ] React 18 + TypeScript 5.3
- [ ] Vite bundler cho renderer process
- [ ] @electron/rebuild cho native modules
- [ ] ESLint + Prettier config

---

## Implementation Steps

### 1. Create project structure
```
vibeflow-ide/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts
│   │   └── preload.ts
│   ├── renderer/       # React renderer
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── components/
│   └── mcp-server/     # MCP server (separate process)
│       └── index.ts
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

### 2. Install dependencies
```bash
npm init -y
npm i electron electron-vite react react-dom xterm node-pty react-resizable-panels @modelcontextprotocol/sdk zod
npm i -D typescript @types/react @types/react-dom @electron/rebuild vite @vitejs/plugin-react
```

### 3. Configure electron-vite
```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
});
```

### 4. Create basic main process
```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile('dist/renderer/index.html');
  }
});
```

### 5. Setup electron-rebuild
```json
// package.json scripts
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "postinstall": "electron-rebuild"
  }
}
```

---

## Todo List

- [ ] Init project với electron-vite template
- [ ] Install all dependencies
- [ ] Configure TypeScript (main + renderer)
- [ ] Setup electron-rebuild
- [ ] Create basic window
- [ ] Verify app launches successfully

---

## Success Criteria

- `npm run dev` launches Electron window
- React app renders in renderer process
- DevTools accessible
- No native module errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| node-pty build fails | High | Use @electron/rebuild, pin versions |
| Version conflicts | Medium | Lock dependencies in package-lock.json |

---

## Security Considerations

- contextIsolation: true
- nodeIntegration: false
- Preload script for IPC bridge
