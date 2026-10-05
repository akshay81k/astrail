import React from 'react';
import { FileText, Info } from 'lucide-react';

export default function ComparisonSummaryTable({ comparisonData }) {
  const detectorTimeStr = comparisonData?.detectorAlertTime || '02:09:40';
  const limitAlarmTimeStr = comparisonData?.limitAlarmTime || '02:23:55';
  const leadTimeStr = comparisonData?.leadTimeStr || '14 min 15 s';
  const detectorTemp = comparisonData?.detectorTemp || 32.6;
  const limitTemp = comparisonData?.limitTemp || 45.2;
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
              <td className="val-col">Anomaly pattern (trend)</td>
              <td className="val-col">Hard threshold (&gt; 45°C)</td>
            </tr>
            <tr>
              <td className="metric-col">Temperature at Trigger</td>
              <td className="val-col font-mono">{detectorTemp}°C</td>
              <td className="val-col font-mono">{limitTemp}°C</td>
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
