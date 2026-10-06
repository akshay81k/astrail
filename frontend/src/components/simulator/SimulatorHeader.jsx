import React from 'react';
import {
  Clock,
  RotateCcw,
  Pause,
  Play
} from 'lucide-react';

export default function SimulatorHeader({
  systemStatus = 'Simulation Active',
  statusSubtext = 'All systems nominal',
  statusType = 'nominal', // 'nominal' | 'warning' | 'critical' | 'paused'
  formattedMissionTime = '04:27:46',
  missionDate = 'Oct 05, 2026',
  isPlaying = true,
  onTogglePlay,
  onReset
}) {
  let dotClass = 'dot-green';
  if (statusType === 'critical') {
    dotClass = 'dot-red pulse-fast';
  } else if (statusType === 'warning') {
    dotClass = 'dot-amber pulse-normal';
  } else if (statusType === 'paused') {
    dotClass = 'dot-blue';
  }

  return (
    <header className="simulator-header">
      {/* Left: Titles */}
      <div className="simulator-header-left">
        <div className="simulator-header-titles">
          <h1 className="simulator-main-title">FAULT INJECTION SIMULATOR</h1>
          <p className="simulator-main-subtitle">
            Simulate spacecraft anomalies and observe real-time system response
          </p>
        </div>
      </div>

      {/* Right: Mission Time, Dynamic System Status, and Action Controls */}
      <div className="simulator-header-right">
        {/* Mission Time Widget */}
        <div className="simulator-mission-time-card">
          <Clock size={16} className="time-clock-icon text-cyan" />
          <div className="mission-time-stack">
            <span className="time-lead-label">MISSION TIME</span>
            <span className="time-digits">{formattedMissionTime}</span>
            <span className="time-sub-date">{missionDate}</span>
          </div>
        </div>

        {/* Dynamic System Status Card */}
        <div className={`simulator-status-indicator-card status-${statusType}`}>
          <div className={`status-pulse-dot ${dotClass}`} />
          <div className="status-text-stack">
            <h4 className="status-title-text">{systemStatus}</h4>
            <span className="status-sub-text">{statusSubtext}</span>
          </div>
        </div>

        {/* Pause & Reset Controls */}
        <div className="sim-header-actions">
          <button
            type="button"
            className="sim-header-action-btn"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Pause' : 'Resume'}</span>
          </button>

          <button
            type="button"
            className="sim-header-action-btn"
            onClick={onReset}
            title="Reset Simulation State"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
