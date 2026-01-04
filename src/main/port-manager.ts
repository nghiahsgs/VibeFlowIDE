/**
 * Port Manager - Scans listening ports and kills processes
 * Uses lsof for port scanning and kill signals for termination
 */
import { execSync } from 'child_process';
import os from 'os';

export interface PortProcess {
  pid: number;
  name: string;
  port: number;
  type: string;
  cwd?: string;
}

// System processes to hide (not useful for devs)
const SYSTEM_PROCESS_BLACKLIST = new Set([
  'ControlCe',
  'rapportd',
  'sharingd',
  'WiFiAgent',
  'bluetoothd',
  'airportd',
  'identityservicesd',
  'UserEventAgent',
  'mDNSResponder',
  'netbiosd'
]);

// Helper process patterns to filter
const HELPER_PATTERNS = ['Code\\x20H', 'Electron', 'Helper'];

export class PortManager {
  /**
   * Scan all listening TCP ports
   */
  async scanPorts(): Promise<PortProcess[]> {
    try {
      const output = execSync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null', {
        encoding: 'utf8',
        timeout: 5000
      });
      return this.parseLsofOutput(output);
    } catch (error) {
      // lsof returns exit code 1 if no listening ports
      if ((error as { status?: number }).status === 1) {
        return [];
      }
      console.error('[PortManager] Scan failed:', error);
      return [];
    }
  }

  /**
   * Parse lsof output to extract process info
   */
  private parseLsofOutput(output: string): PortProcess[] {
    const processes: PortProcess[] = [];
    const seenPorts = new Set<number>();
    const lines = output.split('\n');

    // Skip header line
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const name = parts[0];
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;

      // Skip system/helper processes
      if (this.isSystemProcess(name)) continue;

      // Extract port from address (format: *:3000 or 127.0.0.1:3000)
      const addressPart = parts[parts.length - 2];
      const port = this.extractPort(addressPart);
      if (!port || seenPorts.has(port)) continue;
      seenPorts.add(port);

      // Determine process type
      const type = this.getProcessType(name);

      // Get working directory
      const cwd = this.getProcessCwd(pid);

      processes.push({ pid, name, port, type, cwd });
    }

    // Sort by port number
    return processes.sort((a, b) => a.port - b.port);
  }

  /**
   * Extract port number from lsof address string
   */
  private extractPort(address: string): number | null {
    const parts = address.split(':');
    const portStr = parts[parts.length - 1]?.replace('(LISTEN)', '').trim();
    const port = parseInt(portStr, 10);
    return isNaN(port) ? null : port;
  }

  /**
   * Check if process is a system/helper process
   */
  private isSystemProcess(name: string): boolean {
    if (SYSTEM_PROCESS_BLACKLIST.has(name)) return true;
    return HELPER_PATTERNS.some(p => name.includes(p));
  }

  /**
   * Get process type based on name
   */
  private getProcessType(name: string): string {
    const lower = name.toLowerCase();
    if (lower === 'node' || lower.includes('node')) return 'node';
    if (lower.startsWith('python')) return 'python';
    if (lower === 'docker' || lower.startsWith('com.docker')) return 'docker';
    if (lower.startsWith('postgres')) return 'postgres';
    if (lower.includes('redis')) return 'redis';
    if (lower === 'go') return 'go';
    if (lower === 'java' || lower.includes('java')) return 'java';
    if (lower === 'ruby' || lower.startsWith('ruby')) return 'ruby';
    if (lower === 'nginx') return 'nginx';
    if (lower.includes('cargo') || lower.includes('rustc')) return 'rust';
    if (lower === 'php' || lower.startsWith('php')) return 'php';
    return 'unknown';
  }

  /**
   * Get working directory of a process
   */
  private getProcessCwd(pid: number): string | undefined {
    try {
      if (os.platform() === 'darwin') {
        const output = execSync(`lsof -p ${pid} 2>/dev/null | grep ' cwd '`, {
          encoding: 'utf8',
          timeout: 2000
        });
        const parts = output.split(/\s+/);
        return parts[parts.length - 1]?.trim();
      } else if (os.platform() === 'linux') {
        return execSync(`readlink -f /proc/${pid}/cwd 2>/dev/null`, {
          encoding: 'utf8',
          timeout: 1000
        }).trim();
      }
    } catch {
      // Silently fail - cwd is optional
    }
    return undefined;
  }

  /**
   * Kill a process by PID
   * First tries SIGTERM (graceful), then SIGKILL (force)
   */
  async killProcess(pid: number): Promise<boolean> {
    try {
      // Send SIGTERM first
      process.kill(pid, 'SIGTERM');

      // Wait 500ms for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if still running
      if (this.isProcessRunning(pid)) {
        // Force kill with SIGKILL
        process.kill(pid, 'SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return !this.isProcessRunning(pid);
    } catch (error) {
      console.error(`[PortManager] Kill failed for PID ${pid}:`, error);
      return false;
    }
  }

  /**
   * Kill process on a specific port
   */
  async killPort(port: number): Promise<boolean> {
    const processes = await this.scanPorts();
    const target = processes.find(p => p.port === port);
    if (!target) return false;
    return this.killProcess(target.pid);
  }

  /**
   * Check if a process is still running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
