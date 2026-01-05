/**
 * Simulator Panel Component
 * iOS Simulator control panel with device picker, screen viewer, and controls
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulatorDevice, SimulatorStatus } from '../types/global';

export function SimulatorPanel() {
  const [devices, setDevices] = useState<SimulatorDevice[]>([]);
  const [selectedUdid, setSelectedUdid] = useState<string>('');
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

  const loadDevices = useCallback(async () => {
    try {
      const deviceList = await window.simulator.listDevices();
      setDevices(deviceList);

      // Auto-select booted device or first available
      const booted = deviceList.find((d: SimulatorDevice) => d.state === 'Booted');
      if (booted) {
        setSelectedUdid(booted.udid);
      } else if (deviceList.length > 0) {
        setSelectedUdid(deviceList[0].udid);
      }
    } catch (e) {
      console.error('Failed to load devices:', e);
    }
  }, []);

  const loadStatus = useCallback(async () => {
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
  }, []);

  const handleBoot = async () => {
    if (!selectedUdid) return;

    setIsLoading(true);
    setError(null);

    try {
      await window.simulator.boot(selectedUdid);
      // Wait a moment for boot to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      await loadDevices();
      await loadStatus();
      window.simulator.startStreaming(30);
    } catch (e) {
      setError('Failed to boot simulator');
      console.error(e);
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
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScreenshot = async () => {
    try {
      setScreenshotStatus('idle');
      const base64 = await window.simulator.screenshot();
      if (base64) {
        setScreenshotStatus('success');
        setTimeout(() => setScreenshotStatus('idle'), 1500);
      } else {
        setScreenshotStatus('error');
        setTimeout(() => setScreenshotStatus('idle'), 1500);
      }
    } catch (e) {
      setScreenshotStatus('error');
      setTimeout(() => setScreenshotStatus('idle'), 1500);
      console.error('Screenshot failed:', e);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadDevices();
    await loadStatus();
    setIsLoading(false);
  };

  const selectedDevice = devices.find(d => d.udid === selectedUdid);
  const hasBootedDevice = devices.some(d => d.state === 'Booted');

  // Not available state (not macOS or no Xcode)
  if (status && !status.available) {
    return (
      <div className="simulator-panel">
        <div className="simulator-unavailable">
          <div className="unavailable-icon">📱</div>
          <h3>iOS Simulator Not Available</h3>
          <p>Xcode is required for iOS Simulator.</p>
          <p className="hint">Install Xcode from the Mac App Store.</p>
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
              {device.state === 'Booted' ? ' ●' : ''}
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
          className={`toolbar-btn ${screenshotStatus === 'success' ? 'screenshot-success' : ''} ${screenshotStatus === 'error' ? 'screenshot-error' : ''}`}
          onClick={handleScreenshot}
          disabled={!hasBootedDevice}
          title="Screenshot to Clipboard"
        >
          {screenshotStatus === 'success' ? '✓' : screenshotStatus === 'error' ? '✗' : '📷'}
        </button>

        {/* Refresh Button */}
        <button
          className="toolbar-btn"
          onClick={handleRefresh}
          disabled={isLoading}
          title="Refresh Devices"
        >
          ↻
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="simulator-error">
          <span>{error}</span>
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
            <div className="loading-spinner">◌</div>
            <p>Loading simulator screen...</p>
          </div>
        ) : (
          <div className="simulator-placeholder">
            <div className="placeholder-icon">📱</div>
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
          <span className="status-warning" title="Screen recording permission not granted - using fallback mode">
            ⚠️ Limited
          </span>
        )}
      </div>
    </div>
  );
}
