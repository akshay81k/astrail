import React from "react";
import {
  Zap,
  Thermometer,
  Compass,
  Wifi,
  ChevronRight,
  Activity,
} from "lucide-react";

const subsystems = [
  {
    id: "power",
    name: "POWER",
    percentage: 68,
    status: "AMBER",
    icon: Zap,
    statusClass: "amber",
  },
  {
    id: "thermal",
    name: "THERMAL",
    percentage: 92,
    status: "RED",
    icon: Thermometer,
    statusClass: "red",
  },
  {
    id: "attitude",
    name: "ATTITUDE",
    percentage: 88,
    status: "GREEN",
    icon: Compass,
    statusClass: "green",
  },
  {
    id: "comms",
    name: "COMMS",
    percentage: 96,
    status: "GREEN",
    icon: Wifi,
    statusClass: "green",
  },
];

export default function SubsystemHealth() {
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
