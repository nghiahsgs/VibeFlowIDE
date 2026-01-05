# Phase 1: Architecture & Setup

**Date:** 2026-01-04
**Status:** Pending
**Priority:** High
**Estimated:** 2 hours

## Context Links

- Research: `plans/reports/researcher-260104-ios-simulator-electron-integration.md`
- Main entry: `src/main/index.ts`
- Existing manager pattern: `src/main/browser-manager.ts`

## Overview

Establish architecture patterns, type definitions, and project setup for iOS Simulator integration. Define interfaces that will be used across main process, renderer, and MCP server.

## Key Insights

1. Follow existing manager pattern (BrowserManager, PtyManager)
2. Use same IPC pattern: renderer -> ipcMain -> manager -> result
3. MCP bridge pattern already established, extend it
4. TypeScript interfaces should be shared where possible

## Requirements

- [ ] Define simulator device types and states
- [ ] Define IPC channel names
- [ ] Define MCP command names
- [ ] Setup permission checking utilities
- [ ] Add simulator feature toggle (for non-macOS)

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (React)                                                     │
│  SimulatorPanel                                                      │
│   ├─ Device Picker (dropdown)                                        │
│   ├─ Screen Viewer (canvas/img)                                      │
│   └─ Controls (boot/shutdown/screenshot)                             │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ IPC (preload)
┌─────────────────────▼───────────────────────────────────────────────┐
│ Main Process                                                         │
│  SimulatorManager                                                    │
│   ├─ listDevices() -> xcrun simctl list --json                       │
│   ├─ bootDevice(udid) -> xcrun simctl boot                           │
│   ├─ shutdownDevice(udid) -> xcrun simctl shutdown                   │
│   ├─ screenshot() -> xcrun simctl io booted screenshot               │
│   ├─ startStreaming() -> desktopCapturer loop                        │
│   └─ tap(x,y) -> xcrun simctl io booted input tap                    │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ TCP (MCP Bridge)
┌─────────────────────▼───────────────────────────────────────────────┐
│ MCP Server                                                           │
│  Tools: simulator_screenshot, simulator_tap, simulator_launch_app    │
└─────────────────────────────────────────────────────────────────────┘
```

### Type Definitions

```typescript
// src/main/simulator-types.ts

export interface SimulatorDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Shutting Down' | 'Creating';
  isAvailable: boolean;
  deviceTypeIdentifier: string;
  runtime: string;
  runtimeVersion: string; // e.g., "17.2"
}

export interface SimulatorRuntime {
  identifier: string;
  version: string;
  name: string;
  isAvailable: boolean;
}

export interface SimulatorListResponse {
  devices: Record<string, SimulatorDevice[]>;
  runtimes: SimulatorRuntime[];
}

export interface ScreenCaptureOptions {
  method: 'desktopCapturer' | 'xcrun';
  frameRate?: number; // default 30
}

export interface TapOptions {
  x: number;
  y: number;
}

export interface SimulatorStatus {
  available: boolean; // xcrun simctl works
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  permissionGranted: boolean; // screen recording permission
}
```

### IPC Channels

```typescript
// IPC channel names (add to constants or inline)
const SIMULATOR_CHANNELS = {
  // Invoke (request-response)
  LIST_DEVICES: 'simulator:list-devices',
  BOOT_DEVICE: 'simulator:boot',
  SHUTDOWN_DEVICE: 'simulator:shutdown',
  GET_STATUS: 'simulator:status',
  SCREENSHOT: 'simulator:screenshot',
  TAP: 'simulator:tap',
  LAUNCH_APP: 'simulator:launch-app',
  OPEN_URL: 'simulator:open-url',

  // Send (one-way, main -> renderer)
  FRAME: 'simulator:frame',
  STATE_CHANGE: 'simulator:state-change',

  // Send (one-way, renderer -> main)
  START_STREAMING: 'simulator:start-streaming',
  STOP_STREAMING: 'simulator:stop-streaming',
} as const;
```

### MCP Commands

```typescript
// Commands handled by MCPBridge.handleCommand()
const MCP_SIMULATOR_COMMANDS = [
  'simulator:screenshot',
  'simulator:tap',
  'simulator:launchApp',
  'simulator:openUrl',
  'simulator:listDevices',
  'simulator:bootDevice',
  'simulator:shutdownDevice',
  'simulator:getStatus',
] as const;
```

## Implementation Steps

### 1. Create types file
```bash
# New file: src/main/simulator-types.ts
# Contains all interfaces above
```

### 2. Check Xcode installation
```typescript
// Utility function for SimulatorManager
import { execSync } from 'child_process';

export function isXcodeAvailable(): boolean {
  try {
    execSync('xcrun --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getXcodeVersion(): string | null {
  try {
    const output = execSync('xcodebuild -version', { stdio: 'pipe' }).toString();
    const match = output.match(/Xcode (\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
```

### 3. Check screen recording permission
```typescript
// Main process only
import { systemPreferences } from 'electron';

export async function hasScreenRecordingPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false; // iOS Simulator only on macOS
  }
  const status = systemPreferences.getMediaAccessStatus('screen');
  return status === 'granted';
}

export async function requestScreenRecordingPermission(): Promise<void> {
  // Can't programmatically request, but can prompt user
  // Open System Preferences to correct pane
  const { shell } = require('electron');
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
}
```

### 4. Platform guard
```typescript
// Guard for non-macOS platforms
export function isSimulatorSupported(): boolean {
  return process.platform === 'darwin';
}
```

## Related Code Files

| File | Purpose |
|------|---------|
| `src/main/browser-manager.ts` | Reference for manager pattern |
| `src/main/pty-manager.ts` | Reference for process management |
| `src/main/mcp-bridge.ts` | Will add simulator commands here |
| `src/preload/index.ts` | Will expose simulator API |

## Todo

- [ ] Create `src/main/simulator-types.ts` with all interfaces
- [ ] Add Xcode/simctl availability check function
- [ ] Add screen recording permission check
- [ ] Add platform guard (macOS only)
- [ ] Document IPC channel naming convention

## Success Criteria

1. Types compile without errors
2. Xcode check works: returns true if Xcode installed
3. Permission check works: returns current screen recording status
4. Platform guard correctly identifies macOS

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Types need revision later | Medium | Low | Keep interfaces minimal, extend as needed |
| Different Xcode versions | Low | Medium | Test with Xcode 15, document min version |

## Security Considerations

- xcrun commands execute child processes - sanitize any user input (device names)
- Screen capture accesses system resources - respect permission denial gracefully
- Never log full device UUIDs in production (privacy)

## Next Steps

After this phase:
1. Implement SimulatorManager class (Phase 2)
2. Use types in renderer components (Phase 3)
3. Add MCP commands using defined interfaces (Phase 4)
