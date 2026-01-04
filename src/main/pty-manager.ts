/**
 * PTY Manager - Manages terminal shell processes via node-pty
 * Handles multiple terminal instances with unique IDs
 */
import * as pty from 'node-pty';
import os from 'os';

interface PtyInstance {
  process: pty.IPty;
  onDataCallback: (data: string) => void;
}

export class PtyManager {
  private instances: Map<string, PtyInstance> = new Map();

  /**
   * Create a new terminal instance
   */
  create(id: string, onData: (data: string) => void): void {
    // Kill existing instance if any
    this.kill(id);

    // Use full path for shell to avoid posix_spawnp issues
    let shell: string;
    let shellArgs: string[] = [];

    if (os.platform() === 'win32') {
      shell = 'powershell.exe';
    } else {
      // Try to find a valid shell
      const possibleShells = [
        process.env.SHELL,
        '/bin/zsh',
        '/bin/bash',
        '/bin/sh'
      ].filter(Boolean) as string[];

      shell = possibleShells[0] || '/bin/sh';
      shellArgs = ['-l']; // Login shell
    }

    console.log(`Spawning shell: ${shell} with args: ${shellArgs.join(' ')}`);

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8',
        HOME: os.homedir(),
        SHELL: shell
      } as { [key: string]: string }
    });

    ptyProcess.onData(onData);

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`Terminal ${id} exited with code ${exitCode}`);
      this.instances.delete(id);
    });

    this.instances.set(id, {
      process: ptyProcess,
      onDataCallback: onData
    });

    console.log(`Terminal ${id} created with shell: ${shell}`);
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
