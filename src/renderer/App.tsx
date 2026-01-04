/**
 * Main App Component
 * Layout: Left (Terminal + Network) | Right (Browser)
 */
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { LeftPanel } from './components/left-panel';
import { BrowserPanel } from './components/browser-panel';
import './styles/app.css';

export default function App() {
  return (
    <div className="app">
      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={40} minSize={25} className="panel">
          <LeftPanel />
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={60} minSize={30} className="panel">
          <BrowserPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
