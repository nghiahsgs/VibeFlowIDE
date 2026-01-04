/**
 * Console Panel Component
 * Displays console logs from the embedded browser
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface ConsoleLog {
  id: number;
  level: string;
  message: string;
  timestamp: Date;
}

// Log level colors
const LEVEL_COLORS: Record<string, string> = {
  verbose: '#888888',
  info: '#3b8eea',
  warning: '#e5e510',
  error: '#f14c4c',
  log: '#cccccc'
};

// Log level icons
const LEVEL_ICONS: Record<string, string> = {
  verbose: '📝',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  log: '📋'
};

let logIdCounter = 0;

export function ConsolePanel() {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch console logs from browser
  const fetchLogs = useCallback(async () => {
    try {
      const browserLogs = await window.browser.getConsoleLogs?.();
      if (browserLogs && Array.isArray(browserLogs)) {
        const newLogs: ConsoleLog[] = browserLogs.map((log: string) => {
          // Parse log format: [level] message
          const match = log.match(/^\[(verbose|info|warning|error|log)\]\s*(.*)/i);
          const level = match ? match[1].toLowerCase() : 'log';
          const message = match ? match[2] : log;
          return {
            id: ++logIdCounter,
            level,
            message,
            timestamp: new Date()
          };
        });
        setLogs(newLogs);
      }
    } catch (error) {
      console.error('Failed to fetch console logs:', error);
    }
  }, []);

  // Poll for logs every second
  useEffect(() => {
    fetchLogs();
    pollingRef.current = setInterval(fetchLogs, 1000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleClear = useCallback(() => {
    window.browser.clearConsoleLogs?.();
    setLogs([]);
  }, []);

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (!filter) return true;
    return log.message.toLowerCase().includes(filter.toLowerCase());
  });

  // Count by level
  const levelCounts = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="console-panel">
      <div className="console-toolbar">
        <button onClick={handleClear} className="toolbar-btn" title="Clear">
          🗑️
        </button>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs..."
          className="filter-input"
        />
        <span className="log-count">{filteredLogs.length} logs</span>
      </div>

      <div className="console-level-filters">
        <button
          className={`level-filter-btn ${levelFilter === null ? 'active' : ''}`}
          onClick={() => setLevelFilter(null)}
        >
          All ({logs.length})
        </button>
        {Object.entries(levelCounts).map(([level, count]) => (
          <button
            key={level}
            className={`level-filter-btn ${levelFilter === level ? 'active' : ''}`}
            onClick={() => setLevelFilter(level)}
            style={{ color: LEVEL_COLORS[level] }}
          >
            {LEVEL_ICONS[level]} {level} ({count})
          </button>
        ))}
      </div>

      <div className="console-logs">
        {filteredLogs.length === 0 ? (
          <div className="no-logs">
            {filter || levelFilter ? 'No matching logs' : 'No console output'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`console-log-row level-${log.level}`}
              style={{ borderLeftColor: LEVEL_COLORS[log.level] }}
            >
              <span className="log-icon">{LEVEL_ICONS[log.level]}</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
