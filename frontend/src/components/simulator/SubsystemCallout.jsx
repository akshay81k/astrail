import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Battery, Disc, Thermometer, Radio, ArrowUp, ArrowDown } from 'lucide-react';

export default function SubsystemCallouts({
  telemetry,
  activeFault,
  selectedSubsystem,
  hoveredSubsystem,
  onSelectSubsystem,
  onHoverSubsystem
}) {
  const currentReading = telemetry || {};
  const currentTemp = currentReading.batteryTemp !== undefined ? `${currentReading.batteryTemp.toFixed(1)} °C` : '—';
  const currentSolar = currentReading.solarCurrent !== undefined ? `${currentReading.solarCurrent.toFixed(1)} A` : '—';
  const currentBusV = currentReading.busVoltage !== undefined ? `${currentReading.busVoltage.toFixed(1)} V` : '—';
  const currentSoc = currentReading.batterySoc !== undefined ? `${Math.round(currentReading.batterySoc)}%` : '—';
  const currentWheelSpeed = currentReading.wheelSpeed !== undefined ? `${Math.round(currentReading.wheelSpeed)} RPM` : '—';
  const currentThermalTemp = currentReading.panelTemp !== undefined
    ? `${currentReading.panelTemp.toFixed(1)} °C`
    : (currentReading.avionicsTemp !== undefined ? `${currentReading.avionicsTemp.toFixed(1)} °C` : '—');

  // Subsystem statuses derived from real telemetry and active fault
  const isSolarFault =
    activeFault?.type === 'solar_degradation' ||
    activeFault?.id === 'solar_degradation' ||
    (currentReading.regime === 'sunlight' && currentReading.solarCurrent !== undefined && currentReading.solarCurrent < 3.0);

  const isBatteryFault =
    activeFault?.type === 'battery_degradation' ||
    activeFault?.id === 'battery_degradation' ||
    (currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 35.0);

  const isThermalFault =
    activeFault?.type === 'heater_stuck_on' ||
    activeFault?.id === 'heater_stuck_on' ||
    (currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 35.0);

  const isWheelFault =
    activeFault?.type === 'wheel_friction' ||
    activeFault?.id === 'wheel_friction' ||
    (currentReading.wheelSpeed !== undefined && currentReading.wheelSpeed < 1500);

  // Compute real deltas from nominal baselines when deviating
  const solarDelta = (isSolarFault && currentReading.solarCurrent !== undefined && currentReading.solarCurrent < 5.0)
    ? `${Math.round(((currentReading.solarCurrent - 5.2) / 5.2) * 100)}%`
    : null;

  const batteryDelta = (isBatteryFault && currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 25.0)
    ? `+${(currentReading.batteryTemp - 21.0).toFixed(1)}°`
    : null;

  const thermalDelta = (isThermalFault && currentReading.panelTemp !== undefined && currentReading.panelTemp > 28.0)
    ? `+${(currentReading.panelTemp - 25.0).toFixed(1)}°`
    : null;

  const callouts = [
    {
      id: 'solar',
      title: 'Solar Panels',
      icon: Sun,
      colorClass: 'amber',
      positionClass: 'pos-solar',
      isFault: isSolarFault,
      status: isSolarFault ? 'DEGRADED' : 'NOMINAL',
      statusColor: isSolarFault ? 'amber' : 'green',
      metrics: [
        { label: 'V', value: currentBusV },
        {
          label: 'I',
          value: currentSolar,
          delta: solarDelta,
          deltaType: 'down'
        }
      ],
      showSparkline: false
    },
    {
      id: 'battery',
      title: 'Battery',
      icon: Battery,
      colorClass: 'red',
      positionClass: 'pos-battery',
      isFault: isBatteryFault,
      status: isBatteryFault ? 'WARNING' : 'NOMINAL',
      statusColor: isBatteryFault ? 'amber' : 'green',
      metrics: [
        {
          label: 'T',
          value: currentTemp,
          delta: batteryDelta,
          deltaType: 'up'
        },
        { label: 'SOC', value: currentSoc }
      ],
      showSparkline: true,
      sparklineColor: '#EF4444'
    },
    {
      id: 'antenna',
      title: 'Antenna',
      icon: Radio,
      colorClass: 'cyan',
      positionClass: 'pos-antenna',
      isFault: false,
      status: currentReading.timestamp ? 'NORMAL' : '—',
      statusColor: currentReading.timestamp ? 'green' : 'amber',
      metrics: [
        { label: 'Link', value: currentReading.timestamp ? 'Nominal' : '—' },
        { label: 'Data Rate', value: currentReading.timestamp ? '1.2 Mbps' : '—' }
      ],
      showSparkline: false
    },
    {
      id: 'wheel',
      title: 'Reaction Wheels',
      icon: Disc,
      colorClass: 'blue',
      positionClass: 'pos-wheel',
      isFault: isWheelFault,
      status: isWheelFault ? 'FRICTION' : 'NOMINAL',
      statusColor: isWheelFault ? 'amber' : 'green',
      metrics: [
        { label: 'Speed', value: currentWheelSpeed }
      ],
      showSparkline: true,
      sparklineColor: '#38BDF8'
    },
    {
      id: 'thermal',
      title: 'Thermal System',
      icon: Thermometer,
      colorClass: 'purple',
      positionClass: 'pos-thermal',
      isFault: isThermalFault,
      status: isThermalFault ? 'WARNING' : 'NOMINAL',
      statusColor: isThermalFault ? 'amber' : 'green',
      metrics: [
        {
          label: 'T',
          value: currentThermalTemp,
          delta: thermalDelta,
          deltaType: 'up'
        }
      ],
      showSparkline: true,
      sparklineColor: '#8B5CF6'
    }
  ];

  return (
    <div className="subsystem-callouts-overlay">
      {callouts.map((item) => {
        const Icon = item.icon;
        const isSelected = selectedSubsystem === item.id;
        const isHovered = hoveredSubsystem === item.id;
        const isHighlighted = isSelected || isHovered || item.isFault;

        return (
          <motion.div
            key={item.id}
            className={`subsystem-callout-card ${item.positionClass} ${item.colorClass} ${
              isHighlighted ? 'highlighted' : ''
            } ${item.isFault ? 'fault-active' : ''}`}
            onClick={() => onSelectSubsystem(item.id)}
            onMouseEnter={() => onHoverSubsystem(item.id)}
            onMouseLeave={() => onHoverSubsystem(null)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: isHighlighted ? 1.03 : 1 }}
            transition={{ duration: 0.2 }}
          >
            {/* Holographic Header */}
            <div className="callout-header">
              <div className={`callout-icon-box ${item.colorClass}`}>
                <Icon size={13} />
              </div>
              <span className="callout-title">{item.title}</span>
            </div>

            {/* Metrics Rows */}
            <div className="callout-body">
              {item.metrics.map((m, idx) => (
                <div key={idx} className="callout-metric-row">
                  <span className="metric-label">{m.label}:</span>
                  <div className="metric-val-stack">
                    <span className="metric-val">{m.value}</span>
                    {m.delta && (
                      <span className={`metric-delta ${m.deltaType === 'up' ? 'delta-up' : 'delta-down'}`}>
                        {m.deltaType === 'up' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                        {m.delta}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Status Row */}
              <div className="callout-status-row">
                <span className="status-lbl">Status:</span>
                <span className={`status-tag status-${item.statusColor}`}>
                  {item.status}
                </span>
              </div>

              {/* Mini Sparkline Chart if enabled */}
              {item.showSparkline && (
                <div className="callout-sparkline-row">
                  <svg viewBox="0 0 60 14" className="sparkline-svg">
                    <path
                      d="M0,10 Q15,4 30,8 T60,2"
                      fill="none"
                      stroke={item.sparklineColor}
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Glowing Corner Anchor Accent */}
            <div className={`callout-anchor-corner ${item.colorClass}`} />
          </motion.div>
        );
      })}
    </div>
  );
}
