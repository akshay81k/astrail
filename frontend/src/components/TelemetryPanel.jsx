import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { Activity, Maximize2, Minimize2 } from 'lucide-react';
import BatteryTemperatureChart from './BatteryTemperatureChart';
import SolarCurrentChart from './SolarCurrentChart';
import AnomalyScoreChart from './AnomalyScoreChart';

const timeRanges = ['Live', '1m', '5m', '30m', '1h'];

export default function TelemetryPanel() {
  const { timeRange, setTimeRange, isFullscreen, setIsFullscreen } = useTelemetry();

  return (
    <section className={`telemetry-section ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <div className="section-title-row main-telemetry-header">
        <div className="title-group">
          <Activity size={18} className="section-icon text-blue" />
          <h2 className="section-title">LIVE TELEMETRY</h2>
        </div>

        <div className="telemetry-controls">
          <div className="time-range-group">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`range-btn ${timeRange === range ? 'active' : ''}`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-icon-control"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Telemetry'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className="telemetry-charts-container">
        <BatteryTemperatureChart />
        <SolarCurrentChart />
        <AnomalyScoreChart />
      </div>
    </section>
  );
}
