import { Sun, Flame, Battery, Radio, Zap, Disc } from 'lucide-react';

export const FAULT_TYPES = [
  {
    id: 'solar_degradation',
    title: 'Solar panel degradation',
    name: 'Solar panel degradation',
    subsystem: 'EPS (Power)',
    description: 'Reduced solar array output and power generation',
    icon: Sun,
    iconColorClass: 'yellow',
    backendType: 'solar_degradation',
    backendTarget: 'solar_current',
    expectedEffect: 'Reduced solar array output, lower solar current, leading to downstream power and thermal effects.',
    propagationChain: [
      'Solar array current ↓ (18% below forecast)',
      'Main power bus voltage sag (-1.2V)',
      'Battery discharge rate ↑ (+35% from nominal)',
      'Thermal balance shift'
    ]
  },
  {
    id: 'heater_stuck_on',
    title: 'Heater stuck on',
    name: 'Heater stuck on',
    subsystem: 'TCS (Thermal)',
    description: 'Continuous heating leading to thermal increase',
    icon: Flame,
    iconColorClass: 'red',
    backendType: 'heater_stuck_on',
    backendTarget: 'battery_temp',
    expectedEffect: 'Uncontrolled heating, elevated battery temperature, potential thermal runaway risk.',
    propagationChain: [
      'Thermal relay closed (Heater 1 active)',
      'Battery temperature rose (+6°C / 42.1°C)',
      'Electrical bus load surge (+35W)',
      'Thermal anomaly confirmed'
    ]
  },
  {
    id: 'battery_degradation',
    title: 'Battery degradation',
    name: 'Battery degradation',
    subsystem: 'EPS (Energy Storage)',
    description: 'Reduced battery capacity and charge efficiency',
    icon: Battery,
    iconColorClass: 'slate',
    backendType: 'battery_degradation',
    backendTarget: 'battery_charge',
    expectedEffect: 'Accelerated charge loss, reduced energy storage capability, lower operating margins.',
    propagationChain: [
      'Internal cell resistance ↑',
      'Terminal voltage drop under nominal load',
      'Battery state-of-charge faster depletion',
      'Reduced power margin'
    ]
  },
  {
    id: 'sensor_drift',
    title: 'Sensor drift',
    name: 'Sensor drift',
    subsystem: 'ADCS (Attitude Sensors)',
    description: 'Gradual sensor value drift over time',
    icon: Radio,
    iconColorClass: 'blue',
    backendType: 'sensor_drift',
    backendTarget: 'sun_sensor_angle',
    expectedEffect: 'Gradual accumulation of bias in telemetry, subtle anomaly onset requiring ML detection.',
    propagationChain: [
      'Sun sensor transducer bias ramp',
      'Attitude pointing residual divergence',
      'Analytical sensor redundancy disagreement',
      'Sensor fault isolated (Subsystems nominal)'
    ]
  },
  {
    id: 'sensor_spike',
    title: 'Sensor spike',
    name: 'Sensor spike',
    subsystem: 'ADCS (Rate Gyros)',
    description: 'Sudden abnormal sensor reading spike',
    icon: Zap,
    iconColorClass: 'pink',
    backendType: 'sensor_spike',
    backendTarget: 'gyro_bias_x',
    expectedEffect: 'Transient extreme outlier reading triggering immediate telemetry anomaly flags.',
    propagationChain: [
      'Single-sample rate gyro spike outlier',
      'Statistical Z-score excursion (>4.5σ)',
      'Persistence filter check (Transient noise rejected)'
    ]
  },
  {
    id: 'wheel_friction',
    title: 'Reaction wheel friction',
    name: 'Reaction wheel friction',
    subsystem: 'ADCS (Reaction Wheels)',
    description: 'Increased friction and power consumption',
    icon: Disc,
    iconColorClass: 'green',
    backendType: 'wheel_friction',
    backendTarget: 'wheel_speed_rpm',
    expectedEffect: 'Increased motor current, rotational resistance, and localized thermal dissipation.',
    propagationChain: [
      'Reaction wheel bearing friction ↑',
      'Motor current draw surge',
      'Wheel bearing temperature rise (+24°C)',
      'Pointing jitter & attitude error deviation'
    ]
  }
];

export function getSemanticSeverity(pct) {
  if (pct < 30) return { label: 'LOW', colorClass: 'green' };
  if (pct < 60) return { label: 'MODERATE', colorClass: 'amber' };
  if (pct < 85) return { label: 'HIGH', colorClass: 'orange' };
  return { label: 'CRITICAL', colorClass: 'red' };
}
