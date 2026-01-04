/**
 * Left Panel Component
 * Contains Terminal, Network, Console, Ports, and MCP tabs
 * Terminal is always mounted to preserve PTY connection
 */
import { useState } from 'react';
import { TerminalPanel } from './terminal-panel';
import { NetworkPanel } from './network-panel';
import { ConsolePanel } from './console-panel';
import { MCPPanel } from './mcp-panel';
import { PortsPanel } from './ports-panel';

type TabType = 'terminal' | 'network' | 'console' | 'ports' | 'mcp';

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('terminal');

  return (
    <div className="left-panel">
      <div className="left-panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          Terminal
        </button>
        <button
          className={`tab-btn ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
        >
          Network
        </button>
        <button
          className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`}
          onClick={() => setActiveTab('console')}
        >
          Console
        </button>
        <button
          className={`tab-btn ${activeTab === 'ports' ? 'active' : ''}`}
          onClick={() => setActiveTab('ports')}
        >
          Ports
        </button>
        <button
          className={`tab-btn ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp')}
        >
          MCP
        </button>
      </div>

      <div className="left-panel-content">
        {/* Terminal always mounted, hidden when not active */}
        <div style={{ display: activeTab === 'terminal' ? 'flex' : 'none', width: '100%', height: '100%' }}>
          <TerminalPanel />
        </div>
        {/* Network only mounted when active */}
        {activeTab === 'network' && <NetworkPanel />}
        {/* Console panel */}
        {activeTab === 'console' && <ConsolePanel />}
        {/* Ports panel */}
        {activeTab === 'ports' && <PortsPanel />}
        {/* MCP panel */}
        {activeTab === 'mcp' && <MCPPanel />}
      </div>
    </div>
  );
}
