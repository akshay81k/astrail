import React from 'react';
import { Activity, Clock, AlertTriangle, Thermometer, Info } from 'lucide-react';

export default function DetectionMetrics({ comparisonData }) {
  const detectorTimeStr = comparisonData?.detectorAlertTime || '02:05:44';
  const limitAlarmTimeStr = comparisonData?.limitAlarmTime || '02:16:34';
  const leadTimeStr = comparisonData?.leadTimeStr || '10 min 50 s';
  const channelLabel = comparisonData?.channelLabel || 'Battery temperature';
  const unit = comparisonData?.unit || '°C';
  const hardLimitStr = comparisonData?.limitThreshold?.value !== undefined 
    ? `${comparisonData.limitThreshold.value} ${unit}` 
    : `45 ${unit}`;

  return (
    <div className="detection-metrics-grid">
      {/* Card 1: Our System Detection */}
      <div className="metric-kpi-card purple-tint">
        <div className="kpi-icon-box purple">
          <Activity size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">
            OUR SYSTEM DETECTION <Info size={12} className="inline-info" />
          </span>
          <h2 className="kpi-value">{detectorTimeStr}</h2>
          <span className="kpi-sub">Anomaly pattern detected</span>
        </div>
      </div>

      {/* Card 2: Early Detection Advantage (Primary Highlighted KPI) */}
      <div className="metric-kpi-card blue-highlight">
        <div className="kpi-icon-box blue">
          <Clock size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label blue">EARLY DETECTION ADVANTAGE</span>
          <h2 className="kpi-value blue-text">{leadTimeStr}</h2>
          <span className="kpi-sub">Earlier than conventional alarm</span>
        </div>
      </div>

      {/* Card 3: Limit Alarm */}
      <div className="metric-kpi-card red-tint">
        <div className="kpi-icon-box red">
          <AlertTriangle size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">LIMIT ALARM</span>
          <h2 className="kpi-value">{limitAlarmTimeStr}</h2>
          <span className="kpi-sub">Hard limit threshold crossed</span>
        </div>
      </div>

      {/* Card 4: Hard Limit */}
      <div className="metric-kpi-card yellow-tint">
        <div className="kpi-icon-box yellow">
          <Thermometer size={20} />
        </div>
        <div className="kpi-content">
          <span className="kpi-label">HARD LIMIT</span>
          <h2 className="kpi-value">{hardLimitStr}</h2>
          <span className="kpi-sub">{channelLabel} safety limit</span>
        </div>
      </div>
    </div>
  );
}
