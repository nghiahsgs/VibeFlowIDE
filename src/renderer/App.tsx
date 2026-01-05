/**
 * Main App Component
 * Layout: Left (Terminal + Network) | Center (Browser) | Right (Simulator - optional)
 */
import { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { LeftPanel } from './components/left-panel';
import { BrowserPanel } from './components/browser-panel';
import { SimulatorPanel } from './components/simulator-panel';
import './styles/app.css';

export default function App() {
  const [showSimulator, setShowSimulator] = useState(false);

  return (
    <div className="app">
      {/* Toggle Button for Simulator */}
      <button
        className={`simulator-toggle ${showSimulator ? 'active' : ''}`}
        onClick={() => setShowSimulator(!showSimulator)}
        title={showSimulator ? 'Hide Simulator' : 'Show Simulator'}
      >
        📱
      </button>

      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={showSimulator ? 30 : 40} minSize={20} className="panel">
          <LeftPanel />
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={showSimulator ? 40 : 60} minSize={25} className="panel">
          <BrowserPanel />
        </Panel>

        {showSimulator && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel defaultSize={30} minSize={20} className="panel">
              <SimulatorPanel />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
