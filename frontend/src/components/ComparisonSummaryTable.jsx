import React from 'react';
import { FileText, Info } from 'lucide-react';

export default function ComparisonSummaryTable({ comparisonData }) {
  const channelLabel = comparisonData?.channelLabel || 'Battery Temperature';
  const unit = comparisonData?.unit || '°C';
  const detectorTimeStr = comparisonData?.detectorAlertTime || '02:05:44';
  const limitAlarmTimeStr = comparisonData?.limitAlarmTime || '02:16:34';
  const leadTimeStr = comparisonData?.leadTimeStr || '10 min 50 s';
  const detectorVal = comparisonData?.detectorTriggerVal !== undefined ? comparisonData.detectorTriggerVal : 32.6;
  const limitVal = comparisonData?.limitTriggerVal !== undefined ? comparisonData.limitTriggerVal : 45.2;
  const hardLimitVal = comparisonData?.limitThreshold?.value !== undefined ? comparisonData.limitThreshold.value : 45;
  const scoreStr = comparisonData?.anomalyScore ? `${comparisonData.anomalyScore} (threshold 0.45)` : '0.87 (threshold 0.45)';

  return (
    <div className="card comparison-summary-card">
      <div className="card-header-row">
        <div className="title-row">
          <FileText size={18} className="title-icon" />
          <h3 className="card-title">Comparison Summary</h3>
        </div>
        <Info size={16} className="info-icon" />
      </div>

      <div className="table-responsive">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Our System (ASTRAIL)</th>
              <th>Conventional Limit Checking</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="metric-col">Detection Time</td>
              <td className="val-col font-mono">{detectorTimeStr}</td>
              <td className="val-col font-mono">{limitAlarmTimeStr}</td>
            </tr>
            <tr>
              <td className="metric-col">Trigger Condition</td>
              <td className="val-col">Anomaly pattern (trend / conformal P99)</td>
              <td className="val-col">Hard threshold ({hardLimitVal} {unit})</td>
            </tr>
            <tr>
              <td className="metric-col">{channelLabel} at Trigger</td>
              <td className="val-col font-mono">{detectorVal} {unit}</td>
              <td className="val-col font-mono">{limitVal} {unit}</td>
            </tr>
            <tr>
              <td className="metric-col">Lead Time</td>
              <td className="val-col highlight-green-text">{leadTimeStr} earlier</td>
              <td className="val-col muted-dash">—</td>
            </tr>
            <tr>
              <td className="metric-col">Anomaly Score</td>
              <td className="val-col">{scoreStr}</td>
              <td className="val-col muted-dash">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
