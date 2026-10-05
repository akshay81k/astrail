// Normalizes backend telemetry frames, subsystem health, and incident payloads

export const BASE_MISSION_OFFSET = 2 * 3600 + 8 * 60; // 02:08:00 base offset

export function formatMissionTime(simTimeSec) {
  const totalSeconds = BASE_MISSION_OFFSET + (simTimeSec || 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function normalizeTelemetryFrame(frame) {
  if (!frame || !frame.t || frame.t.length === 0) return [];

  const points = [];
  const count = frame.t.length;

  for (let i = 0; i < count; i++) {
    const sec = frame.t[i];
    const timestamp = formatMissionTime(sec);

    const batteryTemp = frame.channels?.battery_temp?.[i] ?? 31.0;
    const solarCurrent = frame.channels?.solar_current?.[i] ?? 4.3;
    const anomalyScore = frame.score?.[i] ?? 0.15;
    const threshold = frame.threshold?.[i] ?? 0.45;
    const isAnomalyPeak = (frame.flag?.[i] === 1) || (batteryTemp > 41.5) || (anomalyScore > 0.8);
    const status = isAnomalyPeak ? 'ANOMALY' : (batteryTemp > 36 || solarCurrent < 3.0 ? 'WARNING' : 'NOMINAL');

    points.push({
      simTime: sec,
      timestamp,
      batteryTemp: parseFloat(Number(batteryTemp).toFixed(1)),
      solarCurrent: parseFloat(Number(solarCurrent).toFixed(1)),
      anomalyScore: parseFloat(Number(anomalyScore).toFixed(2)),
      threshold: parseFloat(Number(threshold).toFixed(2)),
      status,
      isAnomalyPeak
    });
  }

  return points;
}

export function normalizeSubsystemHealth(subsystemHealth = {}) {
  const healthMap = {
    power: { name: 'POWER', percentage: 68, status: 'AMBER' },
    thermal: { name: 'THERMAL', percentage: 92, status: 'RED' },
    attitude: { name: 'ATTITUDE', percentage: 88, status: 'GREEN' },
    comms: { name: 'COMMS', percentage: 96, status: 'GREEN' }
  };

  const mapColorToPct = (color, defaultPct) => {
    if (color === 'red') return 92;
    if (color === 'amber') return 68;
    return 96;
  };

  if (subsystemHealth.power) {
    const pColor = subsystemHealth.power.toUpperCase();
    healthMap.power = {
      name: 'POWER',
      percentage: mapColorToPct(subsystemHealth.power, 68),
      status: pColor,
      statusClass: subsystemHealth.power
    };
  }

  if (subsystemHealth.thermal) {
    const tColor = subsystemHealth.thermal.toUpperCase();
    healthMap.thermal = {
      name: 'THERMAL',
      percentage: mapColorToPct(subsystemHealth.thermal, 92),
      status: tColor,
      statusClass: subsystemHealth.thermal
    };
  }

  if (subsystemHealth.attitude) {
    const aColor = subsystemHealth.attitude.toUpperCase();
    healthMap.attitude = {
      name: 'ATTITUDE',
      percentage: mapColorToPct(subsystemHealth.attitude, 88),
      status: aColor,
      statusClass: subsystemHealth.attitude
    };
  }

  return [
    { id: 'power', ...healthMap.power, icon: 'Zap' },
    { id: 'thermal', ...healthMap.thermal, icon: 'Thermometer' },
    { id: 'attitude', ...healthMap.attitude, icon: 'Compass' },
    { id: 'comms', ...healthMap.comms, icon: 'Wifi' }
  ];
}

export function normalizeSensors(sensors = []) {
  // Map signal catalog or sensor objects to 6 chip slots S1-S6
  const defaultSensors = [
    { id: 'S1', name: 'S1', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.8%' },
    { id: 'S2', name: 'S2', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '100%' },
    { id: 'S3', name: 'S3', status: 'DELAYED', color: 'amber', lastUpdate: '16s ago', quality: '82.4% (Sync delay)' },
    { id: 'S4', name: 'S4', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.5%' },
    { id: 'S5', name: 'S5', status: 'MISSING', color: 'red', lastUpdate: '2m 14s ago', quality: '0% (No packet)' },
    { id: 'S6', name: 'S6', status: 'OK', color: 'green', lastUpdate: 'Just now', quality: '99.9%' }
  ];

  if (!sensors || sensors.length === 0) return defaultSensors;

  return defaultSensors.map((defSlot, index) => {
    const realSensor = sensors[index];
    if (!realSensor) return defSlot;

    const rawStatus = (realSensor.status || 'ok').toLowerCase();
    let statusText = 'OK';
    let color = 'green';

    if (rawStatus === 'missing' || rawStatus === 'unavailable') {
      statusText = 'MISSING';
      color = 'red';
    } else if (rawStatus === 'delayed' || rawStatus === 'noisy') {
      statusText = 'DELAYED';
      color = 'amber';
    }

    return {
      id: defSlot.id,
      name: defSlot.name,
      status: statusText,
      color,
      lastUpdate: realSensor.ageSec ? `${realSensor.ageSec}s ago` : 'Just now',
      quality: realSensor.imputed ? 'Imputed (No packet)' : '100%'
    };
  });
}

export function normalizeIncident(inc) {
  const severity = (inc.severity || 'INFO').toUpperCase();
  let colorClass = 'blue';
  if (severity === 'CRITICAL') colorClass = 'red';
  else if (severity === 'WARNING') colorClass = 'amber';

  return {
    id: inc.id || inc._id,
    severity,
    time: formatMissionTime(inc.openedAtSim || 0),
    title: inc.headline || inc.title || 'Spacecraft Anomaly',
    description: inc.explanation?.headline || inc.description || 'Telemetry variance detected',
    colorClass
  };
}
