import React from 'react';
import { getSemanticSeverity } from '../data/faultMetadata';

export default function InjectionParameters({
  severity,
  onChangeSeverity,
  startOffsetSec,
  onChangeStartOffsetSec,
  missingPct,
  onChangeMissingPct,
  delaySec,
  onChangeDelaySec
}) {
  const semantic = getSemanticSeverity(severity);

  return (
    <div className="card injection-parameters-card">
      <div className="card-header-with-number">
        <div className="step-number">2</div>
        <div>
          <h2 className="card-step-title">Injection Parameters</h2>
          <p className="card-step-subtitle">Configure the fault parameters</p>
        </div>
      </div>

      <div className="parameters-body">
        {/* Severity Slider */}
        <div className="param-group">
          <div className="param-label-row">
            <label className="param-title">Severity</label>
            <div className="param-value-badges">
              <span className="value-box-pill">{severity}%</span>
              <span className={`semantic-badge badge-${semantic.colorClass}`}>
                {semantic.label}
              </span>
            </div>
          </div>

          <div className="slider-wrapper">
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={severity}
              onChange={(e) => onChangeSeverity(Number(e.target.value))}
              className="custom-range-slider severity-slider"
              style={{
                background: `linear-gradient(to right, #f97316 0%, #f97316 ${severity}%, #e2e8f0 ${severity}%, #e2e8f0 100%)`
              }}
            />
            <div className="slider-ticks">
              <span>10%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Start in Seconds Input */}
        <div className="param-group start-in-row">
          <label className="param-title">Start in</label>
          <div className="start-in-input-box">
            <input
              type="number"
              min="0"
              max="600"
              value={startOffsetSec}
              onChange={(e) => onChangeStartOffsetSec(Math.max(0, Number(e.target.value)))}
              className="numeric-stepper-input"
            />
          </div>
          <span className="param-unit-label">seconds</span>
        </div>

        {/* Optional Data Quality Stress */}
        <div className="stress-section">
          <h3 className="stress-section-title">Data Quality Stress (Optional)</h3>

          {/* Missing data */}
          <div className="param-group">
            <div className="param-label-row">
              <label className="param-sub-title">Missing data</label>
              <span className="value-box-pill">{missingPct}%</span>
            </div>
            <div className="slider-wrapper">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={missingPct}
                onChange={(e) => onChangeMissingPct(Number(e.target.value))}
                className="custom-range-slider blue-slider"
                style={{
                  background: `linear-gradient(to right, #2563eb 0%, #2563eb ${missingPct}%, #e2e8f0 ${missingPct}%, #e2e8f0 100%)`
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

          {/* Delay */}
          <div className="param-group">
            <div className="param-label-row">
              <label className="param-sub-title">Delay</label>
              <span className="value-box-pill">{delaySec} s</span>
            </div>
            <div className="slider-wrapper">
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={delaySec}
                onChange={(e) => onChangeDelaySec(Number(e.target.value))}
                className="custom-range-slider blue-slider"
                style={{
                  background: `linear-gradient(to right, #2563eb 0%, #2563eb ${(delaySec / 60) * 100}%, #e2e8f0 ${(delaySec / 60) * 100}%, #e2e8f0 100%)`
                }}
              />
              <div className="slider-ticks">
                <span>0s</span>
                <span>15s</span>
                <span>30s</span>
                <span>60s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
