/**
 * MCP Panel Component
 * Shows MCP server config and instructions for Claude Code
 */
import { useState } from 'react';

export function MCPPanel() {
  const [copied, setCopied] = useState(false);

  // Config for Claude Code MCP
  const configString = `{
  "mcpServers": {
    "vibeflow-browser": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server/index.ts"],
      "cwd": "~/Documents/GitHub/VibeFlowIDE"
    }
  }
}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="mcp-panel">
      <div className="mcp-status">
        <div className="status-row">
          <span className="status-label">MCP Bridge:</span>
          <span className="status-badge connected">Running</span>
        </div>
        <div className="status-row">
          <span className="status-label">Port:</span>
          <span className="status-value">9876</span>
        </div>
      </div>

      <div className="mcp-section">
        <h3>Claude Code Config</h3>
        <p className="mcp-hint">Add to ~/.claude.json or run /mcp in Claude Code:</p>

        <div className="config-block">
          <pre>{configString}</pre>
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
        <p className="mcp-hint" style={{ marginTop: '8px', color: '#e5e510' }}>
          ⚠️ Update "cwd" path to your VibeFlowIDE location
        </p>
      </div>

      <div className="mcp-section">
        <h3>Available Tools</h3>
        <ul className="tools-list">
          <li><code>browser_screenshot</code> - Take screenshot</li>
          <li><code>browser_navigate</code> - Navigate to URL</li>
          <li><code>browser_click</code> - Click element</li>
          <li><code>browser_type_text</code> - Type in input</li>
          <li><code>browser_get_dom</code> - Get DOM HTML</li>
          <li><code>browser_get_url</code> - Get current URL</li>
          <li><code>browser_evaluate_js</code> - Run JavaScript</li>
          <li><code>browser_get_console_logs</code> - Get logs</li>
        </ul>
      </div>

      <div className="mcp-section">
        <h3>Quick Start</h3>
        <ol className="steps-list">
          <li>Copy the config above</li>
          <li>In Claude Code terminal, run: <code>/mcp add</code></li>
          <li>Paste the config when prompted</li>
          <li>Restart Claude Code session</li>
          <li>Ask Claude to use browser tools!</li>
        </ol>
      </div>
    </div>
  );
}
