import React from "react";
import { useNavigate } from "react-router-dom";
import { useTelemetry } from "../context/TelemetryContext";
import { Bell, AlertTriangle, Thermometer, Sun, Info, ChevronRight, CheckCircle } from "lucide-react";

export default function AlertsPanel() {
  const navigate = useNavigate();
  const { incidentsList, activeAlertId, setActiveAlertId } = useTelemetry();

  const handleAlertClick = (inc) => {
    const incId = inc.id || inc._id || "014";
    setActiveAlertId(incId);
    navigate(`/incidents/${incId}`);
  };

  const getAlertIcon = (severity, type) => {
    if (type?.includes("thermal") || type?.includes("heater") || type?.includes("battery")) return Thermometer;
    if (type?.includes("solar") || type?.includes("power")) return Sun;
    if (severity === "critical" || severity === "CRITICAL") return AlertTriangle;
    return Info;
  };

  const getColorClass = (severity) => {
    const s = (severity || "").toLowerCase();
    if (s === "critical" || s === "high" || s === "red") return "red";
    if (s === "warning" || s === "medium" || s === "amber") return "amber";
    return "blue";
  };

  return (
    <div className="alerts-container">
      <div className="alerts-header">
        <div className="title-row">
          <Bell size={18} className="icon-bell text-red" />
          <h2 className="section-title">ALERTS</h2>
        </div>
        <button
          className="btn-view-all"
          onClick={() => navigate(incidentsList.length > 0 ? `/incidents/${incidentsList[0].id || incidentsList[0]._id}` : "/incidents")}
        >
          View All <ChevronRight size={14} />
        </button>
      </div>

      <div className="alerts-list">
        {incidentsList.length === 0 ? (
          <div className="empty-alerts" style={{ padding: "20px 14px", textAlign: "center", color: "#64748b", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.08)" }}>
            <CheckCircle size={24} style={{ color: "#10b981", margin: "0 auto 8px auto", display: "block" }} />
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#94a3b8" }}>No Active Alerts</div>
            <div style={{ fontSize: "11px", marginTop: "4px", color: "#64748b" }}>Spacecraft telemetry operating within nominal bounds.</div>
          </div>
        ) : (
          incidentsList.slice(0, 5).map((inc) => {
            const incId = inc.id || inc._id;
            const severity = (inc.severity || "CRITICAL").toUpperCase();
            const colorClass = getColorClass(severity);
            const Icon = getAlertIcon(severity, inc.type || inc.classification?.label);
            const isSelected = activeAlertId === incId;
            const timeStr = inc.openedAt || inc.time || (inc.openedAtSim ? `02:${String(Math.floor(inc.openedAtSim / 60)).padStart(2, '0')}:${String(inc.openedAtSim % 60).padStart(2, '0')}` : "LIVE");
            const title = inc.title || inc.headline || (inc.type ? inc.type.replace(/_/g, ' ') : "Spacecraft Anomaly");
            const desc = inc.description || inc.explanation?.headline || "Variance detected on telemetry channels — Root cause analysis generated";

            return (
              <div
                key={incId}
                onClick={() => handleAlertClick(inc)}
                className={`alert-card alert-${colorClass} ${isSelected ? "selected" : ""}`}
              >
                <div className={`alert-icon-box bg-${colorClass}`}>
                  <Icon size={18} className={`icon-${colorClass}`} />
                </div>

                <div className="alert-content">
                  <div className="alert-top-meta">
                    <span className="alert-time">{timeStr}</span>
                    <span className={`badge badge-${colorClass}`}>
                      {severity}
                    </span>
                  </div>
                  <h4 className="alert-title" style={{ textTransform: "capitalize" }}>{title}</h4>
                  <p className="alert-desc">{desc}</p>
                </div>

                <ChevronRight size={16} className="alert-chevron" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
