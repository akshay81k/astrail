import React from 'react';
import { Target, ChevronRight } from 'lucide-react';

const DEFAULT_CAUSES = [
  { id: 'c1', rank: 1, title: 'Solar array degradation', percentage: 87, nodeId: 'solar', active: true },
  { id: 'c2', rank: 2, title: 'Battery cell fault', percentage: 8, nodeId: 'battery' },
  { id: 'c3', rank: 3, title: 'Heater stuck on', percentage: 5, nodeId: 'thermal' }
];

export default function RankedCauses({ causes = [], onCauseSelect }) {
  const isInconclusive = Array.isArray(causes) && causes.length === 0;
  const displayCauses = isInconclusive ? [] : (causes.length > 0 ? causes : DEFAULT_CAUSES);

  return (
    <div className="card ranked-causes-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Target size={18} className="title-icon" /> Ranked Causes
        </h2>
      </div>

      {displayCauses.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "#94a3b8", fontSize: "0.875rem" }}>
          No high-confidence root cause hypotheses found (&lt;50% posterior threshold).
        </div>
      ) : (
        <div className="ranked-causes-list">
          {displayCauses.map((item, idx) => {
            const rankNum = item.rank || idx + 1;
            const rawScore = item.percentage != null
              ? item.percentage
              : item.confidence != null
              ? (item.confidence <= 1 ? item.confidence * 100 : item.confidence)
              : item.score != null
              ? (item.score <= 1 ? item.score * 100 : item.score)
              : item.posterior != null
              ? (item.posterior <= 1 ? item.posterior * 100 : item.posterior)
              : 82;
            const pct = Math.round(rawScore);
            const isTop = rankNum === 1;
            const causeTitle = item.title || item.hypothesis || item.subsystem || item.name || `Hypothesis #${rankNum}`;

            return (
              <div
                key={item.id || idx}
                className={`ranked-cause-item ${isTop ? 'top-cause' : ''}`}
                onClick={() => onCauseSelect && onCauseSelect(item)}
              >
                <div className="cause-rank-num">{rankNum}.</div>
                <div className="cause-main-info">
                  <div className="cause-title-row">
                    <span className="cause-name">{causeTitle}</span>
                    <span className="cause-pct">{pct < 10 ? `0${pct}%` : `${pct}%`}</span>
                  </div>
                  <div className="cause-bar-track">
                    <div
                      className={`cause-bar-fill ${isTop ? 'fill-red' : 'fill-blue'}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
                <ChevronRight size={16} className="cause-arrow" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
