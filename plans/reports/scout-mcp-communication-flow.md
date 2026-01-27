# VibeFlow IDE: MCP Communication Architecture Analysis

**Date:** 2026-01-26  
**Scope:** Understanding MCP message flow, injection points, and configuration system

---

## Summary

VibeFlow IDE uses a **TCP bridge architecture** to communicate between Claude Code (via MCP server) and the Electron app. Messages flow through a newline-delimited JSON protocol with request/response pairing. **No existing settings/config system** exists for runtime behavior modification.

---

## Architecture Overview

```
Claude Code (MCP Client)
    ↓ (stdio)
MCP Server Process (src/mcp-server/index.ts)
    ↓ (TCP to 127.0.0.1:9876)
MCP Bridge (src/main/mcp-bridge.ts)
    ↓ (Native calls)
BrowserManager / SimulatorManager (src/main/)
    ↓
Browser WebContentsView / iOS Simulator
```

---

## Key Files & Their Roles

### 1. **src/mcp-server/index.ts** (634 lines)
**Role:** MCP Server entry point - handles Claude Code communication

**Key Components:**
- **ElectronBridge class:** TCP client connecting to MCP Bridge
  - Connects to port from `~/.vibeflow-instances.json`
  - Uses request/response pattern with JSON-line protocol
  - Message format: `{ id: "req_1", cmd: "screenshot", args: {...} }\n`
  - 30-second timeout per command
  
- **Tool Definitions:** Lines 84-537
  - `browserTools[]` (33 tools): screenshot, click, navigate, etc.
  - `simulatorTools[]` (8 tools): simulator control
  - All tools defined with descriptions + input schemas

- **CallToolRequestSchema Handler:** Lines 661-1053
  - Maps MCP tool calls to `bridge.sendCommand()` calls
  - Converts results to MCP-compatible responses (image/text)
  - Example: `browser_click` → `bridge.sendCommand('click', {...})`

**Message Flow (Incoming):**
```
Claude: "use browser_click tool with selector='button'"
  ↓
MCP Server receives: CallToolRequest
  ↓
Extracts tool name & args
  ↓
Calls: ElectronBridge.sendCommand('click', { selector: 'button' })
  ↓
Sends JSON: { id: 'req_123', cmd: 'click', args: { selector: 'button' } }
  ↓
Waits for response on socket
```

### 2. **src/main/mcp-bridge.ts** (548 lines)
**Role:** Local TCP server - bridges MCP requests to Electron managers

**Key Components:**
- **MCPBridge class:** TCP server on port 9876 (configurable fallback)
  - Listens for MCP server connections
  - Parses newline-delimited JSON commands
  - Routes to appropriate handler

- **handleCommand() method:** Lines 146-459
  - Command routing switch statement
  - Delegates to `BrowserManager` or `SimulatorManager`
  - Returns `MCPResponse: { id, success, data, error }`

**Message Flow (Processing):**
```
MCP Server sends JSON: { id: 'req_123', cmd: 'click', args: {...} }
  ↓
MCPBridge receives on socket
  ↓
Parses JSON line
  ↓
Calls: handleCommand(command)
  ↓
Switch on command.cmd case 'click'
  ↓
Delegates: this.browser.click(selector)
  ↓
Returns: { id: 'req_123', success: true, data: 'Clicked' }
  ↓
Sends back to MCP Server
```

**Command Categories:**
1. Browser commands: `screenshot`, `click`, `navigate`, `getDOM`, etc.
2. Device emulation: `setDeviceMode`, `getDeviceMode`
3. Simulator commands: `simulator:screenshot`, `simulator:tap`, etc.

### 3. **src/main/browser-manager.ts** (800+ lines)
**Role:** Manages WebContentsView - actual browser automation

**Key Methods:**
- `click(selector)`, `navigate(url)`, `typeText(selector, text)`
- `evaluateJS(code)` - JavaScript execution in page context
- `screenshot()` - Returns base64 image
- `getDOM(selector)` - Gets HTML content
- `getConsoleLogs()` - Returns captured logs

**Note:** No direct settings for command behavior here - all commands execute immediately with default behavior.

### 4. **src/main/index.ts** (323 lines)
**Role:** Electron main process - initializes all managers

**Initialization:**
```typescript
ptyManager = new PtyManager();
browserManager = new BrowserManager(mainWindow);  // Line 57
simulatorManager = new SimulatorManager(mainWindow);
mcpBridge = new MCPBridge(browserManager, simulatorManager);  // Line 59
```

**IPC Handlers:** Terminal, Browser, Network, Ports, Simulator (lines 96-241)
- Direct communication with renderer process
- **Not involved in MCP communication** (that's TCP via MCPBridge)

---

## Message Structure

### MCP Server → MCP Bridge (TCP)

**Request (outgoing to Electron):**
```json
{
  "id": "req_1",
  "cmd": "screenshot",
  "args": {}
}
```

**Response (incoming from Electron):**
```json
{
  "id": "req_1",
  "success": true,
  "data": {
    "data": "base64imagestring...",
    "mimeType": "image/png"
  }
}
```

### MCP Protocol (Claude ↔ MCP Server)

**Claude's Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "browser_click",
    "arguments": {
      "selector": "button.submit"
    }
  }
}
```

**MCP Server's Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Clicked"
    }
  ]
}
```

---

## Current Configuration System: NONE

**Findings:**
- No `config.ts`, `settings.ts`, or similar files exist
- No localStorage, userData, or settings DB
- No environment variables for behavior control
- All settings are hardcoded:
  - MCP port: `9876` (src/mcp-bridge.ts:12)
  - Command timeout: `30000ms` (src/mcp-server/index.ts:619)
  - Max logs: `100` (src/main/browser-manager.ts:143)
  - Device presets: hardcoded in DEVICE_PRESETS (src/main/browser-manager.ts:25-74)

---

## System Prompt Injection Points

### Option 1: **MCP Server Level** (Best for Claude behavior)
**File:** `/src/mcp-server/index.ts`

Currently: Tool definitions only have description + input schema (lines 84-432)

**Proposed Change:**
Add system prompt to tool descriptions:
```typescript
const browserTools: Tool[] = [
  {
    name: 'browser_screenshot',
    description: `Take a screenshot...
    
SYSTEM INSTRUCTIONS FOR CLAUDE:
- Always describe UI elements found in screenshot
- Focus on interactive elements (buttons, inputs, links)
- Flag any error states or warnings
- Use browser_annotate for faster element identification`,
    ...
  },
  ...
];
```

**Pros:**
- Claude sees prompt every time tool list is requested
- Specific to tool behavior
- Easy to modify without restarting

**Cons:**
- Only affects tool descriptions, not Claude's reasoning
- Gets verbose in MCP responses

### Option 2: **MCP Bridge Level** (Control command execution)
**File:** `/src/main/mcp-bridge.ts`

**Proposed Change:**
Add settings object before handleCommand:
```typescript
interface CommandSettings {
  captureMetadata: boolean;
  validateSelectors: boolean;
  logAllCommands: boolean;
  customHeaders?: Record<string, string>;
}

private settings: CommandSettings = {
  captureMetadata: true,
  validateSelectors: true,
  logAllCommands: false
};

async handleCommand(command: MCPCommand): Promise<MCPResponse> {
  if (this.settings.logAllCommands) {
    console.log(`[MCP] Command: ${command.cmd}`, command.args);
  }
  // ... rest of logic
}
```

**Pros:**
- Controls Electron-side behavior
- Can enable debugging/logging
- Affects all clients using this bridge

**Cons:**
- Requires Electron restart to change
- Electron-only, doesn't affect Claude directly

### Option 3: **Browser Manager Level** (Fine-grained control)
**File:** `/src/main/browser-manager.ts`

**Current:** Methods execute with no options
```typescript
async click(selector: string): Promise<boolean> {
  // Just clicks - no control
}
```

**Proposed Change:**
```typescript
interface ActionOptions {
  validateElement?: boolean;
  takeScreenshotAfter?: boolean;
  customInstructions?: string;
}

async click(selector: string, options?: ActionOptions): Promise<{
  success: boolean;
  data: string;
  metadata?: {
    elementType: string;
    clickedText: string;
    screenAfter?: string;
  }
}> {
  // Execute with metadata
}
```

**Pros:**
- Most control over execution
- Per-command options
- Can pass through MCP args

**Cons:**
- Requires updating all MCP command handlers
- More complex MCP protocol changes

---

## Recommended Approach: Hybrid

1. **Option 1** (Tool descriptions): Immediate, easy, affects Claude's understanding
2. **Option 3** (Browser Manager options): Pass through MCP args for per-command control
3. Create **settings module** for persistent configuration

---

## Implementation Roadmap

### Phase 1: Settings Infrastructure
**Create:** `/src/main/settings.ts`
```typescript
export interface AppSettings {
  mcp: {
    enableDebugLogging: boolean;
    commandTimeout: number;
  };
  browser: {
    captureMetadata: boolean;
    validateBeforeClick: boolean;
  };
}

export class SettingsManager {
  private settings: AppSettings;
  constructor() { /* load from file */ }
  get(key: string) { /* nested get */ }
  set(key: string, value: any) { /* persist */ }
}
```

### Phase 2: MCP Bridge Integration
Update MCPBridge to accept settings:
```typescript
constructor(browser, simulator, settings?: SettingsManager) {
  this.settings = settings || new SettingsManager();
}

// Use in handleCommand for logging, validation, etc.
```

### Phase 3: Tool Metadata
Add system prompt to tool definitions with injection control.

---

## Current Files Involved (Execution Path)

| File | Role | Lines | Key Classes |
|------|------|-------|-------------|
| src/mcp-server/index.ts | MCP Server | 1062 | ElectronBridge, Tool definitions |
| src/main/mcp-bridge.ts | TCP Bridge | 548 | MCPBridge, handleCommand |
| src/main/browser-manager.ts | Browser Control | 800+ | BrowserManager, DEVICE_PRESETS |
| src/main/index.ts | Electron Init | 323 | IPC setup (Terminal, Browser, etc.) |
| src/renderer/types/global.d.ts | Type Defs | 128 | API interfaces |
| src/renderer/components/mcp-panel.tsx | UI Config Display | 86 | Static config reference |

---

## Critical Gaps (No Current Mechanism For)

1. **Runtime Settings** - No way to change behavior without restart
2. **System Prompts** - Claude has no injected instructions
3. **Debugging** - No logging toggle for MCP commands
4. **Metadata Collection** - Commands return minimal data
5. **Validation** - No pre-execution checks or post-execution assertions
6. **Custom Headers** - No way to add browser/HTTP customization

---

## Next Steps

To implement system prompt injection:

1. **Choose injection point:** MCP tool descriptions (easiest) or Browser Manager (most flexible)
2. **Create settings module:** For persistent configuration
3. **Update handleCommand:** To respect settings
4. **Test MCP flow:** Verify messages pass through correctly
5. **Document for Claude:** Add usage instructions to MCP panel

**Unresolved Questions:**
- Should settings be per-project or global?
- Should Claude be able to modify settings via MCP tool?
- How to handle settings persistence across sessions?
