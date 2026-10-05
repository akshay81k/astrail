import React from 'react';
import { Lightbulb, CheckCircle2 } from 'lucide-react';

const DEFAULT_EVIDENCE = [
  'Temperature trend deviated from expected behavior',
  'Anomaly score crossed detection threshold (0.87 > 0.45)',
  'Hard limit had not yet been crossed at our system alert',
  'Conventional alarm triggered later when temperature exceeded 45°C'
];

export default function ComparisonExplanation() {
  return (
    <div className="card comparison-explanation-card">
      <div className="card-header-row">
        <div className="title-row">
          <Lightbulb size={18} className="title-icon icon-yellow" />
          <h3 className="card-title">Why Earlier?</h3>
        </div>
      </div>

      <div className="explanation-body-text">
        <p>
          ASTRAIL detected an abnormal increase in battery temperature based on the trend and multi-sensor analysis, well before the temperature crossed the conventional hard safety limit. The traditional limit checking system only generated an alarm after the threshold was exceeded.
        </p>
      </div>

      <div className="key-evidence-sub-section">
        <h4 className="evidence-sub-title">
          <CheckCircle2 size={16} className="text-green" /> Key Evidence
        </h4>
        <ul className="evidence-checklist">
          {DEFAULT_EVIDENCE.map((item, idx) => (
            <li key={idx} className="evidence-check-item">
              <CheckCircle2 size={15} className="check-icon" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
