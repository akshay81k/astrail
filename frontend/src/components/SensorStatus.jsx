import React, { useState } from 'react';
import { Database } from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';

const SENSOR_CATALOG = [
  { id: 'power_bus_voltage_V', name: 'power_bus_voltage_V', subsystem: 'POWER', unit: 'V' },
  { id: 'power_bus_current_A', name: 'power_bus_current_A', subsystem: 'POWER', unit: 'A' },
  { id: 'solar_array_current_A', name: 'solar_array_current_A', subsystem: 'POWER', unit: 'A' },
  { id: 'battery_soc_pct', name: 'battery_soc_pct', subsystem: 'POWER', unit: '%' },
  { id: 'battery_temperature_C', name: 'battery_temperature_C', subsystem: 'THERMAL', unit: '°C' },
  { id: 'eps_temperature_C', name: 'eps_temperature_C', subsystem: 'THERMAL', unit: '°C' },
  { id: 'payload_temperature_C', name: 'payload_temperature_C', subsystem: 'THERMAL', unit: '°C' },
  { id: 'radiator_temperature_C', name: 'radiator_temperature_C', subsystem: 'THERMAL', unit: '°C' },
  { id: 'imu_accel_x_mps2', name: 'imu_accel_x_mps2', subsystem: 'ATTITUDE', unit: 'm/s²' },
  { id: 'imu_accel_y_mps2', name: 'imu_accel_y_mps2', subsystem: 'ATTITUDE', unit: 'm/s²' },
  { id: 'imu_accel_z_mps2', name: 'imu_accel_z_mps2', subsystem: 'ATTITUDE', unit: 'm/s²' },
  { id: 'gyro_x_deg_s', name: 'gyro_x_deg_s', subsystem: 'ATTITUDE', unit: '°/s' },
  { id: 'gyro_y_deg_s', name: 'gyro_y_deg_s', subsystem: 'ATTITUDE', unit: '°/s' },
  { id: 'gyro_z_deg_s', name: 'gyro_z_deg_s', subsystem: 'ATTITUDE', unit: '°/s' },
  { id: 'reaction_wheel_speed_rpm', name: 'reaction_wheel_speed_rpm', subsystem: 'ATTITUDE', unit: 'rpm' },
  { id: 'comm_rx_dbm', name: 'comm_rx_dbm', subsystem: 'COMMUNICATIONS', unit: 'dBm' },
  { id: 'comm_tx_dbm', name: 'comm_tx_dbm', subsystem: 'COMMUNICATIONS', unit: 'dBm' },
  { id: 'packet_loss_pct', name: 'packet_loss_pct', subsystem: 'COMMUNICATIONS', unit: '%' },
  { id: 'cpu_utilization_pct', name: 'cpu_utilization_pct', subsystem: 'COMPUTE', unit: '%' },
  { id: 'memory_utilization_pct', name: 'memory_utilization_pct', subsystem: 'COMPUTE', unit: '%' },
  { id: 'radiation_rate_counts_s', name: 'radiation_rate_counts_s', subsystem: 'RADIATION', unit: 'cts/s' },
  { id: 'payload_power_W', name: 'payload_power_W', subsystem: 'PAYLOAD', unit: 'W' },
  { id: 'data_queue_MB', name: 'data_queue_MB', subsystem: 'PAYLOAD', unit: 'MB' }
];

export default function SensorStatus() {
  const { sensorsData } = useTelemetry();
  const [hoveredSensor, setHoveredSensor] = useState(null);

  // Build sensor status lookup from context if available
  const contextMap = {};
  if (Array.isArray(sensorsData)) {
    sensorsData.forEach((s) => {
      const key = s.id || s.name;
      contextMap[key] = s;
    });
  }

  return (
    <section className="sensor-status-section">
      <div className="sensor-header-row">
        <div className="title-group">
          <Database size={16} className="section-icon" />
          <h2 className="section-title">Telemetry Sensor Grid (23 Channels)</h2>
        </div>

        <div className="sensor-legend">
          <span className="legend-chip"><span className="dot dot-nominal"></span> OK</span>
          <span className="legend-chip"><span className="dot dot-delayed"></span> Delayed</span>
          <span className="legend-chip"><span className="dot dot-noisy"></span> Noisy</span>
          <span className="legend-chip"><span className="dot dot-anomaly"></span> Anomaly</span>
        </div>
      </div>

      <div className="sensor-grid-23-compact">
        {SENSOR_CATALOG.map((s) => {
          const live = contextMap[s.id] || {};
          const status = live.status || 'OK';
          const isAnomaly = status === 'ANOMALY' || status === 'ERROR' || status === 'NOISY';
          const isDelayed = status === 'DELAYED';
          const isMissing = status === 'MISSING';
          const colorCls = isAnomaly ? 'chip-anomaly' : isDelayed ? 'chip-delayed' : isMissing ? 'chip-missing' : 'chip-nominal';

          return (
            <div
              key={s.id}
              className={`sensor-tile-23 ${colorCls}`}
              onMouseEnter={() => setHoveredSensor({ ...s, ...live, status })}
              onMouseLeave={() => setHoveredSensor(null)}
            >
              <div className="sensor-tile-top">
                <span className="sensor-channel-name">{s.name}</span>
                <span className={`status-badge-text ${colorCls}`}>{status}</span>
              </div>
              <div className="sensor-tile-sub">
                <span className="sensor-subsystem-tag">{s.subsystem}</span>
                <span className="sensor-unit">{s.unit}</span>
              </div>

              {hoveredSensor?.id === s.id && (
                <div className="sensor-tooltip-fixed">
                  <div className="tooltip-title">{s.name}</div>
                  <div className="tooltip-row">
                    <span>Subsystem:</span> <strong>{s.subsystem}</strong>
                  </div>
                  <div className="tooltip-row">
                    <span>Quality Status:</span> <strong className={`text-${colorCls}`}>{status}</strong>
                  </div>
                  <div className="tooltip-row">
                    <span>Unit:</span> <span>{s.unit}</span>
                  </div>
                  <div className="tooltip-row">
                    <span>Quality Metric:</span> <span>{live.quality || '99.8%'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
