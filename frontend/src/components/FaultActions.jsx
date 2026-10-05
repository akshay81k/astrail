import React from 'react';
import { Zap, Dices, CheckCircle2, AlertCircle } from 'lucide-react';

export default function FaultActions({
  onInjectFault,
  onInjectRandomFault,
  injecting,
  injectSuccess,
  errorMsg
}) {
  return (
    <div className="card fault-actions-card">
      <div className="card-header-with-number">
        <div className="step-number">5</div>
        <div>
          <h2 className="card-step-title">Actions</h2>
          <p className="card-step-subtitle">Inject the configured fault or generate a random fault</p>
        </div>
      </div>

      {errorMsg && (
        <div className="action-error-banner">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {injectSuccess && (
        <div className="action-success-banner" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>Fault injected &amp; actively altering telemetry dynamics!</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <a
              href="/"
              style={{
                fontSize: '12px',
                color: '#3b82f6',
                textDecoration: 'underline',
                fontWeight: 600
              }}
            >
              📊 Observe Live Graphs on Dashboard &rarr;
            </a>
            <a
              href="/incidents"
              style={{
                fontSize: '12px',
                color: '#ef4444',
                textDecoration: 'underline',
                fontWeight: 600
              }}
            >
              ⚠️ View In Incidents &rarr;
            </a>
          </div>
        </div>
      )}

      <div className="actions-button-group">
        <button
          className="btn-inject-primary"
          onClick={onInjectFault}
          disabled={injecting}
        >
          <Zap size={18} />
          <span>{injecting ? 'Injecting...' : 'Inject Fault'}</span>
        </button>

        <button
          className="btn-random-secondary"
          onClick={onInjectRandomFault}
          disabled={injecting}
        >
          <Dices size={18} />
          <span>Random Fault</span>
        </button>
      </div>
    </div>
  );
}
