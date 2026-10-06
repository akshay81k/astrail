import React from 'react';
import { useTelemetry } from '../context/TelemetryContext';

export default function Footer() {
  const { formattedMissionTime, source } = useTelemetry();

  return (
    <footer className="footer-container">
      <div className="footer-left">
        <strong>INITIUM</strong>
        <span className="footer-divider">|</span>
        <span>Spacecraft Health Monitor</span>
      </div>

      <div className="footer-center">
        <span>Mission Time: <strong>{formattedMissionTime}</strong></span>
        <span className="footer-divider">|</span>
        <span>Live Telemetry</span>
        <span className="footer-divider">|</span>
        <span>Source: {source}</span>
      </div>

      <div className="footer-right">
        <span className="system-dot"></span>
        <span className="system-text">System Operational</span>
      </div>
    </footer>
  );
}
