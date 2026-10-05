import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const DEFAULT_EVIDENCE = [
  'Solar current deviated first (02:09:40)',
  'Battery charge responded after 35 s',
  'Thermal response followed (02:11:08)',
  'Dependency graph supports causal direction'
];

export default function EvidenceList({ evidence = [] }) {
  const items = evidence.length > 0 ? evidence : DEFAULT_EVIDENCE;

  return (
    <div className="evidence-container">
      <h4 className="evidence-heading">Key Evidence</h4>
      <ul className="evidence-list">
        {items.map((item, idx) => (
          <li key={idx} className="evidence-item">
            <CheckCircle2 size={16} className="evidence-check-icon" />
            <span className="evidence-text">{typeof item === 'string' ? item : item.text || item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
