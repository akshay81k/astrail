import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Rocket,
  CheckCircle,
  AlertCircle,
  Sun,
  Flame,
  Battery,
  Radio,
  Disc,
  ChevronDown
} from 'lucide-react';
import { FAULT_TYPES } from '../../data/faultMetadata';

const iconMap = {
  solar_degradation: Sun,
  heater_stuck_on: Flame,
  battery_degradation: Battery,
  sensor_drift: Radio,
  sensor_spike: Zap,
  wheel_friction: Disc
};

export default function FaultControlPanel({
  selectedFaultId,
  onSelectFault,
  severityPct,
  onChangeSeverity,
  startMode,
  onChangeStartMode,
  delaySec,
  onChangeDelaySec,
  durationMode,
  onChangeDurationMode,
  tempDurationSec,
  onChangeTempDurationSec,
  onInjectFault,
  injecting,
  injectSuccess,
  feedbackText,
  errorMsg
}) {
  const currentSeverityTier =
    severityPct < 40 ? 'LOW' : severityPct < 75 ? 'MEDIUM' : 'HIGH';

  const handleSeveritySegment = (tier) => {
    if (tier === 'LOW') onChangeSeverity(25);
    else if (tier === 'MEDIUM') onChangeSeverity(48);
    else if (tier === 'HIGH') onChangeSeverity(85);
  };

  const selectedFault =
    FAULT_TYPES.find((f) => f.id === selectedFaultId) || FAULT_TYPES[0];
  const SelectedIcon = iconMap[selectedFault.id] || Zap;

  return (
    <div className="fault-control-panel-card">
      {/* Header */}
      <div className="fault-panel-header">
        <div className="fault-panel-title-row">
          <Zap size={18} className="panel-title-icon text-cyan" />
          <h2 className="fault-panel-title">INJECT FAULT</h2>
        </div>
        <p className="fault-panel-subtitle">
          Select a fault type and configure parameters to simulate anomalies
        </p>
      </div>

      <div className="fault-panel-form">
        {/* 1. FAULT TYPE GRID */}
        <div className="form-group">
          <label className="form-label">Fault type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
            {FAULT_TYPES.map((f) => {
              const FIcon = iconMap[f.id] || Zap;
              const isSelected = selectedFaultId === f.id;
              
              // We'll use local state/inline styles for hover to match the sci-fi theme
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onSelectFault(f.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 4px',
                    background: isSelected ? 'rgba(37, 99, 235, 0.45)' : 'rgba(6, 21, 43, 0.9)',
                    border: `1px solid ${isSelected ? '#38BDF8' : 'rgba(56, 189, 248, 0.25)'}`,
                    borderRadius: '6px',
                    color: isSelected ? '#FFFFFF' : '#CBD5E1',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.35)' : 'none',
                    minHeight: '70px',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(37, 99, 235, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(6, 21, 43, 0.9)';
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.25)';
                    }
                  }}
                >
                  <FIcon size={18} style={{ color: isSelected ? '#38BDF8' : '#94A3B8' }} />
                  <span style={{ fontSize: '9.5px', fontWeight: '600', textAlign: 'center', lineHeight: '1.2' }}>
                    {f.title || f.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. SEVERITY SEGMENTED SELECTOR */}
        <div className="form-group">
          <label className="form-label">Severity</label>
          <div className="segmented-control">
            {['LOW', 'MEDIUM', 'HIGH'].map((tier) => {
              const isActive = currentSeverityTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  className={`segment-btn ${isActive ? 'active' : ''} ${
                    tier === 'HIGH' && isActive ? 'high-active' : ''
                  }`}
                  onClick={() => handleSeveritySegment(tier)}
                >
                  {isActive && (
                    <motion.div
                      layoutId="severity-active-pill"
                      className={`segment-active-indicator ${
                        tier === 'HIGH' ? 'indicator-high' : ''
                      }`}
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <span className="segment-text">
                    {tier === 'LOW' ? 'Low' : tier === 'MEDIUM' ? 'Medium' : 'High'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. DEGRADATION LEVEL SLIDER */}
        <div className="form-group">
          <div className="slider-label-row">
            <label className="form-label">Degradation level</label>
            <span className="slider-val-badge">{severityPct}%</span>
          </div>
          <div className="slider-container">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={severityPct}
              onChange={(e) => onChangeSeverity(Number(e.target.value))}
              className="styled-slider"
              style={{
                background: `linear-gradient(to right, #38BDF8 0%, #38BDF8 ${severityPct}%, #0F1F38 ${severityPct}%, #0F1F38 100%)`
              }}
            />
            <div className="slider-ticks">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* 4. START TIME SEGMENTED SELECTOR */}
        <div className="form-group">
          <label className="form-label">Start time</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segment-btn ${startMode === 'now' ? 'active' : ''}`}
              onClick={() => onChangeStartMode('now')}
            >
              {startMode === 'now' && (
                <motion.div
                  layoutId="start-active-pill"
                  className="segment-active-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <span className="segment-text">Now</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${startMode === 'delay' ? 'active' : ''}`}
              onClick={() => onChangeStartMode('delay')}
            >
              {startMode === 'delay' && (
                <motion.div
                  layoutId="start-active-pill"
                  className="segment-active-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <span className="segment-text">After delay</span>
            </button>
          </div>

          <div className="delay-input-row">
            <span className="sub-input-label">Delay (s):</span>
            <input
              type="number"
              min="0"
              max="300"
              step="5"
              value={delaySec}
              onChange={(e) => onChangeDelaySec(Math.max(0, Number(e.target.value)))}
              className="styled-num-input"
              disabled={startMode !== 'delay'}
            />
          </div>
        </div>

        {/* 5. DURATION SEGMENTED SELECTOR */}
        <div className="form-group">
          <label className="form-label">Duration</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segment-btn ${durationMode === 'continuous' ? 'active' : ''}`}
              onClick={() => onChangeDurationMode('continuous')}
            >
              {durationMode === 'continuous' && (
                <motion.div
                  layoutId="duration-active-pill"
                  className="segment-active-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <span className="segment-text">Continuous</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${durationMode === 'temporary' ? 'active' : ''}`}
              onClick={() => onChangeDurationMode('temporary')}
            >
              {durationMode === 'temporary' && (
                <motion.div
                  layoutId="duration-active-pill"
                  className="segment-active-indicator"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <span className="segment-text">Temporary</span>
            </button>
          </div>

          <div className="delay-input-row">
            <span className="sub-input-label">Duration (min):</span>
            <input
              type="number"
              min="1"
              max="60"
              step="1"
              value={tempDurationSec}
              onChange={(e) => onChangeTempDurationSec(Math.max(1, Number(e.target.value)))}
              className="styled-num-input"
              disabled={durationMode !== 'temporary'}
            />
          </div>
        </div>

        {/* ERROR MESSAGE IF ANY */}
        {errorMsg && (
          <div className="fault-error-box">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* PRIMARY CTA BUTTON */}
        <motion.button
          type="button"
          className={`inject-fault-btn ${injectSuccess ? 'success-state' : ''}`}
          onClick={onInjectFault}
          disabled={injecting}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {injecting ? (
            <>
              <div className="spinner-dot" />
              <span>INJECTING FAULT...</span>
            </>
          ) : injectSuccess ? (
            <>
              <CheckCircle size={18} className="text-emerald" />
              <span>{feedbackText || '✓ FAULT INJECTED'}</span>
            </>
          ) : (
            <>
              <Rocket size={18} className="rocket-icon" />
              <span>Inject Fault</span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
