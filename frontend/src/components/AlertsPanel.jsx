import React from "react";
import { useNavigate } from "react-router-dom";
import { useTelemetry } from "../context/TelemetryContext";
import {
  Bell,
  AlertTriangle,
  ChevronRight,
  CheckCircle,
  Play,
  RotateCcw
} from "lucide-react";

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

export default function AlertsPanel() {
  const navigate = useNavigate();
  const {
    incidentsList,
    activeAlertId,
    setActiveAlertId,
    replayIncident,
    telemetryData
  } = useTelemetry();

  // Check persistence: if score is elevated above 1.022 recently
  const recentScores = telemetryData.slice(-5);
  const isScoreAlertActive = recentScores.some((d) => Number(d.anomalyScore) >= 1.022);

  const handleAlertClick = (inc) => {
    const incId = inc.id || inc._id || "inc_F004";
    setActiveAlertId(incId);
    navigate(`/incidents/${incId}`);
  };

  return (
    <div className="alerts-container">
      <div className="alerts-header">
        <div className="title-row">
          <Bell size={16} className={isScoreAlertActive ? "text-red" : "text-muted"} />
          <h2 className="section-title">ACTIVE ALERTS</h2>
          {isScoreAlertActive && (
            <span className="badge-threshold-tripped">SCORE &gt; 1.022</span>
          )}
        </div>

        {/* Quick Replay Triggers for Real Faults */}
        <div className="replay-btn-group">
          <button
            className="btn-replay-pill"
            onClick={() => replayIncident("F001")}
            title="Replay F001 (Thermal Radiator Drift)"
          >
            <Play size={10} /> F001
          </button>
          <button
            className="btn-replay-pill"
            onClick={() => replayIncident("F004")}
            title="Replay F004 (Comm Packet Drop)"
          >
            <Play size={10} /> F004
          </button>
          <button
            className="btn-replay-pill"
            onClick={() => replayIncident("F006")}
            title="Replay F006 (Payload Power Degradation)"
          >
            <Play size={10} /> F006
          </button>
        </div>
      </div>

      <div className="alerts-list">
        {incidentsList.length === 0 ? (
          <div className="empty-alerts">
            <CheckCircle size={20} className="text-muted" style={{ margin: "0 auto 6px auto", display: "block" }} />
            <div className="empty-title">Nominal Spacecraft State</div>
            <div className="empty-sub">Telemetry residual conformal score is within operational limits.</div>
          </div>
        ) : (
          incidentsList.slice(0, 5).map((inc) => {
            const incId = inc.id || inc._id;
            const severity = (inc.severity || "HIGH").toUpperCase();
            const isSelected = activeAlertId === incId;
            const eventType = inc.event_type || inc.type || "subsystem_fault";
            const topCause = inc.top_cause || inc.root_cause_analysis?.primary_subsystem || "THERMAL";
            const confidence = inc.confidence != null ? `${(inc.confidence * 100).toFixed(1)}%` : "82.0%";
            const timeStr = inc.openedAt || inc.time || "LIVE";
            const title = inc.title || inc.headline || "Spacecraft Anomaly";
            const qualityMap = inc.data_quality?.per_channel || {};

            return (
              <div
                key={incId}
                onClick={() => handleAlertClick(inc)}
                className={`alert-card-unified ${isSelected ? "selected" : ""}`}
              >
                <div className="alert-card-top">
                  <div className="alert-type-group">
                    <span className="badge-event-type">{eventType}</span>
                    <span className="badge-severity-tag">{severity}</span>
                  </div>
                  <span className="alert-timestamp">{timeStr}</span>
                </div>

                <h4 className="alert-headline-title">{title}</h4>

                {/* Event Type, Top Cause, Confidence */}
                <div className="alert-triage-row">
                  <div className="triage-item">
                    <span className="triage-label">Top Cause:</span>
                    <span className="triage-value text-top-cause">{topCause}</span>
                  </div>
                  <div className="triage-item">
                    <span className="triage-label">Confidence:</span>
                    <span className="triage-value">{confidence}</span>
                  </div>
                </div>

                {/* 23-Sensor Compact Grid */}
                <div className="alert-sensor-grid-23" title="23-Channel Quality Grid">
                  {ALL_23_SIGNALS.map((sig) => {
                    const status = qualityMap[sig] || "OK";
                    const isAnomaly = status === "NOISY" || status === "ANOMALY";
                    const isDelayed = status === "DELAYED";
                    const isMissing = status === "MISSING";
                    const dotClass = isAnomaly ? "dot-noisy" : isDelayed ? "dot-delayed" : isMissing ? "dot-missing" : "dot-ok";
                    return (
                      <span
                        key={sig}
                        className={`sensor-mini-dot ${dotClass}`}
                        title={`${sig}: ${status}`}
                      />
                    );
                  })}
                </div>

                <div className="alert-card-footer">
                  <span className="view-detail-hint">View Root Cause &amp; Mitigation Rules</span>
                  <ChevronRight size={14} className="chevron-icon" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
