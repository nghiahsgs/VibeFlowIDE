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

  // Handle terminal resize
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;
      window.terminal.resize(TERMINAL_ID, cols, rows);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

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

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

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
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      window.terminal.kill(TERMINAL_ID);
      terminal.dispose();
    };
  }, [handleResize]);

  return (
    <div className="terminal-panel">
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}
