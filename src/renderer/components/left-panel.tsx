/**
 * Left Panel Component
 * Contains Terminal and Network tabs with resizable split
 * Terminal is always mounted to preserve PTY connection
 */
import { useState } from 'react';
import { TerminalPanel } from './terminal-panel';
import { NetworkPanel } from './network-panel';

type TabType = 'terminal' | 'network';

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
      </div>

      <div className="left-panel-content">
        {/* Terminal always mounted, hidden when not active */}
        <div style={{ display: activeTab === 'terminal' ? 'flex' : 'none', width: '100%', height: '100%' }}>
          <TerminalPanel />
        </div>
        {/* Network only mounted when active */}
        {activeTab === 'network' && <NetworkPanel />}
      </div>
    </div>
  );
}
