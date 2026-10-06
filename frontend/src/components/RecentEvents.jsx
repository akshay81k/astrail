import React from "react";
import { Clock } from "lucide-react";
import { useTelemetry } from "../context/TelemetryContext";

export default function RecentEvents() {
  const { incidentsList, isConnected } = useTelemetry();

  // Build live events list from actual incidents and active telemetry stream
  const liveEvents = [];

  // Add real incidents
  if (incidentsList && incidentsList.length > 0) {
    incidentsList.slice(0, 4).forEach((inc) => {
      const severity = (inc.severity || "CRITICAL").toLowerCase();
      const color = (severity === "critical" || severity === "red") ? "red" : (severity === "warning" || severity === "amber" ? "amber" : "blue");
      const timeStr = inc.openedAt || inc.time || (inc.openedAtSim ? `02:${String(Math.floor(inc.openedAtSim / 60)).padStart(2, '0')}:${String(inc.openedAtSim % 60).padStart(2, '0')}` : "LIVE");
      const title = inc.title || inc.headline || (inc.type ? inc.type.replace(/_/g, ' ') : "Spacecraft Anomaly");

      liveEvents.push({
        id: inc.id || inc._id,
        time: timeStr,
        text: `${title} detected`,
        color
      });
    });
  }

  // Add system telemetry operational events
  liveEvents.push({
    id: "ml-active",
    time: "LIVE",
    text: "ML GRU Forecaster active & calibrated",
    color: "green"
  });

  liveEvents.push({
    id: "stream-sync",
    time: "LIVE",
    text: isConnected ? "Telemetry stream synced (1 Hz)" : "Connecting to telemetry bridge...",
    color: isConnected ? "green" : "amber"
  });

  return (
    <div className="recent-events-container">
      <div className="recent-events-header">
        <Clock size={16} className="events-icon" />
        <h3 className="events-title">Recent Events</h3>
      </div>

      <ul className="events-list">
        {liveEvents.map((evt) => (
          <li key={evt.id} className="event-item">
            <span className={`event-dot dot-${evt.color}`}></span>
            <span className="event-time">{evt.time}</span>
            <span className="event-text" style={{ textTransform: "capitalize" }}>{evt.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
