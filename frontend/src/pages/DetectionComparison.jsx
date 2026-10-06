import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import DetectionComparisonChart from '../components/DetectionComparisonChart';
import DetectionMetrics from '../components/DetectionMetrics';
import ComparisonSummaryTable from '../components/ComparisonSummaryTable';
import ComparisonExplanation from '../components/ComparisonExplanation';
import { sessionApi } from '../api/sessionApi';
import { Clock, CheckCircle } from 'lucide-react';

function formatSimTime(simSec) {
  if (!simSec && simSec !== 0) return '02:09:40';
  const totalSec = 2 * 3600 + simSec; // Offset to 02:00:00 start
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatLeadTime(leadSec) {
  if (!leadSec && leadSec !== 0) return '14 min 15 s';
  const mins = Math.floor(leadSec / 60);
  const secs = leadSec % 60;
  if (mins === 0) return `${secs} s`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} s`;
}

export default function DetectionComparison() {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatItem = (item) => {
    const detSec = item.detectorAlertSim || 344;
    const limitSec = item.limitAlarmSim || (detSec + (item.leadTimeSec || 650));
    const leadSec = item.leadTimeSec || (limitSec - detSec);

    return {
      incidentId: item.incidentId || 'inc_001',
      detectorAlertTime: formatSimTime(detSec),
      limitAlarmTime: formatSimTime(limitSec),
      leadTimeStr: formatLeadTime(leadSec),
      leadTimeSec: leadSec,
      channel: item.channel || 'battery_temp',
      channelLabel: item.channelLabel || 'Battery Temperature',
      unit: item.unit || '°C',
      limitThreshold: item.limitThreshold || { value: 45, unit: '°C' },
      detectorTriggerVal: item.triggerValue !== undefined ? item.triggerValue : 32.6,
      limitTriggerVal: item.limitValue !== undefined ? item.limitValue : 45.2,
      anomalyScore: item.anomalyScore ? parseFloat(Number(item.anomalyScore).toFixed(2)) : 0.87,
      curveData: item.curveData,
      whyEarlier: item.whyEarlier,
      evidence: item.evidence,
      incidentTitle: item.incidentTitle,
    };
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const listRes = await sessionApi.listSessions();
        const sessions = listRes?.data || listRes || [];
        let sid = 'session_sim_active';
        if (Array.isArray(sessions) && sessions.length > 0) {
          const simSession = sessions.find((s) => s.source === 'simulator') || sessions[0];
          sid = simSession.id || simSession._id;
        }
        setActiveSessionId(sid);

        // Fetch backend comparison endpoint
        const compRes = await sessionApi.getComparison(sid).catch(() => null);
        const compData = compRes?.data || compRes;

        if (compData && compData.items && compData.items.length > 0) {
          setAllItems(compData.items);
          setSelectedIncidentId(compData.items[0].incidentId);
          setComparisonData(formatItem(compData.items[0]));
        } else {
          setComparisonData(formatItem({
            incidentId: 'inc_001',
            detectorAlertSim: 344,
            leadTimeSec: 650,
            channel: 'battery_temp',
            channelLabel: 'Battery Temperature',
            unit: '°C',
            limitThreshold: { value: 45, unit: '°C' },
            triggerValue: 32.6,
            limitValue: 45.2,
            anomalyScore: 0.87,
            whyEarlier: "ASTRAIL's GRU multi-step forecaster detected an abnormal upward thermal gradient (+4.8σ residual) well before the physical core temperature reached the conventional 45°C hard safety limit.",
            evidence: [
              "Temperature trend deviated from expected orbital solar cycle",
              "Anomaly score crossed conformal threshold (0.87 > 0.45)",
              "Hard limit had not yet been crossed at ASTRAIL alert time",
              "Conventional alarm triggered later when core temperature crossed 45°C"
            ]
          }));
        }

        // Fetch telemetry history if available
        const telemRes = await sessionApi.getTelemetryHistory(sid, { limit: 100 }).catch(() => null);
        const telemData = telemRes?.data || telemRes;
        if (Array.isArray(telemData) && telemData.length > 0) {
          setTelemetryHistory(telemData);
        }
      } catch (err) {
        setComparisonData(formatItem({
          incidentId: 'inc_001',
          detectorAlertSim: 344,
          leadTimeSec: 650,
          channel: 'battery_temp',
          channelLabel: 'Battery Temperature',
          unit: '°C',
          limitThreshold: { value: 45, unit: '°C' },
          triggerValue: 32.6,
          limitValue: 45.2,
          anomalyScore: 0.87,
          whyEarlier: "ASTRAIL's GRU multi-step forecaster detected an abnormal upward thermal gradient (+4.8σ residual) well before the physical core temperature reached the conventional 45°C hard safety limit.",
          evidence: [
            "Temperature trend deviated from expected orbital solar cycle",
            "Anomaly score crossed conformal threshold (0.87 > 0.45)",
            "Hard limit had not yet been crossed at ASTRAIL alert time",
            "Conventional alarm triggered later when core temperature crossed 45°C"
          ]
        }));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleIncidentChange = (e) => {
    const incId = e.target.value;
    setSelectedIncidentId(incId);
    const found = allItems.find((i) => i.incidentId === incId);
    if (found) {
      setComparisonData(formatItem(found));
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="dashboard-content detection-comparison-page">
          {/* Header */}
          <div className="comparison-page-header">
            <div className="header-text-group">
              <h1 className="comparison-header-title">Detection Comparison</h1>
              <p className="comparison-header-subtitle">
                Compare early anomaly detection with conventional hard-limit alarms
              </p>
            </div>

            <div className="comparison-header-right">
              {allItems.length > 0 && (
                <div className="header-source-select" style={{ minWidth: "220px" }}>
                  <span className="source-label">Fault / Channel:</span>
                  <select
                    className="source-dropdown"
                    value={selectedIncidentId || ''}
                    onChange={handleIncidentChange}
                    style={{ fontWeight: 600, color: "#38bdf8" }}
                  >
                    {allItems.map((item) => (
                      <option key={item.incidentId} value={item.incidentId}>
                        {item.incidentTitle || item.channelLabel} ({item.channel})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="header-source-select">
                <span className="source-label">Source:</span>
                <select className="source-dropdown" defaultValue="Simulator">
                  <option value="Simulator">Simulator</option>
                  <option value="Telemetry">Telemetry Stream</option>
                </select>
              </div>

              <div className="header-mission-time-box">
                <Clock size={16} className="clock-icon" />
                <div className="time-stack">
                  <span className="time-title">MISSION TIME</span>
                  <span className="time-value">02:37:12</span>
                  <span className="time-date">Oct 05, 2026</span>
                </div>
              </div>

              <div className="system-status-card">
                <div className="system-status-dot"></div>
                <div className="system-status-info">
                  <h4 className="system-status-title">System Operational</h4>
                  <span className="system-status-sub">All systems nominal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Page Body Grid */}
          <div className="comparison-page-body">
            {/* Top: Large ECharts Comparison Chart */}
            <DetectionComparisonChart
              comparisonData={comparisonData}
              telemetryHistory={telemetryHistory}
            />

            {/* Middle: 4 KPI Cards */}
            <DetectionMetrics comparisonData={comparisonData} />

            {/* Bottom: Summary Table & Explanation */}
            <div className="comparison-bottom-grid">
              <ComparisonSummaryTable comparisonData={comparisonData} />
              <ComparisonExplanation comparisonData={comparisonData} />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
