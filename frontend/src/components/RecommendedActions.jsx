import React from 'react';
import { Wrench, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function RecommendedActions({ actions = [] }) {
  const displayActions = Array.isArray(actions) && actions.length > 0 ? actions : [];

  return (
    <div className="card recommended-actions-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Wrench size={18} className="title-icon" /> Operational Mitigations (Mapped from Risk Rules)
        </h2>
      </div>

      {displayActions.length === 0 ? (
        <div className="actions-list">
          <div className="action-card-item">
            <div className="action-number-badge">1</div>
            <div className="action-info">
              <h4 className="action-title">RULE_000: Nominal Real-time Telemetry Polling</h4>
              <p className="action-desc">
                No active rule threshold breached. Continue polling multi-channel telemetry streams at standard 1 Hz cadence.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="actions-list">
          {displayActions.map((act, idx) => {
            const ruleId = act.rule_id || `RULE_00${idx + 1}`;
            const risk = (act.risk || 'HIGH').toUpperCase();
            const subsystem = act.subsystem || 'SYSTEM';
            const signal = act.signal || 'telemetry_bus';
            const actionText = act.action || act.title || act.description;

            return (
              <div key={act.id || idx} className={`action-card-item risk-${risk.toLowerCase()}`}>
                <div className="action-top-bar">
                  <span className="rule-id-badge">{ruleId}</span>
                  <span className="rule-subsystem-badge">{subsystem}</span>
                  <span className="rule-signal-badge"><code>{signal}</code></span>
                  <span className={`risk-level-tag risk-${risk.toLowerCase()}`}>{risk} RISK</span>
                </div>

                <div className="action-info" style={{ marginTop: '8px' }}>
                  <h4 className="action-title">{actionText}</h4>
                  {act.description && act.description !== actionText && (
                    <p className="action-desc">{act.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
