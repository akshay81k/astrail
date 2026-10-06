import React from "react";
import {
  Zap,
  Thermometer,
  Compass,
  Wifi,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useTelemetry } from "../context/TelemetryContext";

export default function SubsystemHealth() {
  const { incidentsList, telemetryData, subsystemHealthData } = useTelemetry();

  // Determine active subsystem anomalies from real live data & active incidents
  const latestPoint = telemetryData.length > 0 ? telemetryData[telemetryData.length - 1] : null;
  const activeIncidents = incidentsList || [];

  const hasThermalIncident = activeIncidents.some(
    (i) => (i.top_cause || "").toUpperCase() === "THERMAL" || (i.flagged_sensors || []).some(s => s.includes("temp"))
  ) || (latestPoint && latestPoint.batteryTemp > 35.0);

  const hasPowerIncident = activeIncidents.some(
    (i) => (i.top_cause || "").toUpperCase() === "POWER" || (i.flagged_sensors || []).some(s => s.includes("power") || s.includes("bus") || s.includes("solar"))
  );

  const hasAttitudeIncident = activeIncidents.some(
    (i) => (i.top_cause || "").toUpperCase() === "ATTITUDE" || (i.flagged_sensors || []).some(s => s.includes("gyro") || s.includes("wheel") || s.includes("imu"))
  );

  const hasCommsIncident = activeIncidents.some(
    (i) => (i.top_cause || "").toUpperCase() === "COMMUNICATIONS" || (i.top_cause || "").toUpperCase() === "COMMS" || (i.flagged_sensors || []).some(s => s.includes("comm") || s.includes("packet"))
  );

  // Dynamic real subsystems based on telemetry state
  const subsystems = [
    {
      id: "power",
      name: "POWER",
      percentage: hasPowerIncident ? 68 : 99,
      status: hasPowerIncident ? "AMBER" : "GREEN",
      icon: Zap,
      statusClass: hasPowerIncident ? "amber" : "green",
    },
    {
      id: "thermal",
      name: "THERMAL",
      percentage: hasThermalIncident ? 74 : 98,
      status: hasThermalIncident ? "RED" : "GREEN",
      icon: Thermometer,
      statusClass: hasThermalIncident ? "red" : "green",
    },
    {
      id: "attitude",
      name: "ATTITUDE",
      percentage: hasAttitudeIncident ? 81 : 100,
      status: hasAttitudeIncident ? "AMBER" : "GREEN",
      icon: Compass,
      statusClass: hasAttitudeIncident ? "amber" : "green",
    },
    {
      id: "comms",
      name: "COMMS",
      percentage: hasCommsIncident ? 78 : 99,
      status: hasCommsIncident ? "AMBER" : "GREEN",
      icon: Wifi,
      statusClass: hasCommsIncident ? "amber" : "green",
    },
  ];

  return (
    <section className="subsystem-section">
      <div className="section-title-row">
        <Activity size={18} className="section-icon" />
        <h2 className="section-title">SUBSYSTEM HEALTH</h2>
      </div>

      <div className="subsystem-grid">
        {subsystems.map((sub) => {
          const Icon = sub.icon;
          return (
            <div
              key={sub.id}
              className={`subsystem-card status-${sub.statusClass}`}
            >
              <div className="card-top">
                <div className={`sub-icon-wrapper bg-${sub.statusClass}`}>
                  <Icon size={20} className={`icon-${sub.statusClass}`} />
                </div>
                <div className="sub-info">
                  <span className="sub-name">{sub.name}</span>
                  <div className="sub-value-row">
                    <span className="sub-percentage">{sub.percentage}%</span>
                  </div>
                </div>
                <span className={`badge badge-${sub.statusClass}`}>
                  {sub.status}
                </span>
              </div>

              <div className="progress-container">
                <div
                  className={`progress-bar bar-${sub.statusClass}`}
                  style={{ width: `${sub.percentage}%` }}
                />
              </div>

              <ChevronRight size={16} className="card-chevron" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
