/**
 * PTY Manager - Manages terminal shell processes via node-pty
 * Handles multiple terminal instances with unique IDs
 */
import * as pty from 'node-pty';
import os from 'os';
import fs from 'fs';

interface PtyInstance {
  process: pty.IPty;
  onDataCallback: (data: string) => void;
}

export class PtyManager {
  private instances: Map<string, PtyInstance> = new Map();

  /**
   * Find a valid shell on the system
   */
  private findShell(): string {
    if (os.platform() === 'win32') {
      return 'powershell.exe';
    }

    // Check shells in order of preference
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];

    for (const shell of shells) {
      try {
        if (fs.existsSync(shell)) {
          const stats = fs.statSync(shell);
          if (stats.isFile()) {
            console.log(`Found shell: ${shell}`);
            return shell;
          }
        }
      } catch {
        // Continue to next shell
      }
    }

    // Fallback
    return '/bin/sh';
  }

  /**
   * Create a new terminal instance
   */
  create(id: string, onData: (data: string) => void): void {
    // Kill existing instance if any
    this.kill(id);

    const shell = this.findShell();
    const shellArgs = os.platform() === 'win32' ? [] : ['-l'];
    const homeDir = os.homedir();

    console.log(`[PTY] Creating terminal ${id}`);
    console.log(`[PTY] Shell: ${shell}`);
    console.log(`[PTY] Home: ${homeDir}`);

    try {
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: homeDir,
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          HOME: homeDir,
          SHELL: shell,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: 'en_US.UTF-8',
          USER: process.env.USER || os.userInfo().username
        }
      });

      ptyProcess.onData(onData);

      ptyProcess.onExit(({ exitCode }) => {
        console.log(`[PTY] Terminal ${id} exited with code ${exitCode}`);
        this.instances.delete(id);
      });

      this.instances.set(id, {
        process: ptyProcess,
        onDataCallback: onData
      });

      console.log(`[PTY] Terminal ${id} created successfully`);
    } catch (error) {
      console.error(`[PTY] Failed to create terminal ${id}:`, error);
      // Send error message to terminal UI
      onData(`\r\n\x1b[31mError: Failed to spawn shell (${shell})\x1b[0m\r\n`);
      onData(`\x1b[33m${error}\x1b[0m\r\n`);
    }
  }

  /**
   * Write data to a terminal
   */
  write(id: string, data: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.process.write(data);
    }
  }

  /**
   * Resize a terminal
   */
  resize(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.process.resize(cols, rows);
    }
  }

  /**
   * Kill a terminal instance
   */
  kill(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.process.kill();
      this.instances.delete(id);
      console.log(`Terminal ${id} killed`);
    }
  }

  /**
   * Kill all terminal instances
   */
  killAll(): void {
    for (const [id] of this.instances) {
      this.kill(id);
    }
  }

  /**
   * Get active terminal count
   */
  getActiveCount(): number {
    return this.instances.size;
  }
}
