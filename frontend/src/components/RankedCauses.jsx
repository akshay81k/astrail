import React from 'react';
import { Target, ChevronRight } from 'lucide-react';

const DEFAULT_CAUSES = [
  { id: 'c1', rank: 1, title: 'Solar array degradation', percentage: 87, nodeId: 'solar', active: true },
  { id: 'c2', rank: 2, title: 'Battery cell fault', percentage: 8, nodeId: 'battery' },
  { id: 'c3', rank: 3, title: 'Heater stuck on', percentage: 5, nodeId: 'thermal' }
];

export default function RankedCauses({ causes = [], onCauseSelect }) {
  const displayCauses = causes.length > 0 ? causes : DEFAULT_CAUSES;

  return (
    <div className="card ranked-causes-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <Target size={18} className="title-icon" /> Ranked Causes
        </h2>
      </div>

      <div className="ranked-causes-list">
        {displayCauses.map((item, idx) => {
          const rankNum = item.rank || idx + 1;
          const pct = item.percentage !== undefined ? item.percentage : Math.round((item.posterior || 0.87) * 100);
          const isTop = rankNum === 1;

          return (
            <div
              key={item.id || idx}
              className={`ranked-cause-item ${isTop ? 'top-cause' : ''}`}
              onClick={() => onCauseSelect && onCauseSelect(item)}
            >
              <div className="cause-rank-num">{rankNum}.</div>
              <div className="cause-main-info">
                <div className="cause-title-row">
                  <span className="cause-name">{item.title || item.hypothesis}</span>
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
    </div>
  );
}
