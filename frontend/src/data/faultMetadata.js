import { Sun, Flame, Battery, Radio, Zap, Disc } from 'lucide-react';

export const FAULT_TYPES = [
  {
    id: 'solar_degradation',
    title: 'Solar panel degradation',
    description: 'Reduced solar array output and power generation',
    icon: Sun,
    iconColorClass: 'yellow',
    backendType: 'solar_array_degradation',
    backendTarget: 'solar_current',
    expectedEffect: 'Reduced solar array output, lower solar current, leading to downstream power and thermal effects.'
  },
  {
    id: 'heater_stuck_on',
    title: 'Heater stuck on',
    description: 'Continuous heating leading to thermal increase',
    icon: Flame,
    iconColorClass: 'red',
    backendType: 'heater_relay_failure',
    backendTarget: 'battery_temp',
    expectedEffect: 'Uncontrolled heating, elevated battery temperature, potential thermal runaway risk.'
  },
  {
    id: 'battery_degradation',
    title: 'Battery degradation',
    description: 'Reduced battery capacity and charge efficiency',
    icon: Battery,
    iconColorClass: 'slate',
    backendType: 'battery_cell_degradation',
    backendTarget: 'battery_charge',
    expectedEffect: 'Accelerated charge loss, reduced energy storage capability, lower operating margins.'
  },
  {
    id: 'sensor_drift',
    title: 'Sensor drift',
    description: 'Gradual sensor value drift over time',
    icon: Radio,
    iconColorClass: 'blue',
    backendType: 'sensor_drift',
    backendTarget: 'sun_sensor_angle',
    expectedEffect: 'Gradual accumulation of bias in telemetry, subtle anomaly onset requiring ML detection.'
  },
  {
    id: 'sensor_spike',
    title: 'Sensor spike',
    description: 'Sudden abnormal sensor reading spike',
    icon: Zap,
    iconColorClass: 'pink',
    backendType: 'sensor_spike',
    backendTarget: 'gyro_bias_x',
    expectedEffect: 'Transient extreme outlier reading triggering immediate telemetry anomaly flags.'
  },
  {
    id: 'wheel_friction',
    title: 'Reaction wheel friction',
    description: 'Increased friction and power consumption',
    icon: Disc,
    iconColorClass: 'green',
    backendType: 'reaction_wheel_friction',
    backendTarget: 'wheel_speed_rpm',
    expectedEffect: 'Increased motor current, rotational resistance, and localized thermal dissipation.'
  }
];

export function getSemanticSeverity(pct) {
  if (pct < 30) return { label: 'LOW', colorClass: 'green' };
  if (pct < 60) return { label: 'MODERATE', colorClass: 'amber' };
  if (pct < 85) return { label: 'HIGH', colorClass: 'orange' };
  return { label: 'CRITICAL', colorClass: 'red' };
}
