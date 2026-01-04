/**
 * Left Panel Component
 * Contains Terminal and Network tabs with resizable split
 */
import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { TerminalPanel } from './terminal-panel';
import { NetworkPanel } from './network-panel';

type TabType = 'terminal' | 'network' | 'split';

export function LeftPanel() {
  const [viewMode, setViewMode] = useState<TabType>('split');

  return (
    <div className="left-panel">
      <div className="left-panel-tabs">
        <button
          className={`tab-btn ${viewMode === 'terminal' ? 'active' : ''}`}
          onClick={() => setViewMode('terminal')}
        >
          Terminal
        </button>
        <button
          className={`tab-btn ${viewMode === 'network' ? 'active' : ''}`}
          onClick={() => setViewMode('network')}
        >
          Network
        </button>
        <button
          className={`tab-btn ${viewMode === 'split' ? 'active' : ''}`}
          onClick={() => setViewMode('split')}
          title="Split view"
        >
          ⊞
        </button>
      </div>

      <div className="left-panel-content">
        {viewMode === 'terminal' && <TerminalPanel />}
        {viewMode === 'network' && <NetworkPanel />}
        {viewMode === 'split' && (
          <PanelGroup direction="vertical">
            <Panel defaultSize={50} minSize={20}>
              <TerminalPanel />
            </Panel>
            <PanelResizeHandle className="resize-handle-horizontal" />
            <Panel defaultSize={50} minSize={20}>
              <NetworkPanel />
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
