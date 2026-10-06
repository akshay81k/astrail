import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { Play, Pause, RotateCcw, Clock, ChevronDown, WifiOff } from 'lucide-react';

export default function Header() {
  const {
    isPlaying,
    togglePlay,
    playbackSpeed,
    setPlaybackSpeed,
    formattedMissionTime,
    source,
    setSource,
    reset,
    isConnected,
    isConnecting
  } = useTelemetry();

  return (
    <header className="header-container">
      <div className="header-title-section">
        <h1 className="header-title">SPACECRAFT HEALTH MONITOR</h1>
        <p className="header-subtitle">Real-time telemetry monitoring and anomaly detection</p>
      </div>

      <div className="header-controls-section">
        {/* Status indicator */}
        {!isConnected && !isConnecting ? (
          <div className="status-badge paused" title="Disconnected from backend live stream">
            <WifiOff size={12} />
            <span className="badge-text">DISCONNECTED</span>
          </div>
        ) : (
          <div className={`status-badge ${isPlaying ? 'live' : 'paused'}`}>
            <span className="dot"></span>
            <span className="badge-text">{isPlaying ? 'LIVE' : 'PAUSED'}</span>
          </div>
        )}

        {/* Source selector */}
        <div className="source-selector">
          <span className="label">Source:</span>
          <div className="select-wrapper">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="source-select"
            >
              <option value="Simulator">Simulator</option>
              <option value="NASA SMAP/MSL">NASA SMAP/MSL</option>
              <option value="Telemetry Feed">Telemetry Feed</option>
            </select>
            <ChevronDown size={14} className="select-arrow" />
          </div>
        </div>

        {/* Mission Time */}
        <div className="mission-time-box">
          <Clock size={16} className="clock-icon" />
          <div className="time-content">
            <span className="time-label">Mission Time</span>
            <span className="time-value">{formattedMissionTime}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="playback-buttons">
          <button
            onClick={togglePlay}
            className={`btn-control btn-play ${isPlaying ? 'is-playing' : ''}`}
            title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
          >
            {isPlaying ? (
              <>
                <Pause size={14} fill="currentColor" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                <span>Play</span>
              </>
            )}
          </button>

          <div className="select-wrapper speed-wrapper">
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="speed-select"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
              <option value={8}>8×</option>
            </select>
            <ChevronDown size={14} className="select-arrow" />
          </div>

          <button
            onClick={reset}
            className="btn-control btn-reset"
            title="Reset Simulation"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
