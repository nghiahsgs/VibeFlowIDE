/**
 * Main App Component
 * Split view layout with Terminal and Browser panels
 */
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { TerminalPanel } from './components/terminal-panel';
import { BrowserPanel } from './components/browser-panel';
import './styles/app.css';

export default function App() {
  return (
    <div className="app">
      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={50} minSize={20} className="panel">
          <TerminalPanel />
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={50} minSize={20} className="panel">
          <BrowserPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
