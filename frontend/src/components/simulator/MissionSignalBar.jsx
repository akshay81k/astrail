import React from 'react';
import { Radio, Zap, Thermometer, Compass, Sparkles } from 'lucide-react';

export default function MissionSignalBar({
  telemetry = {},
  isConnected = true,
  isPlaying = true
}) {
  const currentTemp = telemetry.batteryTemp !== undefined ? `${telemetry.batteryTemp.toFixed(1)} °C` : '—';
  const currentAnomaly = telemetry.anomalyScore !== undefined ? telemetry.anomalyScore.toFixed(2) : '—';
  const currentPower = telemetry.loadPower !== undefined ? `${telemetry.loadPower.toFixed(1)} W` : '—';
  const isAnomalyElevated = telemetry.threshold !== undefined && telemetry.anomalyScore !== undefined
    ? telemetry.anomalyScore >= telemetry.threshold
    : (telemetry.anomalyScore > 2.0);

  return (
    <div className="mission-signal-hud-strip">
      <div className="hud-signal-group">
        <div className="hud-signal-item">
          <Radio size={11} className="hud-icon text-cyan" />
          <span className="hud-label">COMM LINK</span>
          <span className={`hud-value ${isConnected ? 'text-green' : 'text-amber'}`}>
            {isConnected ? 'NOMINAL' : 'OFFLINE'}
          </span>
        </div>

        <div className="hud-separator" />

        <div className="hud-signal-item">
          <Zap size={11} className="hud-icon text-amber" />
          <span className="hud-label">POWER</span>
          <span className="hud-value text-white">{currentPower}</span>
        </div>

        <div className="hud-separator" />

        <div className="hud-signal-item">
          <Thermometer size={11} className="hud-icon text-purple" />
          <span className="hud-label">THERMAL</span>
          <span className="hud-value text-white">{currentTemp}</span>
        </div>

        <div className="hud-separator" />

        <div className="hud-signal-item">
          <Compass size={11} className="hud-icon text-blue" />
          <span className="hud-label">ATTITUDE</span>
          <span className="hud-value text-white">
            {telemetry.pointingError !== undefined ? `±${telemetry.pointingError.toFixed(2)}°` : 'STABLE'}
          </span>
        </div>

        <div className="hud-separator" />

        <div className="hud-signal-item">
          <Sparkles size={11} className="hud-icon text-purple" />
          <span className="hud-label">ANOMALY</span>
          <span className={`hud-value ${isAnomalyElevated ? 'text-red' : 'text-purple'}`}>
            {currentAnomaly}
          </span>
        </div>
      </div>

      {/* Live / Status Indicator */}
      <div className="hud-live-tag">
        <div className={`live-breathing-dot ${isPlaying && isConnected ? 'active-live' : !isPlaying ? 'paused-live' : 'disconnected-live'}`} />
        <span className="live-tag-text">
          {isPlaying && isConnected ? 'LIVE' : !isPlaying ? 'PAUSED' : 'DISCONNECTED'}
        </span>
      </div>
    </div>
  );
}
