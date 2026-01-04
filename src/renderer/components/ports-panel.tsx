/**
 * Ports Panel Component
 * Displays listening ports with ability to kill processes
 */
import { useState, useEffect, useCallback } from 'react';

interface PortProcess {
  pid: number;
  name: string;
  port: number;
  type: string;
  cwd?: string;
}

// Process type icons (emoji fallback)
const TYPE_ICONS: Record<string, string> = {
  node: '🟢',
  python: '🐍',
  docker: '🐳',
  postgres: '🐘',
  redis: '🔴',
  go: '🔵',
  java: '☕',
  ruby: '💎',
  nginx: '🌐',
  rust: '🦀',
  php: '🐘',
  unknown: '⚙️'
};

export function PortsPanel() {
  const [processes, setProcesses] = useState<PortProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState<number | null>(null);

  const scanPorts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.ports.scan();
      setProcesses(result as PortProcess[]);
    } catch (error) {
      console.error('Failed to scan ports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial scan
  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(scanPorts, 5000);
    return () => clearInterval(interval);
  }, [scanPorts]);

  const handleKill = async (pid: number) => {
    setKilling(pid);
    try {
      const success = await window.ports.kill(pid);
      if (success) {
        // Remove from list immediately
        setProcesses(prev => prev.filter(p => p.pid !== pid));
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
    } finally {
      setKilling(null);
    }
  };

  const getProjectName = (cwd?: string): string => {
    if (!cwd) return '';
    const parts = cwd.split('/');
    return parts[parts.length - 1] || '';
  };

  return (
    <div className="ports-panel">
      <div className="ports-toolbar">
        <button
          className="refresh-btn"
          onClick={scanPorts}
          disabled={loading}
          title="Refresh"
        >
          {loading ? '⟳' : '↻'}
        </button>
        <span className="port-count">
          {processes.length} port{processes.length !== 1 ? 's' : ''} listening
        </span>
      </div>

      <div className="ports-list">
        {processes.length === 0 ? (
          <div className="no-ports">
            {loading ? 'Scanning...' : 'No listening ports found'}
          </div>
        ) : (
          processes.map((proc) => (
            <div key={`${proc.pid}-${proc.port}`} className="port-row">
              <div className="port-info">
                <div className="port-main">
                  <span className="port-icon">{TYPE_ICONS[proc.type] || TYPE_ICONS.unknown}</span>
                  <span className="port-number">:{proc.port}</span>
                  <span className="port-name">{proc.name}</span>
                </div>
                <div className="port-meta">
                  <span className="port-pid">PID {proc.pid}</span>
                  {proc.cwd && (
                    <span className="port-cwd" title={proc.cwd}>
                      {getProjectName(proc.cwd)}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="kill-btn"
                onClick={() => handleKill(proc.pid)}
                disabled={killing === proc.pid}
                title="Kill process"
              >
                {killing === proc.pid ? '...' : '×'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
