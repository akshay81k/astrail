import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import { evaluationApi } from '../api/evaluationApi';
import * as echarts from 'echarts';
import {
  Target,
  Brain,
  Shield,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Activity,
  BarChart2,
  Zap,
  Database
} from 'lucide-react';

/* ─── tiny helpers ──────────────────────────────────────────── */
function pct(v) {
  return v != null ? `${(v * 100).toFixed(1)}%` : '—';
}
function sec2min(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

/* ─── KPI CARD ──────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, color, bar }) {
  return (
    <div className="eval-kpi-card">
      <div className="eval-kpi-icon" style={{ '--kpi-color': color }}>
        <Icon size={20} />
      </div>
      <div className="eval-kpi-body">
        <span className="eval-kpi-label">{label}</span>
        <span className="eval-kpi-value" style={{ color }}>{value}</span>
        {sub && <span className="eval-kpi-sub">{sub}</span>}
        {bar != null && (
          <div className="eval-kpi-bar-track">
            <div
              className="eval-kpi-bar-fill"
              style={{ width: `${(bar * 100).toFixed(1)}%`, background: color }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CHANNEL TABLE ─────────────────────────────────────────── */
function ChannelTable({ channels }) {
  if (!channels || channels.length === 0) return null;
  return (
    <div className="eval-section">
      <h3 className="eval-section-title">
        <Database size={16} /> Per-Channel Detection Metrics · NASA SMAP/MSL
      </h3>
      <div className="eval-channel-table-wrap">
        <table className="eval-channel-table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Subsystem</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1</th>
              <th>TP</th>
              <th>FP</th>
              <th>FN</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.channel}>
                <td className="channel-id">{ch.channel}</td>
                <td>{ch.subsystem}</td>
                <td>
                  <span className="metric-pill" style={{ '--pill-color': '#3b82f6' }}>
                    {pct(ch.precision)}
                  </span>
                </td>
                <td>
                  <span className="metric-pill" style={{ '--pill-color': '#8b5cf6' }}>
                    {pct(ch.recall)}
                  </span>
                </td>
                <td>
                  <span className="metric-pill f1-pill">
                    {pct(ch.f1)}
                  </span>
                </td>
                <td className="count-cell">{ch.tp}</td>
                <td className="count-cell fp">{ch.fp}</td>
                <td className="count-cell fn">{ch.fn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── ROBUSTNESS CHART (ECharts) ────────────────────────────── */
function RobustnessChart({ data }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }
    const ec = instanceRef.current;

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params) =>
          `<b>Missing: ${params[0].name}%</b><br/>` +
          params.map((p) => `${p.marker} ${p.seriesName}: <b>${(p.value * 100).toFixed(1)}%</b>`).join('<br/>')
      },
      legend: {
        top: 8,
        right: 16,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { top: 44, right: 24, bottom: 36, left: 56, containLabel: false },
      xAxis: {
        type: 'category',
        data: data.missingDataSweep.missingPcts.map((v) => `${v}%`),
        axisLabel: { color: '#64748b', fontSize: 11 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0.6,
        max: 1.0,
        axisLabel: { color: '#64748b', fontSize: 11, formatter: (v) => `${(v * 100).toFixed(0)}%` },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }
      },
      series: [
        {
          name: 'F1 Score',
          type: 'line',
          data: data.missingDataSweep.f1Scores,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: '#3b82f6', width: 2.5 },
          itemStyle: { color: '#3b82f6', borderColor: '#1e293b', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59,130,246,0.22)' },
              { offset: 1, color: 'rgba(59,130,246,0)' }
            ])
          }
        },
        {
          name: 'Top-1 Acc',
          type: 'line',
          data: data.missingDataSweep.top1Accuracy,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: '#8b5cf6', width: 2.5 },
          itemStyle: { color: '#8b5cf6', borderColor: '#1e293b', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(139,92,246,0.18)' },
              { offset: 1, color: 'rgba(139,92,246,0)' }
            ])
          }
        }
      ]
    };
    ec.setOption(option, true);

    const resizeObs = new ResizeObserver(() => ec.resize());
    resizeObs.observe(chartRef.current);
    return () => resizeObs.disconnect();
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: 240 }} />;
}

/* ─── LEAD TIME BAR CHART (ECharts) ────────────────────────── */
function LeadTimeChart({ data }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }
    const ec = instanceRef.current;

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (p) => `<b>${p[0].name}</b><br/>${p[0].marker} Events: <b>${p[0].value}</b>`
      },
      grid: { top: 16, right: 24, bottom: 36, left: 48, containLabel: false },
      xAxis: {
        type: 'category',
        data: data.distribution.map((d) => d.range),
        axisLabel: { color: '#64748b', fontSize: 10, rotate: 12 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#64748b', fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }
      },
      series: [
        {
          type: 'bar',
          data: data.distribution.map((d, i) => ({
            value: d.count,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: i <= 2 ? '#22c55e' : '#3b82f6' },
                { offset: 1, color: i <= 2 ? '#16a34a' : '#1d4ed8' }
              ]),
              borderRadius: [4, 4, 0, 0]
            }
          })),
          barMaxWidth: 36,
          label: {
            show: true,
            position: 'top',
            color: '#94a3b8',
            fontSize: 10,
            formatter: '{c}'
          }
        }
      ]
    };
    ec.setOption(option, true);

    const resizeObs = new ResizeObserver(() => ec.resize());
    resizeObs.observe(chartRef.current);
    return () => resizeObs.disconnect();
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: 220 }} />;
}

/* ─── FALSE ALERT CHART ─────────────────────────────────────── */
function FalseAlertChart({ data }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }
    const ec = instanceRef.current;

    const categories = data.noiseLevels.map((n) => `×${n}`);
    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 }
      },
      legend: {
        bottom: 4,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        itemWidth: 12,
        itemHeight: 6
      },
      grid: { top: 16, right: 24, bottom: 52, left: 52, containLabel: false },
      xAxis: {
        type: 'category',
        data: categories,
        name: 'Noise Scale',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLabel: { color: '#64748b', fontSize: 11 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'Alerts/day',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLabel: { color: '#64748b', fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }
      },
      markLine: {
        silent: true,
        lineStyle: { color: '#f59e0b', type: 'dashed' }
      },
      series: [
        {
          name: 'Limit Checking',
          type: 'line',
          data: data.systems.limit_checking,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#f59e0b', width: 2 },
          itemStyle: { color: '#f59e0b' }
        },
        {
          name: 'Detector Alone',
          type: 'line',
          data: data.systems.detector_alone,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#ef4444', width: 2 },
          itemStyle: { color: '#ef4444' }
        },
        {
          name: 'Detector + Noise Logic',
          type: 'line',
          data: data.systems.detector_plus_noise_logic,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#22c55e', width: 2.5 },
          itemStyle: { color: '#22c55e' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(34,197,94,0.14)' },
              { offset: 1, color: 'rgba(34,197,94,0)' }
            ])
          }
        }
      ]
    };
    ec.setOption(option, true);

    const resizeObs = new ResizeObserver(() => ec.resize());
    resizeObs.observe(chartRef.current);
    return () => resizeObs.disconnect();
  }, [data]);

  return <div ref={chartRef} style={{ width: '100%', height: 240 }} />;
}

/* ─── ROOT CAUSE ACCURACY GAUGE ─────────────────────────────── */
function RootCauseGauge({ top1, top3 }) {
  const items = [
    { label: 'Top-1 Accuracy', value: top1, color: '#3b82f6' },
    { label: 'Top-3 Accuracy', value: top3, color: '#22c55e' }
  ];
  return (
    <div className="eval-rc-gauges">
      {items.map((it) => (
        <div key={it.label} className="eval-rc-gauge-item">
          <div className="eval-rc-gauge-label">{it.label}</div>
          <div className="eval-rc-gauge-bar-track">
            <div
              className="eval-rc-gauge-bar-fill"
              style={{ width: pct(it.value), background: it.color }}
            />
          </div>
          <div className="eval-rc-gauge-value" style={{ color: it.color }}>{pct(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── MISMATCH TABLE ────────────────────────────────────────── */
function MismatchTable({ mismatchLevels }) {
  if (!mismatchLevels) return null;
  const rows = Object.entries(mismatchLevels).map(([level, d]) => ({ level, ...d }));
  return (
    <table className="eval-mismatch-table">
      <thead>
        <tr>
          <th>Mismatch Level</th>
          <th>Runs</th>
          <th>Top-1</th>
          <th>Top-3</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.level}>
            <td style={{ textTransform: 'capitalize' }}>{r.level}</td>
            <td>{r.runs}</td>
            <td>
              <span className="metric-pill" style={{ '--pill-color': '#3b82f6' }}>
                {pct(r.top1)}
              </span>
            </td>
            <td>
              <span className="metric-pill" style={{ '--pill-color': '#22c55e' }}>
                {pct(r.top3)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── SEVERITY MAE BARS ─────────────────────────────────────── */
function SeverityBars({ severityMae }) {
  if (!severityMae) return null;
  const entries = Object.entries(severityMae);
  const maxV = Math.max(...entries.map(([, v]) => v));
  return (
    <div className="eval-severity-list">
      {entries.map(([fault, mae]) => (
        <div key={fault} className="eval-severity-row">
          <span className="eval-severity-label">{fault.replace(/_/g, ' ')}</span>
          <div className="eval-severity-bar-track">
            <div
              className="eval-severity-bar-fill"
              style={{
                width: `${(mae / maxV) * 100}%`,
                background: mae < 3 ? '#22c55e' : mae < 4 ? '#f59e0b' : '#ef4444'
              }}
            />
          </div>
          <span className="eval-severity-val">{mae.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

/* ─── INSIGHTS STRIP ─────────────────────────────────────────── */
function InsightStrip({ summary }) {
  if (!summary) return null;
  const items = [
    {
      icon: CheckCircle2,
      color: '#22c55e',
      label: 'Event-level F1',
      val: pct(summary.detection?.f1),
      sub: 'NASA SMAP/MSL'
    },
    {
      icon: Target,
      color: '#3b82f6',
      label: 'Root Cause Top-1',
      val: pct(summary.rootCause?.top1),
      sub: `${summary.rootCause?.runs} runs`
    },
    {
      icon: Shield,
      color: '#8b5cf6',
      label: 'False Alert Rate',
      val: `${summary.falseAlerts?.measuredPerDay}/day`,
      sub: `Target ≤ ${summary.falseAlerts?.targetPerDay}/day`
    },
    {
      icon: Clock,
      color: '#f59e0b',
      label: 'Mean Lead Time',
      val: sec2min(summary.leadTime?.meanSec),
      sub: `Median ${sec2min(summary.leadTime?.medianSec)}`
    },
    {
      icon: Activity,
      color: '#06b6d4',
      label: 'Robustness@0%',
      val: pct(summary.robustness?.f1At0Missing),
      sub: `@50% missing: ${pct(summary.robustness?.f1At50Missing)}`
    },
    {
      icon: Zap,
      color: '#ec4899',
      label: 'Classifier Accuracy',
      val: pct(summary.classification?.accuracy),
      sub: '3-class fault classifier'
    }
  ];

  return (
    <div className="eval-insight-strip">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="eval-insight-chip">
            <div className="eval-insight-chip-icon" style={{ '--chip-color': it.color }}>
              <Icon size={16} />
            </div>
            <div className="eval-insight-chip-text">
              <span className="eval-insight-chip-label">{it.label}</span>
              <span className="eval-insight-chip-val" style={{ color: it.color }}>{it.val}</span>
              <span className="eval-insight-chip-sub">{it.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   MAIN PAGE
────────────────────────────────────────────────────────────── */
export default function Evaluation() {
  const [summary, setSummary] = useState(null);
  const [detection, setDetection] = useState(null);
  const [rootCause, setRootCause] = useState(null);
  const [falseAlerts, setFalseAlerts] = useState(null);
  const [robustness, setRobustness] = useState(null);
  const [leadTime, setLeadTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [sumR, detR, rcR, faR, robR, ltR] = await Promise.allSettled([
          evaluationApi.getSummary(),
          evaluationApi.getDetection(),
          evaluationApi.getRootCause(),
          evaluationApi.getFalseAlerts(),
          evaluationApi.getRobustness(),
          evaluationApi.getLeadTime()
        ]);

        const extract = (r) => r.status === 'fulfilled' ? (r.value?.data ?? r.value) : null;

        setSummary(extract(sumR));
        setDetection(extract(detR));
        setRootCause(extract(rcR));
        setFalseAlerts(extract(faR));
        setRobustness(extract(robR));
        setLeadTime(extract(ltR));
      } catch (e) {
        setError('Failed to load evaluation data. Ensure backend is running on port 5000.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="dashboard-content eval-page">

          {/* ── PAGE HEADER ─────────────────────────────────── */}
          <div className="eval-page-header">
            <div>
              <h1 className="eval-header-title">
                <Brain size={22} className="eval-header-icon" />
                Model Performance &amp; Evaluation
              </h1>
              <p className="eval-header-sub">
                Benchmark results from NASA SMAP/MSL dataset and Physics-based Initium simulator
              </p>
            </div>
            <div className="eval-header-badges">
              <span className="eval-badge eval-badge-live">
                <span className="eval-badge-dot" /> Live Data
              </span>
              <span className="eval-badge eval-badge-seed">Seed: 42</span>
              <span className="eval-badge eval-badge-proto">Event-Level Metrics</span>
            </div>
          </div>

          {loading && (
            <div className="eval-loading">
              <div className="eval-spinner" />
              <span>Loading evaluation metrics…</span>
            </div>
          )}

          {error && (
            <div className="eval-error">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* ── INSIGHT STRIP ─────────────────────────── */}
              <InsightStrip summary={summary} />

              {/* ── TOP KPI GRID ──────────────────────────── */}
              <div className="eval-kpi-grid">
                <KpiCard
                  icon={Target}
                  label="Precision"
                  value={pct(summary?.detection?.precision)}
                  sub={`Recall: ${pct(summary?.detection?.recall)}`}
                  color="#3b82f6"
                  bar={summary?.detection?.precision}
                />
                <KpiCard
                  icon={BarChart2}
                  label="F1 Score"
                  value={pct(summary?.detection?.f1)}
                  sub="Event-level (no point-adjust)"
                  color="#22c55e"
                  bar={summary?.detection?.f1}
                />
                <KpiCard
                  icon={Brain}
                  label="Root Cause Top-3"
                  value={pct(summary?.rootCause?.top3)}
                  sub={`Top-1: ${pct(summary?.rootCause?.top1)}`}
                  color="#8b5cf6"
                  bar={summary?.rootCause?.top3}
                />
                <KpiCard
                  icon={Clock}
                  label="Mean Lead Time"
                  value={sec2min(summary?.leadTime?.meanSec)}
                  sub={`Median: ${sec2min(summary?.leadTime?.medianSec)}`}
                  color="#f59e0b"
                />
                <KpiCard
                  icon={Shield}
                  label="False Alert Rate"
                  value={`${summary?.falseAlerts?.measuredPerDay ?? '—'}/day`}
                  sub={`Target ≤ ${summary?.falseAlerts?.targetPerDay ?? 1}/day over ${summary?.falseAlerts?.faultFreeSimDays ?? 45}d`}
                  color="#06b6d4"
                />
                <KpiCard
                  icon={TrendingUp}
                  label="Severity MAE"
                  value={`${summary?.rootCause?.severityMaePct ?? '—'}%`}
                  sub="Across all fault types"
                  color="#ec4899"
                />
              </div>

              {/* ── CHANNEL TABLE ─────────────────────────── */}
              <ChannelTable channels={detection?.channels} />

              {/* ── ROBUSTNESS + FALSE ALERT (2-col) ─────── */}
              <div className="eval-two-col">
                <div className="eval-section">
                  <h3 className="eval-section-title">
                    <Activity size={16} /> Robustness vs. Missing Data
                  </h3>
                  <p className="eval-section-sub">
                    F1 and Root-Cause accuracy across % of missing sensor readings
                  </p>
                  <RobustnessChart data={robustness} />
                </div>

                <div className="eval-section">
                  <h3 className="eval-section-title">
                    <Shield size={16} /> False Alert Rate vs. Noise Scale
                  </h3>
                  <p className="eval-section-sub">
                    Alert episodes per fault-free day under increasing sensor noise
                  </p>
                  <FalseAlertChart data={falseAlerts} />
                </div>
              </div>

              {/* ── ROOT CAUSE + LEAD TIME (2-col) ───────── */}
              <div className="eval-two-col">
                <div className="eval-section">
                  <h3 className="eval-section-title">
                    <Brain size={16} /> Root Cause Localisation
                  </h3>
                  <RootCauseGauge
                    top1={rootCause?.top1Accuracy}
                    top3={rootCause?.top3Accuracy}
                  />
                  <div style={{ marginTop: 16 }}>
                    <p className="eval-section-sub" style={{ marginBottom: 8 }}>
                      Accuracy by model-plant mismatch level
                    </p>
                    <MismatchTable mismatchLevels={rootCause?.mismatchLevels} />
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <p className="eval-section-sub" style={{ marginBottom: 8 }}>
                      Severity MAE per fault type
                    </p>
                    <SeverityBars severityMae={rootCause?.severityMae} />
                  </div>
                </div>

                <div className="eval-section">
                  <h3 className="eval-section-title">
                    <Clock size={16} /> Lead Time Distribution
                  </h3>
                  <p className="eval-section-sub">
                    How many seconds before hard-limit alarm does ASTRAIL alert?
                  </p>
                  <LeadTimeChart data={leadTime} />
                  {leadTime && (
                    <div className="eval-lead-stats">
                      <div className="eval-lead-stat">
                        <span className="eval-lead-stat-label">Mean</span>
                        <span className="eval-lead-stat-val" style={{ color: '#22c55e' }}>
                          {sec2min(leadTime.meanLeadTimeSec)}
                        </span>
                      </div>
                      <div className="eval-lead-stat">
                        <span className="eval-lead-stat-label">Median</span>
                        <span className="eval-lead-stat-val" style={{ color: '#3b82f6' }}>
                          {sec2min(leadTime.medianLeadTimeSec)}
                        </span>
                      </div>
                      <div className="eval-lead-stat">
                        <span className="eval-lead-stat-label">Undetected by limits</span>
                        <span className="eval-lead-stat-val" style={{ color: '#ec4899' }}>
                          {leadTime.neverCaughtByLimitCheckerCount} events
                        </span>
                      </div>
                    </div>
                  )}
                  {leadTime?.note && (
                    <p className="eval-note">{leadTime.note}</p>
                  )}
                </div>
              </div>

              {/* ── PROTOCOL FOOTER ───────────────────────── */}
              {detection?.evaluationProtocol && (
                <div className="eval-protocol">
                  <AlertCircle size={14} />
                  <span>{detection.evaluationProtocol}</span>
                </div>
              )}
            </>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}
