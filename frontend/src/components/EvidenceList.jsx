import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const DEFAULT_EVIDENCE = [
  'Solar current deviated first (02:09:40)',
  'Battery charge responded after 35 s',
  'Thermal response followed (02:11:08)',
  'Dependency graph supports causal direction'
];

export default function EvidenceList({ evidence = [] }) {
  const isInconclusive = Array.isArray(evidence) && evidence.length === 0;
  const items = isInconclusive ? [] : (evidence.length > 0 ? evidence : DEFAULT_EVIDENCE);

  return (
    <div className="evidence-container">
      <h4 className="evidence-heading">Key Evidence</h4>
      {items.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: "0.85rem", padding: "8px 0" }}>
          Cross-channel statistical residual was elevated without clear subsystem DAG localization.
        </div>
      ) : (
        <ul className="evidence-list">
          {items.map((item, idx) => (
            <li key={idx} className="evidence-item">
              <CheckCircle2 size={16} className="evidence-check-icon" />
              <span className="evidence-text">{typeof item === 'string' ? item : item.text || item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
