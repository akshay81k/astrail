import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelemetry } from '../context/TelemetryContext';
import { AlertTriangle, Clock, Activity, ArrowLeft, Info } from 'lucide-react';

export default function IncidentHeader({ incident }) {
  const navigate = useNavigate();
  const { missionTimeSec } = useTelemetry();

  const id = incident?.id || incident?.incidentId || '014';
  const displayId = id.toString().startsWith('#') ? id : `#${id}`;
  const severity = (incident?.severity || incident?.status || 'CRITICAL').toUpperCase();
  const title = incident?.title || incident?.headline || incident?.explanation?.headline || 'Spacecraft Telemetry Anomaly';
  const detectedTime = incident?.detectedTime || incident?.openedAt || (incident?.openedAtSim !== undefined ? `02:${String(Math.floor((incident.openedAtSim + 480) / 60)).padStart(2, '0')}:${String((incident.openedAtSim + 480) % 60).padStart(2, '0')}` : '02:08:45');
  const detectedDate = incident?.detectedDate || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  
  const rawConf = incident?.confidence?.value ?? incident?.confidence?.score ?? 0.88;
  const confidence = `${Math.round(rawConf * 100)}%`;
  const rawPrev = incident?.confidence?.previous ?? incident?.confidence?.was ?? Math.min(0.96, rawConf + 0.05);
  const wasConfidence = typeof rawPrev === 'number' ? `${Math.round(rawPrev * 100)}%` : rawPrev;
  
  // Calculate dynamic ongoing duration
  let duration = incident?.duration;
  if (!duration) {
    const startSim = incident?.openedAtSim || 0;
    const currentSim = missionTimeSec || startSim + 65;
    const diffSec = Math.max(5, currentSim - startSim);
    const m = Math.floor(diffSec / 60);
    const s = Math.floor(diffSec % 60);
    duration = m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  const statusNote = incident?.status === 'closed' ? '(Resolved)' : '(Ongoing)';

  return (
    <div className="incident-header-card">
      <div className="incident-header-top">
        <div className="breadcrumb">
          <span className="breadcrumb-item" onClick={() => navigate('/incidents')} style={{ cursor: 'pointer' }}>
            Incidents
          </span>
          <span className="breadcrumb-separator">&gt;</span>
          <span className="breadcrumb-current">{displayId}</span>
        </div>
        <button className="btn-back" onClick={() => navigate('/incidents')}>
          <ArrowLeft size={16} />
          <span>Back to Incidents</span>
        </button>
      </div>

      <div className="incident-header-main">
        <div className="incident-title-section">
          <div className="incident-icon-wrapper">
            <AlertTriangle size={24} className="incident-alert-icon" />
          </div>
          <div>
            <div className="incident-heading-row">
              <h1 className="incident-title">Incident {displayId}</h1>
              <span className={`severity-badge ${severity.toLowerCase()}`}>
                {severity}
              </span>
            </div>
            <p className="incident-subtitle">{title}</p>
          </div>
        </div>

        <div className="incident-metrics">
          <div className="metric-box">
            <div className="metric-icon">
              <Clock size={18} />
            </div>
            <div className="metric-info">
              <span className="metric-label">Detected</span>
              <span className="metric-value">{detectedTime}</span>
              <span className="metric-sub">{detectedDate}</span>
            </div>
          </div>

          <div className="metric-box">
            <div className="metric-icon highlight-red">
              <Activity size={18} />
            </div>
            <div className="metric-info">
              <span className="metric-label">
                Confidence <Info size={12} className="inline-info" />
              </span>
              <span className="metric-value">{confidence}</span>
              <span className="metric-sub">(was {wasConfidence})</span>
            </div>
          </div>

          <div className="metric-box">
            <div className="metric-icon">
              <Clock size={18} />
            </div>
            <div className="metric-info">
              <span className="metric-label">Duration</span>
              <span className="metric-value">{duration}</span>
              <span className="metric-sub">{statusNote}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
