/**
 * Terminal Panel Component
 * Renders xterm.js terminal with pty backend
 */
import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TERMINAL_ID = 'main-terminal';

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

  // Handle terminal resize
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;
      window.terminal.resize(TERMINAL_ID, cols, rows);
    }
  }, []);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    // Create terminal
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
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Create PTY process
    window.terminal.create(TERMINAL_ID);

    // Handle data from PTY
    const unsubscribe = window.terminal.onData(({ id, data }) => {
      if (id === TERMINAL_ID) {
        terminal.write(data);
      }
    });

    // Send user input to PTY
    terminal.onData((data) => {
      window.terminal.write(TERMINAL_ID, data);
    });

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize to avoid too many calls
      requestAnimationFrame(() => {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          window.terminal.resize(TERMINAL_ID, cols, rows);
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    // Multiple fit attempts to ensure proper sizing
    const fitTerminal = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        window.terminal.resize(TERMINAL_ID, cols, rows);
      }
    };

    // Fit at different intervals to handle layout settling
    setTimeout(fitTerminal, 50);
    setTimeout(fitTerminal, 200);
    setTimeout(fitTerminal, 500);

    // Cleanup only on actual unmount (not strict mode re-run)
    return () => {
      // Don't cleanup in strict mode's first unmount
      // The component will be remounted immediately
    };
  }, [handleResize]);

  // Actual cleanup on window unload
  useEffect(() => {
    const cleanup = () => {
      if (terminalRef.current) {
        window.terminal.kill(TERMINAL_ID);
        terminalRef.current.dispose();
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, []);

  return (
    <div className="terminal-panel">
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}
