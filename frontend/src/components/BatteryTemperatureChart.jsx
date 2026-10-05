import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTelemetry } from '../context/TelemetryContext';
import { Thermometer } from 'lucide-react';

export default function BatteryTemperatureChart() {
  const { telemetryData, activeAlertId } = useTelemetry();

  // Filter data according to window if needed
  const timestamps = telemetryData.map((d) => d.timestamp);
  const batteryValues = telemetryData.map((d) => d.batteryTemp);

  // Dynamically find latest anomaly point or peak in active telemetry window
  const anomalyIndex = telemetryData.findLastIndex
    ? telemetryData.findLastIndex((d) => d.isAnomalyPeak || d.batteryTemp > 38 || d.status === 'ANOMALY')
    : telemetryData.findIndex((d) => d.isAnomalyPeak || d.batteryTemp > 38);
  const anomalyPoint = anomalyIndex !== -1 ? telemetryData[anomalyIndex] : null;

  const isHighlighted = activeAlertId === 'alert-1'; // Thermal anomaly alert

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
        const status = dataItem ? dataItem.status : 'NOMINAL';
        const statusColor = status === 'ANOMALY' ? '#DC2626' : status === 'WARNING' ? '#D97706' : '#16A34A';
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${item.axisValue}</div>
          <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
            <span>Battery Temp:</span>
            <strong style="color: #60A5FA;">${item.value} °C</strong>
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
        formatter: (val) => val.substring(0, 5) // Show HH:MM
      }
    },
    yAxis: {
      type: 'value',
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
        name: 'Normal Range Upper',
        type: 'line',
        data: timestamps.map(() => 35),
        lineStyle: { type: 'dashed', color: '#93C5FD', width: 1 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Normal Range Lower',
        type: 'line',
        data: timestamps.map(() => 28),
        lineStyle: { type: 'dashed', color: '#93C5FD', width: 1 },
        stack: 'confidence-band',
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Normal Area',
        type: 'line',
        data: timestamps.map(() => 7), // 35 - 28 = 7
        stack: 'confidence-band',
        areaStyle: { color: 'rgba(224, 242, 254, 0.45)' },
        lineStyle: { opacity: 0 },
        showSymbol: false,
        tooltip: { show: false }
      },
      {
        name: 'Temperature',
        type: 'line',
        smooth: 0.35,
        data: batteryValues,
        lineStyle: {
          color: '#DC2626',
          width: 2.5
        },
        itemStyle: { color: '#DC2626' },
        showSymbol: false,
        markPoint: anomalyPoint
          ? {
              symbol: 'roundRect',
              symbolSize: [110, 36],
              symbolOffset: [0, -25],
              itemStyle: {
                color: '#FEF2F2',
                borderColor: '#DC2626',
                borderWidth: 1,
                shadowColor: 'rgba(220, 38, 38, 0.15)',
                shadowBlur: 8
              },
              label: {
                formatter: `▲ Anomaly\n${anomalyPoint ? anomalyPoint.batteryTemp : 42.1}°C`,
                color: '#DC2626',
                fontWeight: 'bold',
                fontSize: 11,
                lineHeight: 14
              },
              data: [
                {
                  name: 'Anomaly',
                  coord: [anomalyPoint.timestamp, anomalyPoint.batteryTemp]
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
          <Thermometer size={16} className="chart-icon text-red" />
          <h3 className="chart-title">Battery Temperature (°C)</h3>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><span className="legend-line line-red"></span> Temperature</span>
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
