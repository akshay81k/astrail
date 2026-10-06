import React from 'react';
import { Wrench, ChevronRight } from 'lucide-react';

const DEFAULT_ACTIONS = [
  {
    id: 1,
    number: 1,
    title: 'Reduce non-essential load',
    description: 'Lower payload and auxiliary systems load to reduce power demand.'
  },
  {
    id: 2,
    number: 2,
    title: 'Check heater status',
    description: 'Verify heater control signals and switch to redundant heater if available.'
  },
  {
    id: 3,
    number: 3,
    title: 'Enter safe mode if it persists > 10 min',
    description: 'If temperature continues to rise, enter safe mode to prevent further damage.'
  }
];

export default function RecommendedActions({ actions = [] }) {
  const isInconclusive = Array.isArray(actions) && actions.length === 0;
  const displayActions = isInconclusive ? [] : (actions.length > 0 ? actions : DEFAULT_ACTIONS);

  return (
    <div className="card recommended-actions-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Wrench size={18} className="title-icon" /> Recommended Actions
        </h2>
      </div>

      {displayActions.length === 0 ? (
        <div className="actions-list">
          <div className="action-card-item">
            <div className="action-number-badge">1</div>
            <div className="action-info">
              <h4 className="action-title">Monitor Real-time Telemetry Stream</h4>
              <p className="action-desc">Inspect multi-channel telemetry trends and verify sensor transducer stability.</p>
            </div>
          </div>
          <div className="action-card-item">
            <div className="action-number-badge">2</div>
            <div className="action-info">
              <h4 className="action-title">Check Redundant Transducers</h4>
              <p className="action-desc">Compare readings across analytical redundancy channels to rule out isolated transducer noise.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="actions-list">
          {displayActions.map((act, idx) => {
            const num = act.number || act.rank || idx + 1;
            return (
              <div key={act.id || idx} className="action-card-item">
                <div className="action-number-badge">{num}</div>
                <div className="action-info">
                  <h4 className="action-title">{act.title || act.action}</h4>
                  <p className="action-desc">{act.description || act.rationale}</p>
                </div>
                <ChevronRight size={16} className="action-arrow" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
