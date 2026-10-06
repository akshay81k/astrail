import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { LineChart, Maximize2 } from 'lucide-react';

export default function DetectionComparisonChart({ comparisonData, telemetryHistory = [] }) {
  const [timeRange, setTimeRange] = useState('30m');

  // Extract real dynamic or fallback baseline values
  const channelLabel = comparisonData?.channelLabel || 'Battery Temperature';
  const unit = comparisonData?.unit || '°C';
  const detectorTimeStr = comparisonData?.detectorAlertTime || '02:05:44';
  const limitAlarmTimeStr = comparisonData?.limitAlarmTime || '02:16:34';
  const leadTimeStr = comparisonData?.leadTimeStr || '10 min 50 s';
  const hardLimitValue = comparisonData?.limitThreshold?.value !== undefined ? comparisonData.limitThreshold.value : 45;
  const detectorTriggerVal = comparisonData?.detectorTriggerVal !== undefined ? comparisonData.detectorTriggerVal : 32.6;
  const limitTriggerVal = comparisonData?.limitTriggerVal !== undefined ? comparisonData.limitTriggerVal : 45.2;
  const anomalyScore = comparisonData?.anomalyScore !== undefined ? comparisonData.anomalyScore : 0.87;

  // Generate telemetry time series
  const timePoints = [];
  const tempValues = [];

  const defaultTimes = [
    '02:00', '02:02', '02:04', '02:05:44', '02:08', '02:10',
    '02:12', '02:14', '02:16:34', '02:18', '02:21', '02:25', '02:30'
  ];
  const curve = comparisonData?.curveData || [25.0, 25.5, 26.1, 32.6, 34.0, 36.2, 39.5, 42.8, 45.2, 47.8, 48.5, 49.0, 49.5];

  defaultTimes.forEach((t, i) => {
    timePoints.push(t);
    tempValues.push(curve[i] !== undefined ? curve[i] : curve[curve.length - 1]);
  });

  const yMin = Math.min(...tempValues, hardLimitValue) * 0.85;
  const yMax = Math.max(...tempValues, hardLimitValue) * 1.15;

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
        if (time === detectorTimeStr) note = '<div style="color: #A855F7; font-weight: bold; margin-top: 4px;">★ ASTRAIL ML ALERT (Anomaly Pattern)</div>';
        else if (time === limitAlarmTimeStr) note = `<div style="color: #EF4444; font-weight: bold; margin-top: 4px;">⚠ LIMIT ALARM (Hard ${hardLimitValue} ${unit} Limit Crossed)</div>`;

        return `
          <div style="font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px;">
            Mission Time: ${time}
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px;">
            <span>${channelLabel}:</span>
            <strong style="color: #60A5FA;">${val} ${unit}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 2px;">
            <span>Hard Safety Limit:</span>
            <strong style="color: #F87171;">${hardLimitValue} ${unit}</strong>
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
      name: `${channelLabel} (${unit})`,
      nameLocation: 'middle',
      nameGap: 38,
      nameTextStyle: { color: '#64748B', fontSize: 12, fontWeight: '700' },
      min: parseFloat(yMin.toFixed(1)),
      max: parseFloat(yMax.toFixed(1)),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
      axisLabel: { color: '#64748B', fontSize: 11 }
    },
    series: [
      {
        name: 'Early Warning Area',
        type: 'line',
        data: timePoints.map((t) => (t >= detectorTimeStr && t <= limitAlarmTimeStr ? yMax : null)),
        areaStyle: {
          color: 'rgba(238, 242, 255, 0.65)'
        },
        lineStyle: { opacity: 0 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: channelLabel,
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
                formatter: `HARD LIMIT\n${hardLimitValue} ${unit}`,
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
              coord: [detectorTimeStr, detectorTriggerVal],
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
                formatter: `OUR SYSTEM ALERT\n${detectorTimeStr}\nVal: ${detectorTriggerVal} ${unit}\nScore: ${anomalyScore}`,
                color: '#6B21A8',
                fontWeight: 'bold',
                fontSize: 10,
                lineHeight: 12
              }
            },
            {
              name: 'Limit Alarm',
              coord: [limitAlarmTimeStr, limitTriggerVal],
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
                formatter: `LIMIT ALARM\n${limitAlarmTimeStr}\nVal: ${limitTriggerVal} ${unit}\nThreshold crossed`,
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
          <span className="comparison-card-sub">{channelLabel} ({unit})</span>
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
          <span className="legend-line blue-solid"></span> {channelLabel}
        </div>
        <div className="legend-item">
          <span className="legend-line red-dashed"></span> Hard Limit ({hardLimitValue} {unit})
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
