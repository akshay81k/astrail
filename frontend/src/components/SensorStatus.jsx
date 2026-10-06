import React, { useState } from 'react';
import { Database } from 'lucide-react';

const sensors = [
  { id: 'S1', name: 'S1', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.8%' },
  { id: 'S2', name: 'S2', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '100%' },
  { id: 'S3', name: 'S3', status: 'DELAYED', color: 'amber', lastUpdate: '16s ago', quality: '82.4% (Sync delay)' },
  { id: 'S4', name: 'S4', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.5%' },
  { id: 'S5', name: 'S5', status: 'MISSING', color: 'red', lastUpdate: '2m 14s ago', quality: '0% (No packet)' },
  { id: 'S6', name: 'S6', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.9%' }
];

export default function SensorStatus() {
  const [hoveredSensor, setHoveredSensor] = useState(null);

  return (
    <section className="sensor-status-section">
      <div className="sensor-header-row">
        <div className="title-group">
          <Database size={18} className="section-icon text-blue" />
          <h2 className="section-title">SENSOR STATUS</h2>
        </div>

        <div className="sensor-legend">
          <span className="legend-chip"><span className="dot dot-green"></span> OK</span>
          <span className="legend-chip"><span className="dot dot-amber"></span> Delayed</span>
          <span className="legend-chip"><span className="dot dot-red"></span> Missing</span>
        </div>
      </div>

      <div className="sensor-grid">
        {sensors.map((s) => (
          <div
            key={s.id}
            className={`sensor-chip chip-${s.color}`}
            onMouseEnter={() => setHoveredSensor(s)}
            onMouseLeave={() => setHoveredSensor(null)}
          >
            <span className={`sensor-dot dot-${s.color}`}></span>
            <div className="sensor-info">
              <span className="sensor-name">{s.name}</span>
              <span className={`sensor-status-text text-${s.color}`}>{s.status}</span>
            </div>

            {/* Hover Tooltip */}
            {hoveredSensor?.id === s.id && (
              <div className="sensor-tooltip">
                <div className="tooltip-title">Sensor {s.id}</div>
                <div className="tooltip-row">
                  <span>Status:</span> <strong className={`text-${s.color}`}>{s.status}</strong>
                </div>
                <div className="tooltip-row">
                  <span>Last Update:</span> <span>{s.lastUpdate}</span>
                </div>
                <div className="tooltip-row">
                  <span>Data Quality:</span> <span>{s.quality}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
