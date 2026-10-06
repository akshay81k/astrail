import React from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { useTelemetry } from "../context/TelemetryContext";
import { Activity, Info } from "lucide-react";

export default function AnomalyScoreChart() {
  const { telemetryData, activeAlertId, missionTimeSec } = useTelemetry();

  const timestamps = telemetryData.map((d) => d.timestamp);
  const scoreValues = telemetryData.map((d) => (d.anomalyScore != null ? Number(d.anomalyScore) : 0));
  const thresholdVal = 1.022; // Master calibrated conformal threshold

  const anomalyPoints = telemetryData.filter(
    (d) => (Number(d.anomalyScore) >= thresholdVal) || d.isAnomalyPeak
  );
  const anomalyPoint = anomalyPoints.length > 0 ? anomalyPoints[anomalyPoints.length - 1] : null;

  const isHighlighted =
    activeAlertId != null || (anomalyPoint !== null);

  const maxVal = Math.max(2.5, ...scoreValues.map(v => Number(v) || 0));

  const option = {
    animationDuration: 300,
    grid: {
      top: 35,
      right: 25,
      bottom: 35,
      left: 50,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0F172A",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#F8FAFC", fontSize: 12, fontFamily: "Inter" },
      formatter: (params) => {
        const item = params[0];
        const dataIndex = item.dataIndex;
        const dataItem = telemetryData[dataIndex];
        const val = item.value;
        const isAnomaly = val >= thresholdVal;
        const status = isAnomaly ? "ANOMALY DETECTED" : "NOMINAL";
        const statusColor = isAnomaly ? "#EF4444" : "#10B981";
        const mTime = dataItem?.simTime != null ? `T+${dataItem.simTime}s` : "";

        return `
          <div style="font-weight: 600; margin-bottom: 4px; color: #94A3B8;">${item.axisValue} ${mTime ? `(${mTime})` : ""}</div>
          <div style="display: flex; justify-content: space-between; gap: 16px; align-items: center;">
            <span>Conformal Score:</span>
            <strong style="color: #38BDF8;">${Number(val).toFixed(3)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-top: 2px;">
            <span>Alert Threshold:</span>
            <strong style="color: #64748B;">${thresholdVal}</strong>
          </div>
          <div style="margin-top: 6px; font-size: 11px; color: ${statusColor}; font-weight: 600;">
            Status: ${status}
          </div>
        `;
      },
    },
    xAxis: {
      type: "category",
      data: timestamps,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#CBD5E1" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#64748B",
        fontSize: 10,
        formatter: (val) => (val && val.length >= 8 ? val.substring(3) : val || ""),
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: Math.ceil(maxVal * 1.25),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#F1F5F9" } },
      axisLabel: { color: "#64748B", fontSize: 11 },
    },
    series: [
      {
        name: "Alert Threshold",
        type: "line",
        data: telemetryData.map(() => thresholdVal),
        lineStyle: { type: "dashed", color: "#EF4444", width: 1.5 },
        showSymbol: false,
        tooltip: { show: false },
      },
      {
        name: "Score",
        type: "line",
        smooth: 0.2,
        data: scoreValues,
        lineStyle: {
          color: anomalyPoint ? "#DC2626" : "#2563EB",
          width: 2.2,
        },
        itemStyle: { color: anomalyPoint ? "#DC2626" : "#2563EB" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(37, 99, 235, 0.20)" },
            { offset: 1, color: "rgba(37, 99, 235, 0.01)" },
          ]),
        },
        showSymbol: false,
        markPoint: anomalyPoint
          ? {
              symbol: "roundRect",
              symbolSize: [95, 26],
              symbolOffset: [0, -18],
              itemStyle: {
                color: "#1E293B",
                borderColor: "#EF4444",
                borderWidth: 1,
              },
              label: {
                formatter: `Score: ${Number(anomalyPoint.anomalyScore).toFixed(2)}`,
                color: "#EF4444",
                fontWeight: "bold",
                fontSize: 11,
              },
              data: [
                {
                  name: "Anomaly Trip",
                  coord: [anomalyPoint.timestamp, anomalyPoint.anomalyScore],
                },
              ],
            }
          : undefined,
        markLine: anomalyPoint
          ? {
              symbol: ["none", "none"],
              label: { show: false },
              lineStyle: {
                type: "dashed",
                color: "#EF4444",
                width: 1.5,
              },
              data: [{ xAxis: anomalyPoint.timestamp }],
            }
          : undefined,
      },
    ],
  };

  return (
    <div className={`chart-card ${isHighlighted ? "card-highlighted" : ""}`}>
      <div className="chart-header">
        <div className="chart-title-row">
          <Activity size={16} className="chart-icon text-cyan" />
          <h3 className="chart-title">Score vs Alert Threshold</h3>
          <span className="warmup-badge" title="Initial 32 telemetry frames used for recurrent GRU state warm-up">
            Warm-up: 32 frames
          </span>
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-line line-cyan"></span> Residual Score
          </span>
          <span className="legend-item">
            <span className="legend-line line-dashed-gray"></span> Threshold ({thresholdVal})
          </span>
          <span className="legend-item">
            <span className="legend-dot dot-red"></span> Anomaly
          </span>
        </div>
      </div>
      <div className="chart-body">
        <ReactECharts
          option={option}
          style={{ height: "190px", width: "100%" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
}
