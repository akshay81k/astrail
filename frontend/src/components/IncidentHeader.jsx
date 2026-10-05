import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Activity, ArrowLeft, Info } from 'lucide-react';

export default function IncidentHeader({ incident }) {
  const navigate = useNavigate();

  const id = incident?.id || incident?.incidentId || '014';
  const displayId = id.toString().startsWith('#') ? id : `#${id}`;
  const severity = incident?.severity || incident?.status?.toUpperCase() || 'CRITICAL';
  const title = incident?.title || incident?.explanation?.headline || 'Thermal anomaly detected';
  const detectedTime = incident?.detectedTime || incident?.openedAtTs || '02:09:40';
  const detectedDate = incident?.detectedDate || 'Oct 05, 2026';
  const confidence = incident?.confidence?.value ? `${Math.round(incident.confidence.value * 100)}%` : (incident?.confidence || '82%');
  const wasConfidence = incident?.confidence?.was || incident?.confidence?.previous || '92%';
  const duration = incident?.duration || '14m 36s';
  const statusNote = incident?.statusNote || '(Ongoing)';

  return (
    <div className="incident-header-card">
      <div className="incident-header-top">
        <div className="breadcrumb">
          <span className="breadcrumb-item" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            Incidents
          </span>
          <span className="breadcrumb-separator">&gt;</span>
          <span className="breadcrumb-current">{displayId}</span>
        </div>
        <button className="btn-back" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          <span>Back to Overview</span>
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
