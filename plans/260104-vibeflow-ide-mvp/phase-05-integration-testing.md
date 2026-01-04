# Phase 05: Integration & Testing

**Status:** ⏳ Pending | **Priority:** High

---

## Context

Final integration và E2E testing để đảm bảo tất cả components hoạt động cùng nhau.

**Related:** [plan.md](./plan.md)

---

## Overview

- Split view layout (Terminal | Browser)
- Full integration test
- Polish UI/UX
- Documentation

---

## Implementation Steps

### 1. Main App Layout
```tsx
// src/renderer/App.tsx
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { TerminalComponent } from './components/Terminal';
import { BrowserToolbar } from './components/BrowserToolbar';
import './styles/app.css';

export function App() {
  return (
    <div className="app">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={50} minSize={20}>
          <div className="terminal-panel">
            <div className="panel-header">Terminal</div>
            <TerminalComponent />
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={50} minSize={20}>
          <div className="browser-panel">
            <BrowserToolbar />
            {/* WebContentsView rendered by main process */}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

### 2. Styles
```css
/* src/renderer/styles/app.css */
:root {
  --bg-dark: #1e1e1e;
  --bg-panel: #252526;
  --border: #3c3c3c;
  --text: #cccccc;
  --accent: #007acc;
}

html, body, #root, .app {
  height: 100%;
  margin: 0;
  background: var(--bg-dark);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
}

.terminal-panel, .browser-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 8px 12px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 500;
}

.resize-handle {
  width: 4px;
  background: var(--border);
  cursor: col-resize;
}

.resize-handle:hover {
  background: var(--accent);
}

.browser-toolbar {
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}

.browser-toolbar button {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  border-radius: 4px;
}

.browser-toolbar button:hover {
  background: var(--border);
}

.browser-toolbar input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 4px;
}
```

---

## Testing Scenarios

### 1. Basic Functionality
- [ ] App launches without errors
- [ ] Terminal spawns shell correctly
- [ ] Can type commands in terminal
- [ ] Browser loads default URL
- [ ] Can navigate to different URLs
- [ ] DevTools opens

### 2. Resize & Layout
- [ ] Split panels resize smoothly
- [ ] Terminal adapts to new size
- [ ] Browser adapts to new size
- [ ] Min size constraints work

### 3. MCP Integration
- [ ] MCP server starts with app
- [ ] Claude Code connects to MCP
- [ ] Run in terminal: `claude "Take a screenshot of the browser"`
- [ ] Run: `claude "Click the login button"`
- [ ] Run: `claude "Navigate to google.com"`
- [ ] Run: `claude "Get the page title"`

### 4. Error Handling
- [ ] Invalid URL shows error
- [ ] Invalid selector returns error message
- [ ] Network errors handled
- [ ] MCP server reconnects on failure

---

## Todo List

- [ ] Implement main layout with react-resizable-panels
- [ ] Add styling
- [ ] Wire up all components
- [ ] Manual testing of all scenarios
- [ ] Add error boundaries
- [ ] Polish UI

---

## Success Criteria

- All test scenarios pass
- Claude Code can successfully control browser
- No crashes or memory leaks
- Responsive UI

---

## Demo Script

```bash
# 1. Start VibeFlow IDE
npm run dev

# 2. In terminal panel, run:
cd ~/my-project
npm run dev  # Start a web app at localhost:3000

# 3. Browser should show localhost:3000

# 4. Open another terminal tab and run:
claude "screenshot the browser and describe what you see"

# 5. Claude should return description of the page

# 6. Ask Claude to interact:
claude "Click the 'Sign Up' button on the page"

# 7. Claude should click and confirm
```
