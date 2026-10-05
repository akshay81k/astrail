import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { LineChart, Maximize2 } from 'lucide-react';

export default function DetectionComparisonChart({ comparisonData, telemetryHistory = [] }) {
  const [timeRange, setTimeRange] = useState('30m');

  // Extract or fallback baseline values
  const detectorTimeStr = comparisonData?.detectorAlertTime || '02:09:40';
  const limitAlarmTimeStr = comparisonData?.limitAlarmTime || '02:23:55';
  const leadTimeStr = comparisonData?.leadTimeStr || '14 min 15 s';
  const hardLimitValue = comparisonData?.limitThreshold?.value || 45;
  const detectorTemp = comparisonData?.detectorTemp || 32.6;
  const limitTemp = comparisonData?.limitTemp || 45.2;

  // Generate smooth telemetry time series if history is loading
  const timePoints = [];
  const tempValues = [];

  if (telemetryHistory.length > 0) {
    telemetryHistory.forEach((t) => {
      timePoints.push(t.timestamp || t.time);
      tempValues.push(t.batteryTemp || t.value);
    });
  } else {
    // Standard mock curve matching the reference screenshot
    const times = [
      '02:00', '02:02', '02:04', '02:06', '02:08', '02:09:40',
      '02:12', '02:15', '02:18', '02:21', '02:23:55', '02:27', '02:30'
    ];
    const temps = [25.0, 25.5, 26.1, 26.8, 28.5, 32.6, 34.0, 36.2, 39.5, 42.8, 45.2, 47.8, 48.5];

    times.forEach((t, i) => {
      timePoints.push(t);
      tempValues.push(temps[i]);
    });
  }

  const option = {
    animationDuration: 500,
    grid: {
      top: 75,
      right: 35,
      bottom: 45,
      left: 55,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0F1F4B',
      borderColor: 'transparent',
      textStyle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter' },
      formatter: (params) => {
        const item = params[0];
        const val = item.value;
        const time = item.axisValue;
        let note = '';
        if (time === detectorTimeStr) note = '<div style="color: #A855F7; font-weight: bold; margin-top: 4px;">★ OUR SYSTEM ALERT (Anomaly Pattern)</div>';
        else if (time === limitAlarmTimeStr) note = '<div style="color: #EF4444; font-weight: bold; margin-top: 4px;">⚠ LIMIT ALARM (> 45°C Threshold)</div>';

        return `
          <div style="font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px;">
            Mission Time: ${time}
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span>Battery Temp:</span>
            <strong style="color: #60A5FA;">${val} °C</strong>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
            <span>Hard Limit:</span>
            <strong style="color: #F87171;">45 °C</strong>
          </div>
          ${note}
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: timePoints,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#CBD5E1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '600'
      }
    },
    yAxis: {
      type: 'value',
      name: 'Temperature (°C)',
      nameLocation: 'middle',
      nameGap: 38,
      nameTextStyle: { color: '#64748B', fontSize: 12, fontWeight: '700' },
      min: 15,
      max: 55,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
      axisLabel: { color: '#64748B', fontSize: 11 }
    },
    series: [
      {
        name: 'Early Warning Area',
        type: 'line',
        data: timePoints.map((t) => (t >= detectorTimeStr && t <= limitAlarmTimeStr ? 55 : null)),
        areaStyle: {
          color: 'rgba(238, 242, 255, 0.65)'
        },
        lineStyle: { opacity: 0 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Battery Temperature',
        type: 'line',
        smooth: 0.35,
        data: tempValues,
        lineStyle: {
          color: '#2563EB',
          width: 3.5
        },
        itemStyle: { color: '#2563EB' },
        showSymbol: true,
        symbolSize: 6,
        markLine: {
          symbol: ['none', 'none'],
          data: [
            {
              name: 'Hard Limit',
              yAxis: hardLimitValue,
              lineStyle: { type: 'dashed', color: '#EF4444', width: 2 },
              label: {
                show: true,
                position: 'end',
                formatter: 'HARD LIMIT\n45°C',
                color: '#DC2626',
                fontWeight: 'bold',
                fontSize: 10,
                backgroundColor: '#FEE2E2',
                padding: [4, 6],
                borderRadius: 4
              }
            },
            {
              name: 'Our System Alert Line',
              xAxis: detectorTimeStr,
              lineStyle: { type: 'dashed', color: '#9333EA', width: 2 },
              label: { show: false }
            },
            {
              name: 'Limit Alarm Line',
              xAxis: limitAlarmTimeStr,
              lineStyle: { type: 'dashed', color: '#DC2626', width: 2 },
              label: { show: false }
            }
          ]
        },
        markPoint: {
          data: [
            {
              name: 'Our System Alert',
              coord: [detectorTimeStr, detectorTemp],
              symbol: 'roundRect',
              symbolSize: [140, 52],
              symbolOffset: [0, -42],
              itemStyle: {
                color: '#F3E8FF',
                borderColor: '#C084FC',
                borderWidth: 1.5,
                shadowColor: 'rgba(168, 85, 247, 0.2)',
                shadowBlur: 8
              },
              label: {
                formatter: `OUR SYSTEM ALERT\n${detectorTimeStr}\nTemp: ${detectorTemp}°C\nScore: 0.87`,
                color: '#6B21A8',
                fontWeight: 'bold',
                fontSize: 10,
                lineHeight: 12
              }
            },
            {
              name: 'Limit Alarm',
              coord: [limitAlarmTimeStr, limitTemp],
              symbol: 'roundRect',
              symbolSize: [130, 52],
              symbolOffset: [0, -42],
              itemStyle: {
                color: '#FEE2E2',
                borderColor: '#FCA5A5',
                borderWidth: 1.5,
                shadowColor: 'rgba(239, 68, 68, 0.2)',
                shadowBlur: 8
              },
              label: {
                formatter: `LIMIT ALARM\n${limitAlarmTimeStr}\nTemp: ${limitTemp}°C\nThreshold crossed`,
                color: '#991B1B',
                fontWeight: 'bold',
                fontSize: 10,
                lineHeight: 12
              }
            }
          ]
        }
      }
    ]
  };

  return (
    <div className="card comparison-chart-card">
      <div className="chart-card-header">
        <div className="title-left">
          <div className="title-row">
            <LineChart size={20} className="icon-blue" />
            <h2 className="comparison-card-title">DETECTION COMPARISON</h2>
          </div>
          <span className="comparison-card-sub">Battery Temperature (°C)</span>
        </div>

        <div className="chart-header-controls">
          <div className="range-selector">
            {['1m', '5m', '30m', '1h'].map((r) => (
              <button
                key={r}
                className={`range-btn ${timeRange === r ? 'active' : ''}`}
                onClick={() => setTimeRange(r)}
              >
                {r}
              </button>
            ))}
          </div>

          <button className="btn-fit-view">
            <Maximize2 size={13} /> Fit View
          </button>
        </div>
      </div>

      <div className="comparison-legend-row">
        <div className="legend-item">
          <span className="legend-line blue-solid"></span> Battery Temperature
        </div>
        <div className="legend-item">
          <span className="legend-line red-dashed"></span> Hard Limit (45°C)
        </div>
        <div className="legend-item">
          <span className="legend-dot purple-dot"></span> Our System Alert
        </div>
        <div className="legend-item">
          <span className="legend-dot red-dot"></span> Limit Alarm
        </div>
      </div>

      <div className="echarts-wrapper-relative">
        <ReactECharts
          option={option}
          style={{ height: '380px', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />

        {/* Visual Early Warning Window Banner Overlay */}
        <div className="early-warning-banner-overlay">
          <span className="arrow-line left">&lt;─</span>
          <span className="banner-text">
            EARLY WARNING WINDOW: <strong>{leadTimeStr}</strong>
          </span>
          <span className="arrow-line right">─&gt;</span>
        </div>
      </div>
    </div>
  );
}
