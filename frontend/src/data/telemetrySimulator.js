// Real clean telemetry seed provider sourced from synthetic_telemetry_clean.csv
import realTelemetrySeed from './cleanTelemetrySeed.json';

export const INITIAL_MISSION_TIME_SECONDS = realTelemetrySeed[realTelemetrySeed.length - 1]?.simTime || 1767225600;

export function formatMissionTime(seconds) {
  if (!seconds) return "00:00:00";
  const date = new Date(seconds * 1000);
  return date.toLocaleTimeString();
}

// Returns real baseline telemetry records from synthetic_telemetry_clean.csv
export function generateInitialTelemetry() {
  return realTelemetrySeed.map((row) => ({
    simTime: row.simTime,
    timestamp: row.timestamp,
    batteryTemp: row.batteryTemp,
    solarCurrent: row.solarCurrent,
    powerBusVoltage: row.powerBusVoltage,
    anomalyScore: row.anomalyScore,
    threshold: row.threshold,
    status: row.status,
    isAnomalyPeak: row.isAnomalyPeak
  }));
}

export function generateNextPoint(prevSec, lastPoint) {
  const seed = realTelemetrySeed[0] || {};
  return {
    ...seed,
    simTime: (prevSec || 0) + 1,
    timestamp: formatMissionTime((prevSec || 0) + 1)
  };
}
