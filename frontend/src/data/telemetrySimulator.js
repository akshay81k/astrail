export const INITIAL_MISSION_TIME_SECONDS = 1767225600;

export function formatMissionTime(seconds) {
  if (!seconds) return "00:00:00";
  const date = new Date(seconds * 1000);
  return date.toLocaleTimeString();
}

// Returns fallback nominal telemetry if backend fails
export function generateInitialTelemetry() {
  return [
    {
      simTime: INITIAL_MISSION_TIME_SECONDS,
      timestamp: formatMissionTime(INITIAL_MISSION_TIME_SECONDS),
      batteryTemp: 21.8,
      solarCurrent: 3.10,
      powerBusVoltage: 28.2,
      anomalyScore: 0.08,
      threshold: 1.022,
      status: 'NOMINAL',
      isAnomalyPeak: false
    }
  ];
}

export function generateNextPoint(prevSec, lastPoint) {
  const simTime = (prevSec || INITIAL_MISSION_TIME_SECONDS) + 1;
  return {
    simTime,
    timestamp: formatMissionTime(simTime),
    batteryTemp: 21.8,
    solarCurrent: 3.10,
    powerBusVoltage: 28.2,
    anomalyScore: 0.08,
    threshold: 1.022,
    status: 'NOMINAL',
    isAnomalyPeak: false
  };
}
