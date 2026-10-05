import React from 'react';
import { FileText } from 'lucide-react';

export default function IncidentExplanation({ explanation }) {
  const title = explanation?.title || 'Why Solar Array?';
  const text =
    explanation?.text ||
    explanation?.evidence ||
    'Solar current fell 18% below forecast at 02:09:40, then battery charge dropped 35 seconds later and battery temperature rose 6°C at 02:11:08. The solar array deviated first and the dependency graph links it to both downstream signals.';

  return (
    <div className="card explanation-card">
      <div className="card-header-row">
        <h2 className="card-title">
          <FileText size={18} className="title-icon" /> {title}
        </h2>
      </div>
      <div className="explanation-body">
        <p className="explanation-text">{text}</p>
      </div>
    </div>
  );
}
