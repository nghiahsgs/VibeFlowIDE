# Phase 3: UI Panel Component

**Date:** 2026-01-04
**Status:** Pending
**Priority:** High
**Estimated:** 4 hours

## Context Links

- Simulator API: `phase-02-simulator-manager.md`
- Pattern: `src/renderer/components/browser-panel.tsx`
- Layout: `src/renderer/App.tsx`
- Styles: `src/renderer/styles/app.css`

## Overview

Build SimulatorPanel React component with device picker, screen viewer, and controls. Integrate into App.tsx as 3rd panel with toggle visibility.

## Key Insights

1. Follow BrowserPanel pattern for toolbar + content layout
2. Device picker as dropdown, not full list
3. Screen viewer uses `<img>` with base64 src updates
4. Panel hidden by default, shown via toggle button

## Requirements

- [ ] Device picker dropdown (list available devices)
- [ ] Boot/shutdown button
- [ ] Real-time screen viewer (updates from streaming)
- [ ] Screenshot button (single capture to clipboard)
- [ ] Show device state badge (Booted/Shutdown)
- [ ] Handle no Xcode installed gracefully
- [ ] Handle no device booted state

## Architecture

### Component Structure

```
SimulatorPanel/
├── Toolbar
│   ├── Device Dropdown (select simulator)
│   ├── Boot/Shutdown Button
│   ├── Screenshot Button
│   └── Settings (frame rate?)
├── Screen Viewer
│   ├── <img> or <canvas> for frames
│   └── Overlay for touch input (future)
└── Status Bar
    └── Device state, frame rate, permission status
```

### State Management

```typescript
interface SimulatorPanelState {
  devices: SimulatorDevice[];
  selectedUdid: string | null;
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  currentFrame: string | null; // base64
  isLoading: boolean;
  error: string | null;
  permissionGranted: boolean;
}
```

## Implementation Steps

### 1. Create SimulatorPanel component

```tsx
// src/renderer/components/simulator-panel.tsx
import { useState, useEffect, useRef, useCallback } from 'react';

interface SimulatorDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Shutting Down' | 'Creating';
  runtimeVersion: string;
}

interface SimulatorStatus {
  available: boolean;
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  permissionGranted: boolean;
}

export function SimulatorPanel() {
  const [devices, setDevices] = useState<SimulatorDevice[]>([]);
  const [selectedUdid, setSelectedUdid] = useState<string>('');
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
    loadStatus();

    // Subscribe to frame updates
    const unsubscribe = window.simulator.onFrame((base64) => {
      setCurrentFrame(base64);
    });

    return () => {
      unsubscribe();
      window.simulator.stopStreaming();
    };
  }, []);

  const loadDevices = async () => {
    try {
      const deviceList = await window.simulator.listDevices();
      setDevices(deviceList);

      // Auto-select booted device or first available
      const booted = deviceList.find(d => d.state === 'Booted');
      if (booted) {
        setSelectedUdid(booted.udid);
      } else if (deviceList.length > 0) {
        setSelectedUdid(deviceList[0].udid);
      }
    } catch (e) {
      setError('Failed to load devices');
    }
  };

  const loadStatus = async () => {
    try {
      const s = await window.simulator.getStatus();
      setStatus(s);

      // Start streaming if device is booted
      if (s.bootedDevice) {
        window.simulator.startStreaming(30);
      }
    } catch (e) {
      console.error('Failed to load status:', e);
    }
  };

  const handleBoot = async () => {
    if (!selectedUdid) return;

    setIsLoading(true);
    setError(null);

    try {
      await window.simulator.boot(selectedUdid);
      // Wait a moment for boot to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      await loadDevices();
      await loadStatus();
      window.simulator.startStreaming(30);
    } catch (e) {
      setError('Failed to boot simulator');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShutdown = async () => {
    const booted = devices.find(d => d.state === 'Booted');
    if (!booted) return;

    setIsLoading(true);
    setError(null);

    try {
      window.simulator.stopStreaming();
      await window.simulator.shutdown(booted.udid);
      setCurrentFrame(null);
      await loadDevices();
      await loadStatus();
    } catch (e) {
      setError('Failed to shutdown simulator');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScreenshot = async () => {
    try {
      const base64 = await window.simulator.screenshot();
      if (base64) {
        // Copy to clipboard handled by main process
        // Show success indicator
      }
    } catch (e) {
      setError('Screenshot failed');
    }
  };

  const selectedDevice = devices.find(d => d.udid === selectedUdid);
  const isBooted = selectedDevice?.state === 'Booted';
  const hasBootedDevice = devices.some(d => d.state === 'Booted');

  // Not available state
  if (status && !status.available) {
    return (
      <div className="simulator-panel">
        <div className="simulator-unavailable">
          <h3>iOS Simulator Not Available</h3>
          <p>Xcode is required for iOS Simulator.</p>
          <p>Install Xcode from the Mac App Store.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="simulator-panel">
      <div className="simulator-toolbar">
        {/* Device Picker */}
        <select
          className="device-select"
          value={selectedUdid}
          onChange={(e) => setSelectedUdid(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select device...</option>
          {devices.map((device) => (
            <option key={device.udid} value={device.udid}>
              {device.name} (iOS {device.runtimeVersion})
              {device.state === 'Booted' ? ' - Booted' : ''}
            </option>
          ))}
        </select>

        {/* Boot/Shutdown Button */}
        {hasBootedDevice ? (
          <button
            className="toolbar-btn shutdown-btn"
            onClick={handleShutdown}
            disabled={isLoading}
            title="Shutdown Simulator"
          >
            {isLoading ? '...' : '⏻'}
          </button>
        ) : (
          <button
            className="toolbar-btn boot-btn"
            onClick={handleBoot}
            disabled={isLoading || !selectedUdid}
            title="Boot Simulator"
          >
            {isLoading ? '...' : '▶'}
          </button>
        )}

        {/* Screenshot Button */}
        <button
          className="toolbar-btn"
          onClick={handleScreenshot}
          disabled={!hasBootedDevice}
          title="Screenshot to Clipboard"
        >
          📷
        </button>

        {/* Refresh Button */}
        <button
          className="toolbar-btn"
          onClick={() => { loadDevices(); loadStatus(); }}
          disabled={isLoading}
          title="Refresh Devices"
        >
          ↻
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="simulator-error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Screen Viewer */}
      <div className="simulator-screen">
        {currentFrame ? (
          <img
            ref={imgRef}
            src={`data:image/png;base64,${currentFrame}`}
            alt="iOS Simulator"
            className="simulator-frame"
          />
        ) : hasBootedDevice ? (
          <div className="simulator-loading">
            Loading simulator screen...
          </div>
        ) : (
          <div className="simulator-placeholder">
            <p>No simulator running</p>
            <p className="hint">Select a device and click Boot</p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="simulator-status-bar">
        {status?.bootedDevice && (
          <span className="status-device">
            {status.bootedDevice.name}
          </span>
        )}
        {!status?.permissionGranted && hasBootedDevice && (
          <span className="status-warning" title="Screen recording permission not granted">
            ⚠️ Limited mode
          </span>
        )}
      </div>
    </div>
  );
}
```

### 2. Add styles

```css
/* Add to src/renderer/styles/app.css */

/* Simulator Panel */
.simulator-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.simulator-unavailable {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
  color: #888888;
}

.simulator-unavailable h3 {
  margin: 0 0 12px 0;
  color: #cccccc;
}

.simulator-unavailable p {
  margin: 4px 0;
}

.simulator-toolbar {
  height: 35px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
}

.device-select {
  flex: 1;
  height: 24px;
  padding: 0 8px;
  background: #3c3c3c;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  font-size: 11px;
  cursor: pointer;
}

.device-select:hover {
  background: #454545;
}

.device-select:focus {
  outline: 1px solid #007acc;
}

.boot-btn {
  color: #23d18b !important;
}

.shutdown-btn {
  color: #f14c4c !important;
}

.simulator-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(241, 76, 76, 0.2);
  color: #f14c4c;
  font-size: 11px;
}

.simulator-error button {
  background: none;
  border: none;
  color: #f14c4c;
  cursor: pointer;
  font-size: 14px;
}

.simulator-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000000;
}

.simulator-frame {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.simulator-loading,
.simulator-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #888888;
  text-align: center;
}

.simulator-placeholder .hint {
  font-size: 11px;
  color: #666666;
  margin-top: 8px;
}

.simulator-status-bar {
  height: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  background: #252526;
  border-top: 1px solid #1e1e1e;
  font-size: 10px;
  color: #888888;
}

.status-device {
  color: #4ec9b0;
}

.status-warning {
  color: #e5e510;
}
```

### 3. Update App.tsx for 3-panel layout

```tsx
// src/renderer/App.tsx
import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { LeftPanel } from './components/left-panel';
import { BrowserPanel } from './components/browser-panel';
import { SimulatorPanel } from './components/simulator-panel';
import './styles/app.css';

export default function App() {
  const [showSimulator, setShowSimulator] = useState(false);

  return (
    <div className="app">
      {/* Toggle Button for Simulator */}
      <button
        className="simulator-toggle"
        onClick={() => setShowSimulator(!showSimulator)}
        title={showSimulator ? 'Hide Simulator' : 'Show Simulator'}
      >
        📱
      </button>

      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={showSimulator ? 30 : 40} minSize={20} className="panel">
          <LeftPanel />
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={showSimulator ? 40 : 60} minSize={25} className="panel">
          <BrowserPanel />
        </Panel>

        {showSimulator && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={30} minSize={20} className="panel">
              <SimulatorPanel />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
```

### 4. Add toggle button styles

```css
/* Add to app.css */

.simulator-toggle {
  position: fixed;
  top: 42px;
  right: 12px;
  z-index: 100;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3c3c3c;
  border: 1px solid #4c4c4c;
  border-radius: 6px;
  color: #cccccc;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.simulator-toggle:hover {
  background: #4c4c4c;
  border-color: #5c5c5c;
}

.simulator-toggle.active {
  background: #007acc;
  border-color: #0098ff;
}
```

### 5. Add type declarations

```typescript
// Add to src/renderer/types/global.d.ts

interface SimulatorDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Shutting Down' | 'Creating';
  isAvailable: boolean;
  deviceTypeIdentifier: string;
  runtime: string;
  runtimeVersion: string;
}

interface SimulatorStatus {
  available: boolean;
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  permissionGranted: boolean;
}

interface SimulatorAPI {
  listDevices: () => Promise<SimulatorDevice[]>;
  boot: (udid: string) => Promise<boolean>;
  shutdown: (udid: string) => Promise<boolean>;
  screenshot: () => Promise<string>;
  getStatus: () => Promise<SimulatorStatus>;
  tap: (x: number, y: number) => Promise<boolean>;
  launchApp: (bundleId: string) => Promise<boolean>;
  openUrl: (url: string) => Promise<boolean>;
  startStreaming: (frameRate?: number) => void;
  stopStreaming: () => void;
  onFrame: (callback: (base64: string) => void) => () => void;
}

declare global {
  interface Window {
    simulator: SimulatorAPI;
  }
}
```

## Related Code Files

| File | Change |
|------|--------|
| `src/renderer/components/simulator-panel.tsx` | New file |
| `src/renderer/App.tsx` | Add 3rd panel, toggle button |
| `src/renderer/styles/app.css` | Add simulator panel styles |
| `src/renderer/types/global.d.ts` | Add simulator types |

## Todo

- [ ] Create simulator-panel.tsx component
- [ ] Add CSS styles for panel
- [ ] Update App.tsx for 3-panel layout
- [ ] Add toggle button for panel visibility
- [ ] Add type declarations
- [ ] Test device picker flow
- [ ] Test screen streaming

## Success Criteria

1. Panel shows device dropdown with available devices
2. Boot button starts simulator, shows loading state
3. Screen viewer shows live frames
4. Shutdown button stops simulator
5. Toggle button shows/hides panel
6. Graceful error handling for no Xcode

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Panel resize issues | Medium | Medium | Test with react-resizable-panels |
| Image flicker during streaming | Medium | Low | Use requestAnimationFrame, double buffer |
| Memory leak from frames | Low | High | Ensure cleanup on unmount |

## Security Considerations

- Don't expose device UDID in logs visible to users
- Validate device selection before boot

## Next Steps

After this phase:
1. Add MCP tools for Claude Code (Phase 4)
2. Test end-to-end workflow
