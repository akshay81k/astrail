import React from 'react';
import { FAULT_TYPES } from '../data/faultMetadata';

export default function FaultTypeSelector({ selectedFaultId, onSelectFault }) {
  return (
    <div className="card fault-selector-card">
      <div className="card-header-with-number">
        <div className="step-number">1</div>
        <div>
          <h2 className="card-step-title">Select Fault Type</h2>
          <p className="card-step-subtitle">Choose a fault to inject into the simulator</p>
        </div>
      </div>

      <div className="fault-cards-grid">
        {FAULT_TYPES.map((fault) => {
          const IconComponent = fault.icon;
          const isSelected = selectedFaultId === fault.id;

          return (
            <div
              key={fault.id}
              className={`fault-option-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectFault(fault.id)}
            >
              <div className="fault-card-top-row">
                <div className={`radio-circle ${isSelected ? 'checked' : ''}`}>
                  {isSelected && <div className="radio-inner-dot"></div>}
                </div>
                <div className={`fault-icon-circle ${fault.iconColorClass}`}>
                  <IconComponent size={20} />
                </div>
              </div>

              <div className="fault-card-content">
                <h4 className="fault-title">{fault.title}</h4>
                <p className="fault-desc">{fault.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
