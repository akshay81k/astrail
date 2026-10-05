// Initial telemetry simulation data generator and runtime streamer

export const INITIAL_MISSION_TIME_SECONDS = 2 * 3600 + 14 * 60 + 36; // 02:14:36 in seconds
export const START_TIME_SECONDS = 2 * 3600 + 8 * 60; // 02:08:00 in seconds

export function formatMissionTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Generates historical initial dataset from 02:08:00 to 02:14:36
export function generateInitialTelemetry() {
  const data = [];
  const startSec = START_TIME_SECONDS; // 02:08:00
  const endSec = INITIAL_MISSION_TIME_SECONDS; // 02:14:36
  const step = 4; // every 4 seconds

  for (let sec = startSec; sec <= endSec; sec += step) {
    const timestamp = formatMissionTime(sec);
    
    // Normal baselines with slight noise
    let batteryTemp = 31.0 + Math.sin(sec / 40) * 1.5 + (Math.random() * 0.4 - 0.2);
    let solarCurrent = 4.3 + Math.cos(sec / 50) * 0.2 + (Math.random() * 0.2 - 0.1);
    let anomalyScore = 0.12 + Math.random() * 0.08;
    let status = 'NOMINAL';

    // Solar current drop event starting around 02:09:30 - 02:09:40 (sec ~ 7770)
    if (sec >= 2 * 3600 + 9 * 60 + 30 && sec < 2 * 3600 + 11 * 60) {
      solarCurrent = 2.8 + Math.random() * 0.2;
    }

    // Dip in temp right before thermal anomaly around 02:10:00 - 02:10:30
    if (sec >= 2 * 3600 + 10 * 60 && sec < 2 * 3600 + 10 * 60 + 45) {
      batteryTemp = 27.5 + Math.random() * 0.5;
      solarCurrent = 2.6 + Math.random() * 0.2;
    }

    // Critical thermal & solar anomaly around 02:11:00 - 02:11:15 (sec = 7860 - 7875)
    if (sec >= 2 * 3600 + 10 * 60 + 50 && sec <= 2 * 3600 + 11 * 60 + 30) {
      const progress = (sec - (2 * 3600 + 10 * 60 + 50)) / 40;
      if (sec >= 2 * 3600 + 11 * 60 + 4 && sec <= 2 * 3600 + 11 * 60 + 12) {
        // Peak anomaly timestamp ~ 02:11:08
        batteryTemp = 42.1;
        solarCurrent = 2.1;
        anomalyScore = 0.87;
        status = 'ANOMALY';
      } else {
        batteryTemp = 32 + progress * 9.5 + (Math.random() * 0.4);
        solarCurrent = 2.4 - progress * 0.3;
        anomalyScore = 0.2 + progress * 0.65;
        if (anomalyScore > 0.45) status = 'WARNING';
      }
    } else if (sec > 2 * 3600 + 11 * 60 + 30) {
      // Post anomaly elevated state
      batteryTemp = 39.5 + Math.sin(sec / 30) * 1.0 + (Math.random() * 0.4 - 0.2);
      solarCurrent = 1.6 + Math.random() * 0.3;
      anomalyScore = 0.22 + Math.random() * 0.08;
    }

    data.push({
      timestamp,
      sec,
      batteryTemp: parseFloat(batteryTemp.toFixed(1)),
      solarCurrent: parseFloat(solarCurrent.toFixed(1)),
      anomalyScore: parseFloat(anomalyScore.toFixed(2)),
      status,
      isAnomalyPeak: timestamp === '02:11:08'
    });
  }

  return data;
}

// Generate next simulated data point with dynamic fault effects
export function generateNextPoint(prevSec, lastPoint = {}, activeFault = null) {
  const sec = (prevSec || INITIAL_MISSION_TIME_SECONDS) + 2;
  const timestamp = formatMissionTime(sec);
  
  let batteryTemp = 31.0 + Math.sin(sec / 40) * 1.2 + (Math.random() * 0.4 - 0.2);
  let solarCurrent = 4.3 + Math.cos(sec / 50) * 0.3 + (Math.random() * 0.2 - 0.1);
  let anomalyScore = 0.15 + Math.random() * 0.08;
  let status = 'NOMINAL';
  let isAnomalyPeak = false;

  if (activeFault) {
    const sev = activeFault.severity ?? 0.6;
    if (activeFault.id === 'solar_degradation' || activeFault.type === 'solar_degradation') {
      solarCurrent = Math.max(0.8, parseFloat((4.3 * (1 - sev)).toFixed(1)));
      batteryTemp = parseFloat((31.0 + sev * 18.0 + Math.random() * 0.5).toFixed(1));
      anomalyScore = parseFloat((0.45 + sev * 0.55 + Math.random() * 0.05).toFixed(2));
      status = 'ANOMALY';
      isAnomalyPeak = true;
    } else if (activeFault.id === 'heater_stuck_on' || activeFault.type === 'heater_stuck_on') {
      batteryTemp = parseFloat((35.0 + sev * 16.0 + Math.random() * 0.4).toFixed(1));
      anomalyScore = parseFloat((0.5 + sev * 0.45).toFixed(2));
      status = 'ANOMALY';
      isAnomalyPeak = true;
    } else if (activeFault.id === 'battery_degradation' || activeFault.type === 'battery_degradation') {
      batteryTemp = parseFloat((34.0 + sev * 12.0).toFixed(1));
      solarCurrent = parseFloat((solarCurrent * 0.85).toFixed(1));
      anomalyScore = parseFloat((0.48 + sev * 0.4).toFixed(2));
      status = 'WARNING';
      isAnomalyPeak = true;
    } else {
      anomalyScore = parseFloat((0.55 + Math.random() * 0.35).toFixed(2));
      status = 'WARNING';
      isAnomalyPeak = true;
    }
  }

  return {
    timestamp,
    sec,
    simTime: sec - START_TIME_SECONDS,
    batteryTemp: parseFloat(batteryTemp.toFixed(1)),
    solarCurrent: parseFloat(solarCurrent.toFixed(1)),
    anomalyScore: parseFloat(anomalyScore.toFixed(2)),
    threshold: 0.45,
    status,
    isAnomalyPeak
  };
}
