import React from 'react';
import { FAULT_TYPES, getSemanticSeverity } from '../data/faultMetadata';

export default function FaultPreview({
  selectedFaultId,
  severity,
  startOffsetSec,
  missingPct,
  delaySec
}) {
  const selectedFault =
    FAULT_TYPES.find((f) => f.id === selectedFaultId) || FAULT_TYPES[0];

  const IconComp = selectedFault.icon;
  const semantic = getSemanticSeverity(severity);

  return (
    <div className="card fault-preview-card">
      <div className="card-header-with-number">
        <div className="step-number">3</div>
        <div>
          <h2 className="card-step-title">Preview Summary</h2>
          <p className="card-step-subtitle">Review the fault configuration before injecting</p>
        </div>
      </div>

      <div className="preview-summary-box">
        <div className="preview-top-row">
          <div className="preview-title-group">
            <div className={`preview-icon-circle ${selectedFault.iconColorClass}`}>
              <IconComp size={22} />
            </div>
            <h3 className="preview-fault-title">{selectedFault.title}</h3>
          </div>
          <span className={`semantic-badge badge-${semantic.colorClass}`}>
            {semantic.label}
          </span>
        </div>

        <div className="preview-details-list">
          <div className="preview-detail-row">
            <span className="detail-label">Severity</span>
            <span className="detail-value">{severity}%</span>
          </div>

          <div className="preview-detail-row">
            <span className="detail-label">Start in</span>
            <span className="detail-value">{startOffsetSec} seconds</span>
          </div>

          <div className="preview-detail-row">
            <span className="detail-label">Missing data</span>
            <span className="detail-value">{missingPct}%</span>
          </div>

          <div className="preview-detail-row">
            <span className="detail-label">Delay</span>
            <span className="detail-value">{delaySec} seconds</span>
          </div>

          <div className="preview-detail-row expected-effect-row">
            <span className="detail-label">Expected effect</span>
            <span className="detail-value-effect">{selectedFault.expectedEffect}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
