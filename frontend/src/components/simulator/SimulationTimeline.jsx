import React from 'react';
import { Clock, Check } from 'lucide-react';

export default function SimulationTimeline({
  timelineState = {},
  onSelectIncident
}) {
  const {
    faultConfiguredTime,
    injectionStartedTime,
    telemetryRespondingTime,
    anomalyDetectedTime,
    incidentGeneratedTime,
    hasFaultConfigured,
    hasInjected,
    hasTelemetryResponding,
    hasAnomalyDetected,
    hasIncidentGenerated,
    incidentId
  } = timelineState;

  const stages = [
    {
      id: 'configured',
      label: 'Fault Configured',
      time: faultConfiguredTime || (hasFaultConfigured ? 'Configured' : '--:--:--'),
      isCompleted: hasInjected || hasTelemetryResponding,
      isActive: hasFaultConfigured && !hasInjected,
      color: 'cyan'
    },
    {
      id: 'injected',
      label: 'Injection Started',
      time: injectionStartedTime || (hasInjected ? 'Started' : '--:--:--'),
      isCompleted: hasTelemetryResponding || hasAnomalyDetected,
      isActive: hasInjected && !hasTelemetryResponding,
      color: 'cyan'
    },
    {
      id: 'responding',
      label: 'Telemetry Responding',
      time: telemetryRespondingTime || (hasTelemetryResponding ? 'Responding' : '--:--:--'),
      isCompleted: hasAnomalyDetected || hasIncidentGenerated,
      isActive: hasTelemetryResponding && !hasAnomalyDetected,
      color: 'cyan'
    },
    {
      id: 'anomaly',
      label: 'Anomaly Detected',
      time: anomalyDetectedTime || (hasAnomalyDetected ? 'Detected' : '--:--:--'),
      isCompleted: hasIncidentGenerated,
      isActive: hasAnomalyDetected && !hasIncidentGenerated,
      color: 'amber'
    },
    {
      id: 'incident',
      label: 'Incident Generated',
      time: incidentGeneratedTime || (hasIncidentGenerated ? 'Generated' : 'Pending'),
      isCompleted: hasIncidentGenerated,
      isActive: false,
      color: 'pending'
    }
  ];

  return (
    <div className="simulation-timeline-card">
      <div className="timeline-header">
        <Clock size={16} className="text-cyan" />
        <h3 className="timeline-title">SIMULATION TIMELINE</h3>
      </div>

      <div className="timeline-track-wrapper">
        <div className="timeline-steps-row">
          {stages.map((stage, idx) => {
            const isLast = idx === stages.length - 1;

            return (
              <React.Fragment key={stage.id}>
                {/* Stage Node */}
                <div
                  className={`timeline-step-node ${
                    stage.isCompleted
                      ? 'completed'
                      : stage.isActive
                      ? 'active'
                      : 'pending'
                  } ${stage.color}`}
                  onClick={() => {
                    if (stage.id === 'incident' && stage.isCompleted && onSelectIncident) {
                      onSelectIncident(incidentId);
                    }
                  }}
                >
                  <div className="step-marker-container">
                    <div className="step-marker-circle">
                      {stage.isCompleted ? (
                        <Check size={13} className="check-icon" />
                      ) : stage.isActive ? (
                        <div className="pulse-inner-ring" />
                      ) : (
                        <div className="pending-inner-dot" />
                      )}
                    </div>
                  </div>

                  <div className="step-text-stack">
                    <span className="step-name">{stage.label}</span>
                    <span className="step-time">{stage.time}</span>
                  </div>
                </div>

                {/* Connecting Track Line */}
                {!isLast && (
                  <div
                    className={`timeline-track-connector ${
                      stage.isCompleted ? 'filled' : 'dashed'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
