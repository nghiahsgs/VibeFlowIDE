# MCP Communication Quick Reference

## Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ CLAUDE CODE (claude.ai/code)                                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ "Use browser_click tool"
                               ↓
┌──────────────────────────────────────────────────────────────────┐
│ MCP PROTOCOL (stdio)                                             │
│ {jsonrpc: "2.0", method: "tools/call", params: {...}}           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ↓
    ┌─────────────────────────────────────────────────┐
    │ MCP SERVER PROCESS                              │
    │ (src/mcp-server/index.ts)                       │
    │                                                 │
    │ ElectronBridge class:                           │
    │ - Manages TCP connection to port 9876           │
    │ - Sends: {"id":"req_1","cmd":"click",...}      │
    │ - Receives: {"id":"req_1","success":true,...}  │
    └────────────┬────────────────────────────────────┘
                 │ (TCP connection to 127.0.0.1:9876)
                 ↓
    ┌──────────────────────────────────────────────────┐
    │ MCP BRIDGE (src/main/mcp-bridge.ts)              │
    │                                                  │
    │ TCPServer listening on 9876                      │
    │ handleCommand() routes by cmd:                   │
    │  - case 'click': → browser.click(selector)       │
    │  - case 'screenshot': → browser.screenshot()     │
    │  - case 'simulator:tap': → simulator.tap(x, y)   │
    │                                                  │
    │ Returns: {"id":"req_1","success":true,"data":{}} │
    └────────────┬───────────────────────────────────┘
                 │ (calls)
                 ↓
    ┌──────────────────────────────────────────────────┐
    │ BROWSER/SIMULATOR MANAGERS (src/main/)           │
    │                                                  │
    │ BrowserManager - WebContentsView automation      │
    │ SimulatorManager - iOS simulator control         │
    └────────────┬───────────────────────────────────┘
                 │
                 ↓
    ┌──────────────────────────────────────────────────┐
    │ ACTUAL BROWSER / iOS SIMULATOR                   │
    │                                                  │
    │ Renders pages | Captures screenshots             │
    │ Performs clicks | Executes JavaScript            │
    └──────────────────────────────────────────────────┘
```

---

## Key Injection Points for System Prompts

### 1. IMMEDIATE (No restart needed)
**Location:** `src/mcp-server/index.ts` lines 84-432  
**Method:** Add instructions to tool descriptions  
**Example:**
```typescript
{
  name: 'browser_screenshot',
  description: 'Take screenshot. [SYSTEM: Always identify 3+ UI elements and their purposes]',
  ...
}
```
**Access:** Claude sees this every time MCP lists tools  
**Scope:** Tool-level instructions only

---

### 2. FLEXIBLE (Per-command control)
**Location:** `src/main/browser-manager.ts`  
**Method:** Add options parameter to methods  
**Example:**
```typescript
// Before:
async click(selector: string): Promise<boolean>

// After:
async click(selector: string, options?: {
  metadata?: boolean,
  validate?: boolean
}): Promise<{success, data, metadata?}>
```
**Impact:** Requires rebuilding, more control

---

### 3. PERSISTENT (Survives restart)
**Location:** NEW FILE `src/main/settings.ts`  
**Method:** Load from JSON file on startup  
**Example:**
```typescript
// ~/.vibeflow-settings.json
{
  "mcp": {
    "enableLogging": true,
    "systemPrompt": "Always validate selectors before clicking"
  }
}
```

---

## Message Format Reference

### TCP Messages (MCP Bridge Protocol)

**Request (MCP Server → Bridge):**
```json
{
  "id": "req_123",
  "cmd": "click",
  "args": {
    "selector": "button.submit"
  }
}
```

**Response (Bridge → MCP Server):**
```json
{
  "id": "req_123",
  "success": true,
  "data": "Clicked"
}
```

**Error Response:**
```json
{
  "id": "req_123",
  "success": false,
  "error": "Element not found: button.submit"
}
```

---

## Command Routing in MCPBridge.handleCommand()

```
switch (cmd) {
  // Browser commands
  case 'screenshot':      → browser.screenshot()
  case 'click':          → browser.click(selector)
  case 'navigate':       → browser.navigate(url)
  case 'typeText':       → browser.typeText(selector, text)
  case 'getDOM':         → browser.getDOM(selector)
  case 'evaluateJS':     → browser.evaluateJS(code)
  case 'getConsoleLogs': → browser.getConsoleLogs()
  
  // Device emulation
  case 'setDeviceMode':  → browser.setDeviceMode(deviceId)
  case 'getDeviceMode':  → browser.getDeviceMode()
  
  // Simulator commands
  case 'simulator:screenshot':  → simulator.screenshot()
  case 'simulator:tap':         → simulator.tap(x, y)
  case 'simulator:launchApp':   → simulator.launchApp(bundleId)
  case 'simulator:openUrl':     → simulator.openUrl(url)
  
  default: → return error
}
```

---

## Files by Responsibility

```
REQUEST PROCESSING:
  src/mcp-server/index.ts (1062 lines)
  └─ Receives from Claude Code via stdio
  └─ ElectronBridge class → TCP to port 9876

TCP BRIDGING:
  src/main/mcp-bridge.ts (548 lines)
  └─ Listens on 127.0.0.1:9876
  └─ Parses JSON-line messages
  └─ Routes to managers via handleCommand()

EXECUTION:
  src/main/browser-manager.ts (800+ lines)
  src/main/simulator-manager.ts (TBD)
  └─ Actual browser/simulator automation
  └─ No settings/config yet

INITIALIZATION:
  src/main/index.ts (323 lines)
  └─ Creates MCPBridge, BrowserManager, etc.
  └─ Registers IPC handlers (not MCP)

TYPE DEFINITIONS:
  src/renderer/types/global.d.ts
  └─ API interfaces for preload bridge
```

---

## Current Hardcoded Constants

| Setting | Value | File | Line |
|---------|-------|------|------|
| MCP Port | 9876 | mcp-bridge.ts | 12 |
| Command Timeout | 30000ms | mcp-server/index.ts | 619 |
| Max Console Logs | 100 | browser-manager.ts | 143 |
| Socket Timeout | 30000ms | mcp-bridge.ts | 84 |
| Device Presets | 6 devices | browser-manager.ts | 25-74 |
| Chrome User-Agent | Hardcoded string | browser-manager.ts | 101-102 |

---

## Integration Points for Settings

1. **MCPBridge constructor** - Accept settings manager
2. **handleCommand()** - Check settings for logging/validation
3. **Tool descriptions** - Include instructions from settings
4. **Error responses** - Include metadata when enabled

**Example Usage:**
```typescript
// In mcp-bridge.ts constructor:
constructor(browser, simulator, settings?: SettingsManager) {
  this.settings = settings || new SettingsManager();
}

// In handleCommand:
if (this.settings.get('debug.logCommands')) {
  console.log(`[MCP] ${cmd}`, args);
}

// In mcp-server/index.ts tool definitions:
description: `Tool description. ${getSystemPrompt()}`
```

---

## Next Implementation Phase

**Phase 1: Add Settings Module** (1-2 hours)
- Create src/main/settings.ts
- Load from ~/.vibeflow-settings.json
- Pass to MCPBridge

**Phase 2: MCP Bridge Integration** (1-2 hours)
- Update MCPBridge constructor
- Check settings in handleCommand
- Add logging when enabled

**Phase 3: Tool Descriptions** (30 min)
- Update tool definitions with system prompts
- Load from settings

**Phase 4: Testing** (1 hour)
- Test message flow with settings
- Verify Claude receives prompts
- Test all command types
