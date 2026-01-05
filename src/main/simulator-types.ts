/**
 * iOS Simulator Type Definitions
 * Shared interfaces for main process, renderer, and MCP server
 */

export interface SimulatorDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Shutting Down' | 'Creating';
  isAvailable: boolean;
  deviceTypeIdentifier: string;
  runtime: string;
  runtimeVersion: string; // e.g., "17.2"
}

export interface SimulatorStatus {
  available: boolean; // xcrun simctl works
  bootedDevice: SimulatorDevice | null;
  isStreaming: boolean;
  permissionGranted: boolean; // screen recording permission
}

export interface SimulatorListResponse {
  devices: Record<string, SimulatorDevice[]>;
}

// IPC channel constants
export const SIMULATOR_CHANNELS = {
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
