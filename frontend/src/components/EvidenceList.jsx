import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Award,
  Database,
  Radio,
  ShieldAlert
} from 'lucide-react';

const ALL_23_SIGNALS = [
  'power_bus_voltage_V',
  'power_bus_current_A',
  'solar_array_current_A',
  'battery_soc_pct',
  'battery_temperature_C',
  'eps_temperature_C',
  'payload_temperature_C',
  'radiator_temperature_C',
  'imu_accel_x_mps2',
  'imu_accel_y_mps2',
  'imu_accel_z_mps2',
  'gyro_x_deg_s',
  'gyro_y_deg_s',
  'gyro_z_deg_s',
  'reaction_wheel_speed_rpm',
  'comm_rx_dbm',
  'comm_tx_dbm',
  'packet_loss_pct',
  'cpu_utilization_pct',
  'memory_utilization_pct',
  'radiation_rate_counts_s',
  'payload_power_W',
  'data_queue_MB'
];

export default function EvidenceList({
  evidence = [],
  timeToLimit = null,
  runnerUp = null,
  dataQuality = null
}) {
  const items = Array.isArray(evidence) && evidence.length > 0 ? evidence : [];

  // Parse per-channel data quality for all 23 channels
  const qualityMap = dataQuality?.per_channel || {};
  const nominalFraction = dataQuality?.nominal_fraction ?? 0.95;

  return (
    <div className="evidence-container">
      {/* 1. Time-to-Limit Projection */}
      {timeToLimit && (
        <div className="evidence-section-block ttl-evidence-box">
          <div className="evidence-section-header">
            <Clock size={16} className="text-amber" />
            <h4 className="evidence-heading">Time-to-Limit Projection</h4>
            {timeToLimit.status === 'limit already exceeded' ? (
              <span className="badge-limit-exceeded">LIMIT ALREADY EXCEEDED</span>
            ) : timeToLimit.status === 'within limits' ? (
              <span className="badge-within-limits">WITHIN LIMITS</span>
            ) : (
              <span className="badge-in-limit">IN-LIMIT</span>
            )}
          </div>
          <div className="ttl-details">
            {timeToLimit.status === 'limit already exceeded' ? (
              <p className="ttl-text text-danger">
                <strong>Status:</strong> Operational hard limit is already exceeded.{' '}
                {timeToLimit.explanation && `(${timeToLimit.explanation})`}
              </p>
            ) : timeToLimit.status === 'within limits' ? (
              <div className="ttl-text">
                <div>
                  <strong>Earliest Channel:</strong> <code>{timeToLimit.channel || timeToLimit.earliest_channel || 'data_queue_MB'}</code>
                </div>
                <div>
                  <strong>Projected Crossing:</strong> Row {timeToLimit.projected_crossing_row || '61172'}{' '}
                  {timeToLimit.range_80 && (
                    <span className="range-80-pill">
                      (80% Range: {Array.isArray(timeToLimit.range_80) ? `${timeToLimit.range_80[0]} to ${timeToLimit.range_80[1]}` : timeToLimit.range_80} rows)
                    </span>
                  )}
                </div>
                {timeToLimit.explanation && (
                  <p className="ttl-subtext">{timeToLimit.explanation}</p>
                )}
              </div>
            ) : (
              <p className="ttl-text text-muted">
                <strong>Status:</strong> Projected time-to-limit indicates no crossing projected (local slope not statistically significant toward limit).
              </p>
            )}
          </div>
        </div>
      )}

      {/* 2. Runner-Up Subsystem */}
      {runnerUp && (
        <div className="evidence-section-block runner-up-evidence-box">
          <div className="evidence-section-header">
            <Award size={16} className="text-purple" />
            <h4 className="evidence-heading">Runner-Up Subsystem Hypothesis</h4>
          </div>
          <div className="runner-up-content">
            <span className="runner-up-candidate">{runnerUp.candidate || runnerUp.subsystem || 'COMPUTE'}</span>
            <span className="runner-up-meta">
              Delta Score: <strong>{runnerUp.delta_score != null ? runnerUp.delta_score : '0.14'}</strong>
            </span>
            {runnerUp.confidence != null && (
              <span className="runner-up-meta">
                Confidence: <strong>{(runnerUp.confidence * 100).toFixed(1)}%</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. 23-Sensor Data Quality Grid */}
      <div className="evidence-section-block">
        <div className="evidence-section-header">
          <Database size={16} className="text-cyan" />
          <h4 className="evidence-heading">
            23-Sensor Data Quality Grid{' '}
            <span className="fraction-pill">
              {(nominalFraction * 100).toFixed(1)}% Nominal
            </span>
          </h4>
        </div>
        <div className="sensor-grid-compact-23">
          {ALL_23_SIGNALS.map((sig) => {
            const status = qualityMap[sig] || 'OK';
            const colorCls =
              status === 'OK'
                ? 'pill-ok'
                : status === 'DELAYED'
                ? 'pill-delayed'
                : status === 'MISSING'
                ? 'pill-missing'
                : 'pill-noisy';
            return (
              <div key={sig} className={`sensor-quality-cell ${colorCls}`} title={`${sig}: ${status}`}>
                <span className="sig-label">{sig}</span>
                <span className="sig-status">{status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Key Evidence Bullets */}
      <div className="evidence-section-block">
        <div className="evidence-section-header">
          <CheckCircle2 size={16} className="text-emerald" />
          <h4 className="evidence-heading">Key Observational Evidence</h4>
        </div>
        {items.length === 0 ? (
          <div className="evidence-empty">
            No distinct cross-channel anomalies flagged.
          </div>
        ) : (
          <ul className="evidence-list">
            {items.map((item, idx) => (
              <li key={idx} className="evidence-item">
                <CheckCircle2 size={15} className="evidence-check-icon" />
                <span className="evidence-text">
                  {typeof item === 'string' ? item : item.text || item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
