/**
 * Browser Panel Component
 * Toolbar controls for embedded WebContentsView
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function BrowserPanel() {
  const [url, setUrl] = useState('https://www.google.com');
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
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

    // Observe container resize
    const resizeObserver = new ResizeObserver(updateBounds);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeout);
      unsubscribe();
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

        <button
          onClick={async () => {
            const base64 = await window.browser.screenshot();
            if (base64) {
              // Convert base64 to blob and copy to clipboard
              const response = await fetch(`data:image/png;base64,${base64}`);
              const blob = await response.blob();
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
            }
          }}
          title="Screenshot to Clipboard"
          className="toolbar-btn"
        >
          📷
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
