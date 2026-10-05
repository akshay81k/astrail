import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTelemetry } from '../context/TelemetryContext';
import { Sun } from 'lucide-react';

export default function SolarCurrentChart() {
  const { telemetryData, activeAlertId } = useTelemetry();

  const timestamps = telemetryData.map((d) => d.timestamp);
  const currentValues = telemetryData.map((d) => d.solarCurrent);

  const anomalyIndex = telemetryData.findIndex(
    (d) => d.timestamp === '02:11:08' || d.isAnomalyPeak
  );
  const anomalyPoint = anomalyIndex !== -1 ? telemetryData[anomalyIndex] : null;

  const isHighlighted = activeAlertId === 'alert-2'; // Solar current warning alert

  const option = {
    animationDuration: 300,
    grid: {
      top: 35,
      right: 20,
      bottom: 30,
      left: 45,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0F1F4B',
      borderColor: 'transparent',
      textStyle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter' },
      formatter: (params) => {
        const item = params[0];
        const dataItem = telemetryData[item.dataIndex];
        const status = dataItem && dataItem.solarCurrent < 3.0 ? 'DEVIATION' : 'NOMINAL';
        const statusColor = status === 'DEVIATION' ? '#D97706' : '#16A34A';
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${item.axisValue}</div>
          <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
            <span>Solar Current:</span>
            <strong style="color: #60A5FA;">${item.value} A</strong>
          </div>
          <div style="margin-top: 4px; font-size: 11px; color: ${statusColor}; font-weight: 600;">
            Status: ${status}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: timestamps,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#CBD5E1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748B',
        fontSize: 11,
        formatter: (val) => val.substring(0, 5)
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 6,
      interval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
      axisLabel: { color: '#64748B', fontSize: 11 }
    },
    series: [
      {
        name: 'Normal Upper',
        type: 'line',
        data: timestamps.map(() => 4.8),
        lineStyle: { type: 'dashed', color: '#93C5FD', width: 1 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Normal Lower',
        type: 'line',
        data: timestamps.map(() => 3.2),
        lineStyle: { type: 'dashed', color: '#93C5FD', width: 1 },
        stack: 'solar-confidence',
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Normal Area',
        type: 'line',
        data: timestamps.map(() => 1.6), // 4.8 - 3.2
        stack: 'solar-confidence',
        areaStyle: { color: 'rgba(224, 242, 254, 0.45)' },
        lineStyle: { opacity: 0 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Current',
        type: 'line',
        step: 'start',
        data: currentValues,
        lineStyle: {
          color: '#2563EB',
          width: 2.5
        },
        itemStyle: { color: '#2563EB' },
        showSymbol: false,
        markPoint: anomalyPoint
          ? {
              symbol: 'roundRect',
              symbolSize: [110, 36],
              symbolOffset: [0, -25],
              itemStyle: {
                color: '#FEF3C7',
                borderColor: '#D97706',
                borderWidth: 1,
                shadowColor: 'rgba(217, 119, 6, 0.15)',
                shadowBlur: 8
              },
              label: {
                formatter: `↓ Deviation\n2.1 A`,
                color: '#B45309',
                fontWeight: 'bold',
                fontSize: 11,
                lineHeight: 14
              },
              data: [
                {
                  name: 'Deviation',
                  coord: [anomalyPoint.timestamp, anomalyPoint.solarCurrent]
                }
              ]
            }
          : undefined,
        markLine: anomalyPoint
          ? {
              symbol: ['none', 'none'],
              label: { show: false },
              lineStyle: {
                type: 'dashed',
                color: '#DC2626',
                width: 1.5
              },
              data: [{ xAxis: anomalyPoint.timestamp }]
            }
          : undefined
      }
    ]
  };

  return (
    <div className={`chart-card ${isHighlighted ? 'card-highlighted' : ''}`}>
      <div className="chart-header">
        <div className="chart-title-row">
          <Sun size={16} className="chart-icon text-blue" />
          <h3 className="chart-title">Solar Current (A)</h3>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><span className="legend-line line-blue"></span> Current</span>
          <span className="legend-item"><span className="legend-box box-blue"></span> Normal Range</span>
          <span className="legend-item"><span className="legend-dot dot-red"></span> Anomaly</span>
        </div>
      </div>
      <div className="chart-body">
        <ReactECharts
          option={option}
          style={{ height: '180px', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
}
