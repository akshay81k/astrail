import React from 'react';

export default function OrbitStatusPanel({ sensorsData = [], telemetry = {} }) {
  const sunSensor = sensorsData.find(
    (s) => s.id?.includes('sun') || s.name?.toLowerCase().includes('sun')
  );

  let sunlightVal = '—';
  if (telemetry?.regime) {
    sunlightVal = telemetry.regime === 'eclipse' ? 'Eclipse (0%)' : 'Sunlight (100%)';
  } else if (sunSensor?.value !== undefined) {
    sunlightVal = `${sunSensor.value}%`;
  } else if (telemetry?.solarCurrent !== undefined) {
    sunlightVal = telemetry.solarCurrent > 0.5 ? 'Sunlight' : 'Eclipse';
  }

  const powerBudgetVal = telemetry?.loadPower !== undefined
    ? `${telemetry.loadPower.toFixed(1)} W`
    : '—';

  const attitudeVal = telemetry?.pointingError !== undefined
    ? `Nadir (±${telemetry.pointingError.toFixed(2)}°)`
    : (telemetry?.timestamp ? 'Nadir Pointing' : '—');

  const dataRateVal = telemetry?.timestamp ? '1.2 Mbps' : '—';

  return (
    <div className="orbit-status-panel">
      <div className="orbit-panel-title">ORBIT & ATTITUDE</div>
      <div className="orbit-status-row">
        <span className="orbit-label">Orbit Mode</span>
        <span className="orbit-val">LEO (500 km)</span>
      </div>
      <div className="orbit-status-row">
        <span className="orbit-label">Sunlight</span>
        <span className="orbit-val">{sunlightVal}</span>
      </div>
      <div className="orbit-status-row">
        <span className="orbit-label">Attitude</span>
        <span className="orbit-val">{attitudeVal}</span>
      </div>
      <div className="orbit-status-row">
        <span className="orbit-label">Power Budget</span>
        <span className="orbit-val">{powerBudgetVal}</span>
      </div>
      <div className="orbit-status-row">
        <span className="orbit-label">Data Rate</span>
        <span className="orbit-val">{dataRateVal}</span>
      </div>
    </div>
  );
}
