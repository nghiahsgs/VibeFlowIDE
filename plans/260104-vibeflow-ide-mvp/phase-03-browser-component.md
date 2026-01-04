# Phase 03: Browser Component

**Status:** ⏳ Pending | **Priority:** High

---

## Context

Implement embedded browser với WebContentsView (không dùng deprecated BrowserView).

**Related:** [plan.md](./plan.md) | [Phase 02](./phase-02-terminal-component.md)

---

## Overview

- WebContentsView để embed Chromium
- URL bar + navigation controls
- DevTools toggle
- IPC để control từ main process

---

## Requirements

- [ ] Embed WebContentsView trong app
- [ ] URL bar với navigate
- [ ] Back/Forward/Refresh buttons
- [ ] DevTools toggle (F12 hoặc button)
- [ ] Expose webContents cho MCP server

---

## Architecture

```
┌─────────────────────────────────────┐
│         Browser Container           │
├─────────────────────────────────────┤
│ [←] [→] [↻] [ URL bar         ] [🔧]│
├─────────────────────────────────────┤
│                                     │
│         WebContentsView             │
│         (embedded page)             │
│                                     │
└─────────────────────────────────────┘
```

---

## Implementation Steps

### 1. Main process: BrowserManager
```typescript
// src/main/browser-manager.ts
import { WebContentsView, BrowserWindow } from 'electron';

export class BrowserManager {
  private view: WebContentsView | null = null;

  create(parentWindow: BrowserWindow) {
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true
      }
    });

    parentWindow.contentView.addChildView(this.view);
    this.updateBounds(parentWindow);

    // Default page
    this.view.webContents.loadURL('https://localhost:3000');
  }

  updateBounds(parentWindow: BrowserWindow) {
    const { width, height } = parentWindow.getBounds();
    // Right half of window (after terminal)
    this.view?.setBounds({
      x: width / 2,
      y: 40, // Leave space for toolbar
      width: width / 2,
      height: height - 40
    });
  }

  navigate(url: string) {
    this.view?.webContents.loadURL(url);
  }

  goBack() {
    if (this.view?.webContents.canGoBack()) {
      this.view.webContents.goBack();
    }
  }

  goForward() {
    if (this.view?.webContents.canGoForward()) {
      this.view.webContents.goForward();
    }
  }

  reload() {
    this.view?.webContents.reload();
  }

  openDevTools() {
    this.view?.webContents.openDevTools({ mode: 'detach' });
  }

  getWebContents() {
    return this.view?.webContents;
  }
}
```

### 2. IPC for browser control
```typescript
// src/main/ipc-handlers.ts (add to existing)
export function setupBrowserIPC(browserManager: BrowserManager) {
  ipcMain.on('browser:navigate', (_, url: string) => {
    browserManager.navigate(url);
  });

  ipcMain.on('browser:back', () => browserManager.goBack());
  ipcMain.on('browser:forward', () => browserManager.goForward());
  ipcMain.on('browser:reload', () => browserManager.reload());
  ipcMain.on('browser:devtools', () => browserManager.openDevTools());

  ipcMain.handle('browser:url', () => {
    return browserManager.getWebContents()?.getURL();
  });
}
```

### 3. Preload additions
```typescript
// Add to preload.ts
contextBridge.exposeInMainWorld('browser', {
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  back: () => ipcRenderer.send('browser:back'),
  forward: () => ipcRenderer.send('browser:forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  openDevTools: () => ipcRenderer.send('browser:devtools'),
  getURL: () => ipcRenderer.invoke('browser:url'),
  onNavigate: (cb: (url: string) => void) => {
    ipcRenderer.on('browser:navigated', (_, url) => cb(url));
  }
});
```

### 4. React Browser Toolbar
```tsx
// src/renderer/components/BrowserToolbar.tsx
import { useState } from 'react';

export function BrowserToolbar() {
  const [url, setUrl] = useState('http://localhost:3000');

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    window.browser.navigate(url);
  };

  return (
    <div className="browser-toolbar">
      <button onClick={() => window.browser.back()}>←</button>
      <button onClick={() => window.browser.forward()}>→</button>
      <button onClick={() => window.browser.reload()}>↻</button>
      <form onSubmit={handleNavigate} style={{ flex: 1 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL..."
        />
      </form>
      <button onClick={() => window.browser.openDevTools()}>🔧</button>
    </div>
  );
}
```

---

## Todo List

- [ ] Create BrowserManager class
- [ ] Setup WebContentsView with proper bounds
- [ ] IPC handlers for navigation
- [ ] Browser toolbar component
- [ ] DevTools integration
- [ ] Handle resize events
- [ ] Sync URL bar với navigation

---

## Success Criteria

- Browser embedded in app
- Can navigate to any URL
- DevTools opens (detached)
- Back/Forward/Reload work
- Resize handled

---

## Security Considerations

- sandbox: true
- contextIsolation: true
- Consider CSP for embedded content
