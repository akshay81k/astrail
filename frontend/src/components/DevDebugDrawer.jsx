import React, { useState } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { Terminal, X, Copy, Check } from 'lucide-react';

export default function DevDebugDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('incident'); // 'incident' or 'telemetry'
  const [copied, setCopied] = useState(false);

  const { lastIncidentRaw, lastTelemetryFrameRaw } = useTelemetry();

  const handleCopy = (content) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayedContent =
    activeTab === 'incident'
      ? lastIncidentRaw || { message: 'No incident received yet in this session.' }
      : lastTelemetryFrameRaw || { message: 'No raw WebSocket telemetry frame received yet in this session.' };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        id="dev-debug-toggle-btn"
        className="dev-debug-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Developer & Debug Raw State Drawer"
      >
        <Terminal size={14} />
        <span>Dev / Debug</span>
      </button>

      {/* Drawer Overlay & Panel */}
      {isOpen && (
        <div className="dev-debug-overlay" onClick={() => setIsOpen(false)}>
          <div className="dev-debug-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <Terminal size={18} className="text-cyan" />
                <h3 className="drawer-title">Developer &amp; Telemetry Debug Inspector</h3>
              </div>
              <button className="btn-drawer-close" onClick={() => setIsOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-tabs">
              <button
                className={`drawer-tab-btn ${activeTab === 'incident' ? 'active' : ''}`}
                onClick={() => setActiveTab('incident')}
              >
                Raw Last Incident JSON
              </button>
              <button
                className={`drawer-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
                onClick={() => setActiveTab('telemetry')}
              >
                Raw Last Telemetry Frame
              </button>
              <button
                className="btn-copy-raw"
                onClick={() => handleCopy(displayedContent)}
                title="Copy JSON to clipboard"
              >
                {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="drawer-body">
              <pre className="raw-json-viewer">
                {JSON.stringify(displayedContent, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
