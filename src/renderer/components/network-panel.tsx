/**
 * Network Panel Component
 * Displays network requests captured via CDP
 */
import { useEffect, useState, useCallback } from 'react';

// Status code color mapping
function getStatusColor(status: number): string {
  if (status === 0) return '#f14c4c'; // Error/pending
  if (status < 300) return '#23d18b'; // Success
  if (status < 400) return '#3b8eea'; // Redirect
  if (status < 500) return '#e5e510'; // Client error
  return '#f14c4c'; // Server error
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format duration
function formatDuration(ms?: number): string {
  if (ms === undefined) return 'pending';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Get method color
function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return '#23d18b';
    case 'POST': return '#3b8eea';
    case 'PUT': return '#e5e510';
    case 'DELETE': return '#f14c4c';
    case 'PATCH': return '#d670d6';
    default: return '#cccccc';
  }
}

// Extract filename from URL
function getUrlFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || pathname || '/';
    const query = urlObj.search ? '?' + urlObj.search.substring(0, 20) + '...' : '';
    return filename + query;
  } catch {
    return url.substring(0, 50);
  }
}

export function NetworkPanel() {
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    // Subscribe to network updates
    const unsubscribe = window.network.onUpdate((newRequests) => {
      setRequests(newRequests as NetworkRequest[]);
    });

    // Initial load
    window.network.getRequests().then((initialRequests) => {
      setRequests(initialRequests as NetworkRequest[]);
    });

    return unsubscribe;
  }, []);

  const handleClear = useCallback(() => {
    window.network.clear();
    setRequests([]);
    setSelectedRequest(null);
  }, []);

  // Filter requests
  const filteredRequests = requests.filter((req) => {
    if (!filter) return true;
    const lowerFilter = filter.toLowerCase();
    return (
      req.url.toLowerCase().includes(lowerFilter) ||
      req.method.toLowerCase().includes(lowerFilter) ||
      req.type.toLowerCase().includes(lowerFilter)
    );
  });

  return (
    <div className="network-panel">
      <div className="network-toolbar">
        <button onClick={handleClear} className="toolbar-btn" title="Clear">
          🗑️
        </button>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter requests..."
          className="filter-input"
        />
        <span className="request-count">{filteredRequests.length} requests</span>
      </div>

      <div className="network-content">
        <div className="request-list">
          <div className="request-header">
            <span className="col-status">Status</span>
            <span className="col-method">Method</span>
            <span className="col-name">Name</span>
            <span className="col-type">Type</span>
            <span className="col-size">Size</span>
            <span className="col-time">Time</span>
          </div>

          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className={`request-row ${selectedRequest?.id === req.id ? 'selected' : ''} ${req.error ? 'error' : ''}`}
              onClick={() => setSelectedRequest(req)}
            >
              <span
                className="col-status"
                style={{ color: getStatusColor(req.status) }}
              >
                {req.status || '⏳'}
              </span>
              <span
                className="col-method"
                style={{ color: getMethodColor(req.method) }}
              >
                {req.method}
              </span>
              <span className="col-name" title={req.url}>
                {getUrlFilename(req.url)}
              </span>
              <span className="col-type">{req.type}</span>
              <span className="col-size">{formatBytes(req.responseSize)}</span>
              <span className="col-time">{formatDuration(req.duration)}</span>
            </div>
          ))}

          {filteredRequests.length === 0 && (
            <div className="no-requests">
              {filter ? 'No matching requests' : 'No network activity'}
            </div>
          )}
        </div>

        {selectedRequest && (
          <div className="request-details">
            <div className="details-header">
              <span className="details-title">Request Details</span>
              <button
                className="close-btn"
                onClick={() => setSelectedRequest(null)}
              >
                ✕
              </button>
            </div>
            <div className="details-content">
              <div className="detail-section">
                <h4>General</h4>
                <div className="detail-row">
                  <span className="detail-label">URL:</span>
                  <span className="detail-value">{selectedRequest.url}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Method:</span>
                  <span className="detail-value">{selectedRequest.method}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className="detail-value" style={{ color: getStatusColor(selectedRequest.status) }}>
                    {selectedRequest.status} {selectedRequest.statusText}
                  </span>
                </div>
                {selectedRequest.error && (
                  <div className="detail-row">
                    <span className="detail-label">Error:</span>
                    <span className="detail-value error-text">{selectedRequest.error}</span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>Response Headers</h4>
                {Object.entries(selectedRequest.responseHeaders).map(([key, value]) => (
                  <div key={key} className="detail-row">
                    <span className="detail-label">{key}:</span>
                    <span className="detail-value">{value}</span>
                  </div>
                ))}
              </div>

              <div className="detail-section">
                <h4>Request Headers</h4>
                {Object.entries(selectedRequest.requestHeaders).map(([key, value]) => (
                  <div key={key} className="detail-row">
                    <span className="detail-label">{key}:</span>
                    <span className="detail-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
