// Initial telemetry simulation data generator and runtime streamer

export const INITIAL_MISSION_TIME_SECONDS = 2 * 3600 + 14 * 60 + 36; // 02:14:36 in seconds
export const START_TIME_SECONDS = 2 * 3600 + 8 * 60; // 02:08:00 in seconds

export function formatMissionTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Generates historical initial dataset from 02:08:00 to 02:14:36
export function generateInitialTelemetry() {
  const data = [];
  const startSec = 0;
  const endSec = 60;
  const step = 1;

  for (let sec = startSec; sec <= endSec; sec += step) {
    const timestamp = formatMissionTime(sec);
    const batteryTemp = 21.8 + Math.sin(sec / 15) * 0.4 + (Math.random() * 0.2 - 0.1);
    const solarCurrent = 3.10 + Math.cos(sec / 20) * 0.15 + (Math.random() * 0.1 - 0.05);
    const anomalyScore = 0.85 + (sec % 5) * 0.04 + (Math.random() * 0.05 - 0.02);

    data.push({
      simTime: sec,
      timestamp,
      sec,
      batteryTemp: parseFloat(batteryTemp.toFixed(1)),
      solarCurrent: parseFloat(solarCurrent.toFixed(2)),
      anomalyScore: parseFloat(anomalyScore.toFixed(2)),
      threshold: 2.1,
      status: "NOMINAL",
      isAnomalyPeak: false,
    });
  }

  return data;
}

// Generate next simulated data point
export function generateNextPoint(prevSec, lastPoint) {
  const sec = (prevSec || 0) + 1;
  const timestamp = formatMissionTime(sec);

  const batteryTemp = 21.8 + Math.sin(sec / 15) * 0.4 + (Math.random() * 0.2 - 0.1);
  const solarCurrent = 3.10 + Math.cos(sec / 20) * 0.15 + (Math.random() * 0.1 - 0.05);
  const anomalyScore = 0.85 + (sec % 5) * 0.04 + (Math.random() * 0.05 - 0.02);

  return {
    simTime: sec,
    timestamp,
    sec,
    batteryTemp: parseFloat(batteryTemp.toFixed(1)),
    solarCurrent: parseFloat(solarCurrent.toFixed(2)),
    anomalyScore: parseFloat(anomalyScore.toFixed(2)),
    threshold: 2.1,
    status: "NOMINAL",
    isAnomalyPeak: false,
  };
}
