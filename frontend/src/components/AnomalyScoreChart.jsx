import React from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { useTelemetry } from "../context/TelemetryContext";
import { Sparkles } from "lucide-react";

export default function AnomalyScoreChart() {
  const { telemetryData, activeAlertId } = useTelemetry();

  const timestamps = telemetryData.map((d) => d.timestamp);
  const scoreValues = telemetryData.map((d) => d.anomalyScore);

  const anomalyPoints = telemetryData.filter(
    (d) => (d.anomalyScore >= (d.threshold || 2.1)) || d.isAnomalyPeak
  );
  const anomalyPoint = anomalyPoints.length > 0 ? anomalyPoints[anomalyPoints.length - 1] : null;

  const isHighlighted =
    activeAlertId === "alert-1" || activeAlertId === "alert-2" || (anomalyPoint !== null);

  const maxVal = Math.max(3.5, ...scoreValues.map(v => Number(v) || 0));

  const option = {
    animationDuration: 300,
    grid: {
      top: 35,
      right: 20,
      bottom: 30,
      left: 45,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0F1F4B",
      borderColor: "transparent",
      textStyle: { color: "#FFFFFF", fontSize: 12, fontFamily: "Inter" },
      formatter: (params) => {
        const item = params[0];
        const dataItem = telemetryData[item.dataIndex];
        const val = item.value;
        const thresh = dataItem?.threshold || 2.1;
        const status = val >= thresh ? "ANOMALY HIGH" : "NOMINAL";
        const statusColor = val >= thresh ? "#DC2626" : "#16A34A";
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${item.axisValue}</div>
          <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
            <span>Anomaly Score:</span>
            <strong style="color: #C084FC;">${val}</strong>
          </div>
          <div style="margin-top: 4px; font-size: 11px; color: ${statusColor}; font-weight: 600;">
            Status: ${status} (Thresh: ${thresh})
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
        fontSize: 11,
        formatter: (val) => (val && val.length >= 8 ? val.substring(3) : val || ""),
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: Math.ceil(maxVal * 1.15),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#F1F5F9" } },
      axisLabel: { color: "#64748B", fontSize: 11 },
    },
    series: [
      {
        name: "Threshold",
        type: "line",
        data: telemetryData.map((d) => d.threshold || 2.1),
        lineStyle: { type: "dashed", color: "#EF4444", width: 1.5 },
        showSymbol: false,
        tooltip: { show: false },
      },
      {
        name: "Score",
        type: "line",
        smooth: 0.4,
        data: scoreValues,
        lineStyle: {
          color: "#7C3AED",
          width: 2.5,
        },
        itemStyle: { color: "#7C3AED" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(124, 58, 237, 0.35)" },
            { offset: 1, color: "rgba(124, 58, 237, 0.01)" },
          ]),
        },
        showSymbol: false,
        markPoint: anomalyPoint
          ? {
              symbol: "roundRect",
              symbolSize: [95, 30],
              symbolOffset: [0, -22],
              itemStyle: {
                color: "#FAF5FF",
                borderColor: "#7C3AED",
                borderWidth: 1,
                shadowColor: "rgba(124, 58, 237, 0.15)",
                shadowBlur: 8,
              },
              label: {
                formatter: `Score: ${Number(anomalyPoint.anomalyScore).toFixed(2)}`,
                color: "#6D28D9",
                fontWeight: "bold",
                fontSize: 11,
              },
              data: [
                {
                  name: "Anomaly Peak",
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
                color: "#DC2626",
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
          <Sparkles size={16} className="chart-icon text-purple" />
          <h3 className="chart-title">Anomaly Score</h3>
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-line line-purple"></span> Score
          </span>
          <span className="legend-item">
            <span className="legend-line line-dashed-red"></span> Threshold
          </span>
          <span className="legend-item">
            <span className="legend-dot dot-red"></span> Anomaly
          </span>
        </div>
      </div>
      <div className="chart-body">
        <ReactECharts
          option={option}
          style={{ height: "180px", width: "100%" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
}
