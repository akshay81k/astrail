import React from 'react';
import { FileText } from 'lucide-react';

export default function IncidentExplanation({ explanation, rootCause }) {
  const topSub = rootCause?.root_cause_candidates?.[0]?.subsystem || 'Root Subsystem';
  const title = explanation?.title || `Why ${topSub}?`;
  const text =
    explanation?.headline ||
    explanation?.text ||
    explanation?.evidence ||
    'Anomaly residuals exceeded calibrated P99 conformal threshold across telemetry channels. Dependency DAG and temporal onset order isolate the primary upstream root cause.';

  return (
    <div className="card explanation-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <FileText size={18} className="title-icon" /> {title}
        </h2>
      </div>
      <div className="explanation-body">
        <p className="explanation-text">{text}</p>
        {explanation?.action && (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', borderLeft: '3px solid #ef4444' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f87171' }}>Recommended FMEA Action: </span>
            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{explanation.action}</span>
          </div>
        )}
      </div>
    </div>
  );
}
