/**
 * Terminal Panel Component
 * Supports multiple terminal instances like VS Code
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  cwd?: string;
}

let terminalCounter = 0;

export function TerminalPanel() {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const initializedRef = useRef(false);

  // Create a new terminal instance
  const createTerminal = useCallback(async (cwd?: string) => {
    const id = `terminal-${++terminalCounter}`;
    const name = `zsh ${terminalCounter}`;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const instance: TerminalInstance = { id, name, terminal, fitAddon, cwd };

    setTerminals(prev => [...prev, instance]);
    setActiveTerminalId(id);

    return instance;
  }, []);

  // Close a terminal
  const closeTerminal = useCallback((id: string) => {
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id);
      const toClose = prev.find(t => t.id === id);

      if (toClose) {
        window.terminal.kill(id);
        toClose.terminal.dispose();
        containerRefs.current.delete(id);
      }

      // Switch to another terminal if closing active one
      if (id === activeTerminalId && filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      } else if (filtered.length === 0) {
        setActiveTerminalId(null);
      }

      return filtered;
    });
  }, [activeTerminalId]);

  // Initialize first terminal
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    createTerminal();
  }, [createTerminal]);

  // Setup terminal when container is available
  useEffect(() => {
    terminals.forEach(instance => {
      const container = containerRefs.current.get(instance.id);
      if (container && !container.hasChildNodes()) {
        instance.terminal.open(container);

        // Create PTY with cwd
        window.terminal.create(instance.id, instance.cwd);

        // Handle data from PTY
        const dataHandler = ({ id, data }: { id: string; data: string }) => {
          if (id === instance.id) {
            instance.terminal.write(data);
          }
        };
        window.terminal.onData(dataHandler);

        // Send user input to PTY
        instance.terminal.onData((data) => {
          window.terminal.write(instance.id, data);
        });

        // Handle Shift+Enter for line continuation (like VS Code Claude extension)
        instance.terminal.attachCustomKeyEventHandler((event) => {
          if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
            // Send Ctrl+V (literal next) + newline to insert actual newline
            // \x16 = Ctrl+V, \x0a = LF (newline)
            window.terminal.write(instance.id, '\x16\x0a');
            return false; // Prevent default Enter
          }
          return true; // Allow other keys
        });

        // Fit terminal and focus
        setTimeout(() => {
          instance.fitAddon.fit();
          const { cols, rows } = instance.terminal;
          window.terminal.resize(instance.id, cols, rows);
          instance.terminal.focus();
        }, 100);
      }
    });
  }, [terminals]);

  // Handle resize for active terminal
  useEffect(() => {
    if (!activeTerminalId) return;

    const instance = terminals.find(t => t.id === activeTerminalId);
    if (!instance) return;

    const container = containerRefs.current.get(activeTerminalId);
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        instance.fitAddon.fit();
        const { cols, rows } = instance.terminal;
        window.terminal.resize(instance.id, cols, rows);
      });
    });

    resizeObserver.observe(container);

    // Fit and focus on active change
    setTimeout(() => {
      instance.fitAddon.fit();
      const { cols, rows } = instance.terminal;
      window.terminal.resize(instance.id, cols, rows);
      instance.terminal.focus();
    }, 50);

    return () => resizeObserver.disconnect();
  }, [activeTerminalId, terminals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      terminals.forEach(t => {
        window.terminal.kill(t.id);
        t.terminal.dispose();
      });
    };
  }, []);

  return (
    <div className="terminal-panel">
      {/* Terminal containers - show/hide based on active */}
      <div className="terminal-instances">
        {terminals.map(instance => (
          <div
            key={instance.id}
            ref={el => {
              if (el) containerRefs.current.set(instance.id, el);
            }}
            className="terminal-container"
            style={{ display: instance.id === activeTerminalId ? 'block' : 'none' }}
            onClick={() => instance.terminal.focus()}
          />
        ))}
      </div>

      {/* Terminal tabs bar */}
      <div className="terminal-tabs">
        <div className="terminal-tabs-list">
          {terminals.map(instance => (
            <div
              key={instance.id}
              className={`terminal-tab ${instance.id === activeTerminalId ? 'active' : ''}`}
              onClick={() => setActiveTerminalId(instance.id)}
            >
              <span className="terminal-tab-icon">⌘</span>
              <span className="terminal-tab-name">{instance.name}</span>
              {terminals.length > 1 && (
                <button
                  className="terminal-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(instance.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="terminal-add-btn"
          onClick={async () => {
            // Get cwd from active terminal
            let cwd: string | undefined;
            if (activeTerminalId) {
              cwd = await window.terminal.getCwd(activeTerminalId);
            }
            createTerminal(cwd);
          }}
          title="New Terminal"
        >
          +
        </button>
      </div>
    </div>
  );
}
