/**
 * Browser Panel Component
 * Toolbar controls for embedded WebContentsView
 */
import { useState, useEffect, useRef, useCallback } from 'react';

interface DevicePreset {
  id: string;
  name: string;
}

export function BrowserPanel() {
  const [url, setUrl] = useState('https://www.google.com');
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [deviceMode, setDeviceMode] = useState('desktop');
  const [devicePresets, setDevicePresets] = useState<DevicePreset[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update browser bounds when container resizes
  const updateBounds = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    window.browser.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
  }, []);

  useEffect(() => {
    // Initial bounds update (after render)
    const timeout = setTimeout(updateBounds, 100);

    // Listen for navigation events
    const unsubscribe = window.browser.onNavigate((newUrl) => {
      setUrl(newUrl);
      setInputUrl(newUrl);
    });

    // Listen for device mode changes
    const unsubscribeDevice = window.browser.onDeviceChanged((info) => {
      setDeviceMode(info.deviceId);
    });

    // Load device presets and current mode
    window.browser.getDevicePresets().then(setDevicePresets);
    window.browser.getDeviceMode().then(setDeviceMode);

    // Observe container resize
    const resizeObserver = new ResizeObserver(updateBounds);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeout);
      unsubscribe();
      unsubscribeDevice();
      resizeObserver.disconnect();
    };
  }, [updateBounds]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    window.browser.navigate(inputUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setInputUrl(url);
    }
  };

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDevice = e.target.value;
    await window.browser.setDeviceMode(newDevice);
  };

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button onClick={() => window.browser.back()} title="Back" className="toolbar-btn">
          ←
        </button>
        <button onClick={() => window.browser.forward()} title="Forward" className="toolbar-btn">
          →
        </button>
        <button onClick={() => window.browser.reload()} title="Reload" className="toolbar-btn">
          ↻
        </button>

        <form onSubmit={handleNavigate} className="url-form">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
            className="url-input"
          />
        </form>

        <select
          value={deviceMode}
          onChange={handleDeviceChange}
          className="device-select"
          title="Device Mode"
        >
          {devicePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>

        <button
          onClick={async () => {
            try {
              setScreenshotStatus('idle');
              const base64 = await window.browser.screenshot();
              if (base64) {
                // Clipboard is handled in main process
                setScreenshotStatus('success');
                setTimeout(() => setScreenshotStatus('idle'), 1500);
              } else {
                setScreenshotStatus('error');
                setTimeout(() => setScreenshotStatus('idle'), 1500);
              }
            } catch (err) {
              console.error('Screenshot failed:', err);
              setScreenshotStatus('error');
              setTimeout(() => setScreenshotStatus('idle'), 1500);
            }
          }}
          title="Screenshot to Clipboard"
          className={`toolbar-btn ${screenshotStatus === 'success' ? 'screenshot-success' : ''} ${screenshotStatus === 'error' ? 'screenshot-error' : ''}`}
        >
          {screenshotStatus === 'success' ? '✓' : screenshotStatus === 'error' ? '✗' : '📷'}
        </button>
        <button
          onClick={() => window.browser.openDevTools()}
          title="Open DevTools"
          className="toolbar-btn"
        >
          🔧
        </button>
      </div>

      {/* This div is where WebContentsView will be positioned */}
      <div ref={containerRef} className="browser-container" />
    </div>
  );
}
