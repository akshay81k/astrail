import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  Thermometer,
  Sun,
  Sparkles
} from 'lucide-react';

const COMMON_CHART_CONFIG = {
  animationDuration: 250,
  animationEasing: 'cubicOut',
  grid: {
    top: 25,
    right: 18,
    bottom: 22,
    left: 36,
    containLabel: false
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#06152B',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 1,
    textStyle: { color: '#F8FAFC', fontSize: 11, fontFamily: 'Inter' }
  }
};

export default function TelemetryCharts({
  telemetryData = [],
  selectedSubsystem,
  hoveredSubsystem,
  timeRange = '1m',
  isPlaying = true
}) {
  // Filter telemetry window based on selected timeRange (1m = 18 pts, 5m = 45 pts, 30m = 90 pts, 1h = 120 pts)
  const windowedData = useMemo(() => {
    if (!telemetryData || telemetryData.length === 0) return [];
    let count = 45;
    if (timeRange === '1m') count = 18;
    else if (timeRange === '5m') count = 45;
    else if (timeRange === '30m') count = 90;
    else if (timeRange === '1h') count = 120;
    return telemetryData.slice(-count);
  }, [telemetryData, timeRange]);

  const timestamps = useMemo(() => windowedData.map((d) => d.timestamp), [windowedData]);
  const batteryValues = useMemo(() => windowedData.map((d) => d.batteryTemp), [windowedData]);
  const solarValues = useMemo(() => windowedData.map((d) => d.solarCurrent), [windowedData]);
  const scoreValues = useMemo(() => windowedData.map((d) => d.anomalyScore), [windowedData]);

  // Derive stats for KPI strips from real data
  const batteryStats = useMemo(() => {
    const valid = batteryValues.filter((v) => v !== undefined && v !== null);
    if (valid.length === 0) {
      return { current: '—', min: '—', max: '—', status: 'WAITING', color: 'blue' };
    }
    const current = valid[valid.length - 1];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const isAnomaly = current > 38.0 || max > 40.0;
    const isWarning = current > 30.0 || max > 34.0;
    return {
      current: `${current.toFixed(1)} °C`,
      min: `${min.toFixed(1)} °C`,
      max: `${max.toFixed(1)} °C`,
      status: isAnomaly ? 'ANOMALY' : isWarning ? 'WARNING' : 'NOMINAL',
      color: isAnomaly ? 'red' : isWarning ? 'amber' : 'green'
    };
  }, [batteryValues]);

  const solarStats = useMemo(() => {
    const valid = solarValues.filter((v) => v !== undefined && v !== null);
    if (valid.length === 0) {
      return { current: '—', min: '—', max: '—', status: 'WAITING', color: 'blue' };
    }
    const current = valid[valid.length - 1];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const isCrit = current < 1.5;
    const isDegraded = current < 3.2 || min < 2.5;
    return {
      current: `${current.toFixed(1)} A`,
      min: `${min.toFixed(1)} A`,
      max: `${max.toFixed(1)} A`,
      status: isCrit ? 'CRITICAL' : isDegraded ? 'DEGRADED' : 'NOMINAL',
      color: isCrit ? 'red' : isDegraded ? 'amber' : 'green'
    };
  }, [solarValues]);

  const anomalyStats = useMemo(() => {
    const valid = scoreValues.filter((v) => v !== undefined && v !== null);
    if (valid.length === 0) {
      return { current: '—', peak: '—', threshold: '—', status: 'WAITING', color: 'blue' };
    }
    const current = valid[valid.length - 1];
    const peak = Math.max(...valid);
    const latestThresh = windowedData[windowedData.length - 1]?.threshold ?? 2.1;
    const isAnomaly = current >= latestThresh || peak >= latestThresh;
    const isWarning = current > 1.4;
    return {
      current: current.toFixed(2),
      peak: peak.toFixed(2),
      threshold: latestThresh.toFixed(2),
      status: isAnomaly ? 'ANOMALY' : isWarning ? 'WARNING' : 'NOMINAL',
      color: isAnomaly ? 'red' : isWarning ? 'amber' : 'green'
    };
  }, [scoreValues, windowedData]);

  // Find anomaly points for markers from real telemetry flags
  const batteryAnomaly = useMemo(() => {
    return windowedData.find((d) => d.isAnomalyPeak || (d.batteryTemp !== undefined && d.batteryTemp > 38.0));
  }, [windowedData]);

  const solarDeviation = useMemo(() => {
    return windowedData.find((d) => (d.regime === 'sunlight' && d.solarCurrent !== undefined && d.solarCurrent < 3.0) || d.isAnomalyPeak);
  }, [windowedData]);

  const scoreAnomaly = useMemo(() => {
    return windowedData.find((d) => (d.threshold !== undefined && d.anomalyScore !== undefined && d.anomalyScore >= d.threshold) || d.isAnomalyPeak);
  }, [windowedData]);

  // Highlighting synchronization with 3D scene & callouts
  const isBatteryCardHighlighted = selectedSubsystem === 'battery' || hoveredSubsystem === 'battery' || selectedSubsystem === 'thermal';
  const isSolarCardHighlighted = selectedSubsystem === 'solar' || hoveredSubsystem === 'solar';
  const isAnomalyCardHighlighted = selectedSubsystem === 'wheel' || hoveredSubsystem === 'wheel' || anomalyStats.status === 'ANOMALY';

  // 1. Battery Temperature Chart Option
  const batteryOption = useMemo(() => {
    const valid = batteryValues.filter((v) => v !== undefined && v !== null);
    const minVal = valid.length > 0 ? Math.min(...valid) : 20;
    const maxVal = valid.length > 0 ? Math.max(...valid) : 32;
    const yMin = Math.max(0, Math.floor(Math.min(minVal, 20) - 2));
    const yMax = Math.ceil(Math.max(maxVal, 32) + 3);

    return {
      ...COMMON_CHART_CONFIG,
      xAxis: {
        type: 'category',
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (val) => val ? val.substring(0, 5) : ''
        }
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
        axisLabel: { color: '#64748B', fontSize: 10 }
      },
      series: [
        {
          name: 'Normal Limit',
          type: 'line',
          data: timestamps.map(() => 30.0),
          lineStyle: { type: 'dashed', color: '#38BDF8', width: 1.2 },
          showSymbol: false,
          tooltip: { show: false }
        },
        {
          name: 'Temperature',
          type: 'line',
          smooth: 0.35,
          data: batteryValues,
          lineStyle: { color: '#EF4444', width: 2.2, shadowColor: 'rgba(239, 68, 68, 0.5)', shadowBlur: 8 },
          itemStyle: { color: '#EF4444' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(239, 68, 68, 0.35)' },
              { offset: 1, color: 'rgba(239, 68, 68, 0.01)' }
            ])
          },
          showSymbol: false,
          markPoint: batteryAnomaly && batteryAnomaly.batteryTemp !== undefined
            ? {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#EF4444', borderColor: '#FFFFFF', borderWidth: 2 },
                data: [{ coord: [batteryAnomaly.timestamp, batteryAnomaly.batteryTemp] }]
              }
            : undefined
        }
      ]
    };
  }, [timestamps, batteryValues, batteryAnomaly]);

  // 2. Solar Current Chart Option
  const solarOption = useMemo(() => {
    const valid = solarValues.filter((v) => v !== undefined && v !== null);
    const maxVal = valid.length > 0 ? Math.max(...valid) : 6;
    const yMax = Math.max(6, Math.ceil(maxVal + 0.5));

    return {
      ...COMMON_CHART_CONFIG,
      xAxis: {
        type: 'category',
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (val) => val ? val.substring(0, 5) : ''
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
        axisLabel: { color: '#64748B', fontSize: 10 }
      },
      series: [
        {
          name: 'Nominal Baseline',
          type: 'line',
          data: timestamps.map(() => 5.2),
          lineStyle: { type: 'dashed', color: '#38BDF8', width: 1.2 },
          showSymbol: false,
          tooltip: { show: false }
        },
        {
          name: 'Current',
          type: 'line',
          smooth: 0.3,
          data: solarValues,
          lineStyle: { color: '#38BDF8', width: 2.2, shadowColor: 'rgba(56, 189, 248, 0.5)', shadowBlur: 8 },
          itemStyle: { color: '#38BDF8' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56, 189, 248, 0.3)' },
              { offset: 1, color: 'rgba(56, 189, 248, 0.01)' }
            ])
          },
          showSymbol: false,
          markPoint: solarDeviation && solarDeviation.solarCurrent !== undefined
            ? {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#F59E0B', borderColor: '#FFFFFF', borderWidth: 2 },
                data: [{ coord: [solarDeviation.timestamp, solarDeviation.solarCurrent] }]
              }
            : undefined
        }
      ]
    };
  }, [timestamps, solarValues, solarDeviation]);

  // 3. Anomaly Score Chart Option (using real score and dynamic conformal threshold)
  const anomalyOption = useMemo(() => {
    const valid = scoreValues.filter((v) => v !== undefined && v !== null);
    const maxVal = valid.length > 0 ? Math.max(...valid) : 3;
    const yMax = Math.max(3.5, Math.ceil(maxVal + 0.5));
    const thresholds = windowedData.map((d) => d.threshold ?? 2.1);

    return {
      ...COMMON_CHART_CONFIG,
      xAxis: {
        type: 'category',
        data: timestamps,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (val) => val ? val.substring(0, 5) : ''
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } },
        axisLabel: { color: '#64748B', fontSize: 10 }
      },
      series: [
        {
          name: 'Conformal Threshold',
          type: 'line',
          data: thresholds,
          lineStyle: { type: 'dashed', color: '#EF4444', width: 1.4 },
          showSymbol: false,
          tooltip: { show: false }
        },
        {
          name: 'Anomaly Score',
          type: 'line',
          smooth: 0.35,
          data: scoreValues,
          lineStyle: { color: '#8B5CF6', width: 2.4, shadowColor: 'rgba(139, 92, 246, 0.6)', shadowBlur: 10 },
          itemStyle: { color: '#8B5CF6' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(139, 92, 246, 0.45)' },
              { offset: 1, color: 'rgba(139, 92, 246, 0.01)' }
            ])
          },
          showSymbol: false,
          markPoint: scoreAnomaly && scoreAnomaly.anomalyScore !== undefined
            ? {
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: { color: '#EF4444', borderColor: '#FFFFFF', borderWidth: 2 },
                data: [
                  {
                    coord: [
                      scoreAnomaly.timestamp,
                      scoreAnomaly.anomalyScore
                    ]
                  }
                ]
              }
            : undefined
        }
      ]
    };
  }, [timestamps, scoreValues, windowedData, scoreAnomaly]);

  return (
    <div className="telemetry-section-container">
      {/* 3 Telemetry Cards Grid */}
      <div className="telemetry-cards-grid">
        {/* 1. BATTERY TEMPERATURE */}
        <div className={`telemetry-chart-card ${isBatteryCardHighlighted ? 'highlighted-subsystem' : ''}`}>
          <div className="telemetry-card-top">
            <div className="telemetry-card-heading">
              <Thermometer size={16} className="text-red" />
              <h3 className="telemetry-card-title">Battery Temperature (°C)</h3>
            </div>
            <div className="telemetry-card-top-right">
              <div className="chart-live-badge">
                <span className={`badge-live-dot ${isPlaying ? 'active' : 'paused'}`} />
                <span>Live</span>
              </div>
              <div className="latest-val-badge badge-red">
                {batteryStats.current}
              </div>
            </div>
          </div>

          <div className="telemetry-chart-wrapper">
            {windowedData.length === 0 && (
              <div className="telemetry-waiting-overlay">
                <span>WAITING FOR TELEMETRY</span>
              </div>
            )}
            <ReactECharts
              option={batteryOption}
              style={{ height: '145px', width: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>

          {/* Legend */}
          <div className="telemetry-legend-row">
            <div className="legend-entry">
              <span className="legend-line red-solid" />
              <span>Temperature</span>
            </div>
            <div className="legend-entry">
              <span className="legend-line cyan-dashed" />
              <span>Normal Range</span>
            </div>
            <div className="legend-entry">
              <span className="legend-dot red-dot" />
              <span>Anomaly</span>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="kpi-strip">
            <div className="kpi-col">
              <span className="kpi-lbl">Current</span>
              <span className="kpi-val">{batteryStats.current}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Min</span>
              <span className="kpi-val">{batteryStats.min}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Max</span>
              <span className="kpi-val">{batteryStats.max}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Status</span>
              <span className={`kpi-status-tag ${batteryStats.color}`}>
                {batteryStats.status}
              </span>
            </div>
          </div>
        </div>

        {/* 2. SOLAR CURRENT */}
        <div className={`telemetry-chart-card ${isSolarCardHighlighted ? 'highlighted-subsystem' : ''}`}>
          <div className="telemetry-card-top">
            <div className="telemetry-card-heading">
              <Sun size={16} className="text-cyan" />
              <h3 className="telemetry-card-title">Solar Current (A)</h3>
            </div>
            <div className="telemetry-card-top-right">
              <div className="chart-live-badge">
                <span className={`badge-live-dot ${isPlaying ? 'active' : 'paused'}`} />
                <span>Live</span>
              </div>
              <div className="latest-val-badge badge-cyan">
                {solarStats.current}
              </div>
            </div>
          </div>

          <div className="telemetry-chart-wrapper">
            {windowedData.length === 0 && (
              <div className="telemetry-waiting-overlay">
                <span>WAITING FOR TELEMETRY</span>
              </div>
            )}
            <ReactECharts
              option={solarOption}
              style={{ height: '145px', width: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>

          {/* Legend */}
          <div className="telemetry-legend-row">
            <div className="legend-entry">
              <span className="legend-line cyan-solid" />
              <span>Current</span>
            </div>
            <div className="legend-entry">
              <span className="legend-line cyan-dashed" />
              <span>Normal Range</span>
            </div>
            <div className="legend-entry">
              <span className="legend-dot red-dot" />
              <span>Anomaly</span>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="kpi-strip">
            <div className="kpi-col">
              <span className="kpi-lbl">Current</span>
              <span className="kpi-val">{solarStats.current}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Min</span>
              <span className="kpi-val">{solarStats.min}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Max</span>
              <span className="kpi-val">{solarStats.max}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Status</span>
              <span className={`kpi-status-tag ${solarStats.color}`}>
                {solarStats.status}
              </span>
            </div>
          </div>
        </div>

        {/* 3. ANOMALY SCORE */}
        <div className={`telemetry-chart-card ${isAnomalyCardHighlighted ? 'highlighted-subsystem' : ''}`}>
          <div className="telemetry-card-top">
            <div className="telemetry-card-heading">
              <Sparkles size={16} className="text-purple" />
              <h3 className="telemetry-card-title">Anomaly Score</h3>
            </div>
            <div className="telemetry-card-top-right">
              <div className="chart-live-badge">
                <span className={`badge-live-dot ${isPlaying ? 'active' : 'paused'}`} />
                <span>Live</span>
              </div>
              <div className="latest-val-badge badge-purple">
                {anomalyStats.current}
              </div>
            </div>
          </div>

          <div className="telemetry-chart-wrapper">
            {windowedData.length === 0 && (
              <div className="telemetry-waiting-overlay">
                <span>WAITING FOR TELEMETRY</span>
              </div>
            )}
            <ReactECharts
              option={anomalyOption}
              style={{ height: '145px', width: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>

          {/* Legend */}
          <div className="telemetry-legend-row">
            <div className="legend-entry">
              <span className="legend-line purple-solid" />
              <span>Score</span>
            </div>
            <div className="legend-entry">
              <span className="legend-line red-dashed" />
              <span>Threshold</span>
            </div>
            <div className="legend-entry">
              <span className="legend-dot red-dot" />
              <span>Anomaly</span>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="kpi-strip">
            <div className="kpi-col">
              <span className="kpi-lbl">Current</span>
              <span className="kpi-val">{anomalyStats.current}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Peak</span>
              <span className="kpi-val">{anomalyStats.peak}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Threshold</span>
              <span className="kpi-val">{anomalyStats.threshold}</span>
            </div>
            <div className="kpi-col">
              <span className="kpi-lbl">Status</span>
              <span className={`kpi-status-tag ${anomalyStats.color}`}>
                {anomalyStats.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
