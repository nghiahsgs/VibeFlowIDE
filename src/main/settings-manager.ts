/**
 * Settings Manager
 * Handles persistent storage for project context/system prompt
 * Stores settings in ~/.vibeflow-settings.json
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrowserWindow } from 'electron';

const SETTINGS_FILE = path.join(os.homedir(), '.vibeflow-settings.json');

export interface ProjectContext {
  prompt: string;
  updatedAt: number;
}

export interface VibeFlowSettings {
  // Key is project CWD
  contexts: Record<string, ProjectContext>;
  // Global default context (when no project-specific context)
  defaultContext?: ProjectContext;
}

export class SettingsManager {
  private settings: VibeFlowSettings = { contexts: {} };
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow || null;
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        this.settings = JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { contexts: {} };
    }
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * Get project context for current working directory
   * Falls back to default context if no project-specific one exists
   */
  getContext(cwd?: string): ProjectContext | null {
    const projectCwd = cwd || process.cwd();

    // Check for project-specific context
    if (this.settings.contexts[projectCwd]) {
      return this.settings.contexts[projectCwd];
    }

    // Check for parent directory contexts (useful for monorepos)
    for (const [contextCwd, context] of Object.entries(this.settings.contexts)) {
      if (projectCwd.startsWith(contextCwd + '/')) {
        return context;
      }
    }

    // Fall back to default
    return this.settings.defaultContext || null;
  }

  /**
   * Set project context for current working directory
   */
  setContext(prompt: string, cwd?: string): void {
    const projectCwd = cwd || process.cwd();

    this.settings.contexts[projectCwd] = {
      prompt,
      updatedAt: Date.now()
    };

    this.saveSettings();

    // Notify renderer of update
    this.mainWindow?.webContents.send('settings:context-updated', {
      cwd: projectCwd,
      context: this.settings.contexts[projectCwd]
    });
  }

  /**
   * Set default context (used when no project-specific context)
   */
  setDefaultContext(prompt: string): void {
    this.settings.defaultContext = {
      prompt,
      updatedAt: Date.now()
    };
    this.saveSettings();
  }

  /**
   * Get all contexts (for settings UI)
   */
  getAllContexts(): Record<string, ProjectContext> {
    return { ...this.settings.contexts };
  }

  /**
   * Delete context for a specific project
   */
  deleteContext(cwd: string): void {
    delete this.settings.contexts[cwd];
    this.saveSettings();
  }

  /**
   * Get raw settings
   */
  getSettings(): VibeFlowSettings {
    return { ...this.settings };
  }
}
