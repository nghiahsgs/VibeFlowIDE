/**
 * Settings Panel Component
 * Configure project context/system prompt for Claude Code
 */
import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    settings: {
      getContext: () => Promise<{ prompt: string; updatedAt: number } | null>;
      setContext: (prompt: string) => Promise<boolean>;
      getAllContexts: () => Promise<Record<string, { prompt: string; updatedAt: number }>>;
      deleteContext: (cwd: string) => Promise<boolean>;
      onContextUpdated: (callback: (data: { cwd: string; context: { prompt: string; updatedAt: number } }) => void) => () => void;
    };
  }
}

export function SettingsPanel() {
  const [prompt, setPrompt] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current context on mount
  useEffect(() => {
    const loadContext = async () => {
      try {
        const context = await window.settings.getContext();
        if (context) {
          setPrompt(context.prompt);
          setSavedPrompt(context.prompt);
          setLastUpdated(context.updatedAt);
        }
      } catch (err) {
        console.error('Failed to load context:', err);
      }
    };

    loadContext();

    // Listen for updates from MCP
    const unsubscribe = window.settings.onContextUpdated((data) => {
      setPrompt(data.context.prompt);
      setSavedPrompt(data.context.prompt);
      setLastUpdated(data.context.updatedAt);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = useCallback(async () => {
    if (!prompt.trim() || prompt === savedPrompt) return;

    setSaving(true);
    try {
      await window.settings.setContext(prompt);
      setSavedPrompt(prompt);
      setLastUpdated(Date.now());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save context:', err);
    } finally {
      setSaving(false);
    }
  }, [prompt, savedPrompt]);

  const handleClear = useCallback(async () => {
    if (!window.confirm('Clear the project context?')) return;

    try {
      await window.settings.setContext('');
      setPrompt('');
      setSavedPrompt('');
      setLastUpdated(null);
    } catch (err) {
      console.error('Failed to clear context:', err);
    }
  }, []);

  const hasChanges = prompt !== savedPrompt;

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3>Project Context</h3>
        <p className="settings-hint">
          Configure system prompt/context for Claude Code. Claude can retrieve this via <code>get_project_context</code> tool.
        </p>
      </div>

      <div className="settings-content">
        <div className="prompt-section">
          <label htmlFor="system-prompt">System Prompt / Instructions</label>
          <textarea
            id="system-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter instructions or context for Claude Code...

Example:
- This is a React + TypeScript project
- Use functional components with hooks
- Follow existing code patterns
- Write tests for new features"
            rows={12}
          />
        </div>

        <div className="settings-actions">
          <button
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={saving || !hasChanges || !prompt.trim()}
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Context'}
          </button>
          {savedPrompt && (
            <button className="clear-btn" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>

        {lastUpdated && (
          <p className="last-updated">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>

      <div className="settings-info">
        <h4>How to use</h4>
        <ol className="usage-steps">
          <li>Enter your project instructions above</li>
          <li>Click "Save Context"</li>
          <li>In Claude Code, call <code>get_project_context</code> to retrieve it</li>
          <li>Or ask Claude: "Get project context first"</li>
        </ol>

        <div className="tip-box">
          <strong>Tip:</strong> Context is stored per project (CWD). Different projects can have different contexts.
        </div>
      </div>
    </div>
  );
}
