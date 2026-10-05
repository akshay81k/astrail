// Signal Catalog definition with 14 telemetry channels across power, thermal, attitude
const signals = [
  {
    id: 'solar_current',
    label: 'Solar array current',
    unit: 'A',
    subsystem: 'power',
    nominal: { min: 0, max: 6.0 },
    limits: { yellowHigh: 6.5, redHigh: 7.0, yellowLow: 0, redLow: 0 }
  },
  {
    id: 'bus_voltage',
    label: 'Main power bus voltage',
    unit: 'V',
    subsystem: 'power',
    nominal: { min: 26.0, max: 30.0 },
    limits: { yellowHigh: 31.0, redHigh: 32.0, yellowLow: 25.0, redLow: 24.0 }
  },
  {
    id: 'battery_soc',
    label: 'Battery state of charge',
    unit: '%',
    subsystem: 'power',
    nominal: { min: 60.0, max: 100.0 },
    limits: { yellowLow: 55.0, redLow: 40.0 }
  },
  {
    id: 'battery_voltage',
    label: 'Battery terminal voltage',
    unit: 'V',
    subsystem: 'power',
    nominal: { min: 25.5, max: 29.5 },
    limits: { yellowHigh: 30.5, redHigh: 31.5, yellowLow: 24.5, redLow: 23.5 }
  },
  {
    id: 'battery_current',
    label: 'Battery charge/discharge current',
    unit: 'A',
    subsystem: 'power',
    nominal: { min: -5.0, max: 5.0 },
    limits: { yellowHigh: 6.5, redHigh: 8.0, yellowLow: -6.5, redLow: -8.0 }
  },
  {
    id: 'load_power',
    label: 'Total system electrical load',
    unit: 'W',
    subsystem: 'power',
    nominal: { min: 40.0, max: 90.0 },
    limits: { yellowHigh: 100.0, redHigh: 120.0 }
  },
  {
    id: 'battery_temp',
    label: 'Battery core temperature',
    unit: '°C',
    subsystem: 'thermal',
    nominal: { min: 10.0, max: 30.0 },
    limits: { yellowHigh: 38.0, redHigh: 45.0, yellowLow: 2.0, redLow: -5.0 }
  },
  {
    id: 'panel_temp',
    label: 'Solar array panel temperature',
    unit: '°C',
    subsystem: 'thermal',
    nominal: { min: -40.0, max: 85.0 },
    limits: { yellowHigh: 95.0, redHigh: 110.0, yellowLow: -50.0, redLow: -65.0 }
  },
  {
    id: 'avionics_temp',
    label: 'Main avionics bay temperature',
    unit: '°C',
    subsystem: 'thermal',
    nominal: { min: 15.0, max: 40.0 },
    limits: { yellowHigh: 50.0, redHigh: 60.0, yellowLow: 0.0, redLow: -10.0 }
  },
  {
    id: 'heater_state',
    label: 'Thermal control heater status',
    unit: 'state',
    subsystem: 'thermal',
    nominal: { min: 0, max: 1 },
    limits: { yellowHigh: 1, redHigh: 1 }
  },
  {
    id: 'wheel_speed',
    label: 'Reaction wheel rotational speed',
    unit: 'rpm',
    subsystem: 'attitude',
    nominal: { min: 1000.0, max: 3000.0 },
    limits: { yellowHigh: 3500.0, redHigh: 4000.0, yellowLow: 800.0, redLow: 500.0 }
  },
  {
    id: 'wheel_current',
    label: 'Reaction wheel motor current',
    unit: 'A',
    subsystem: 'attitude',
    nominal: { min: 0.2, max: 1.2 },
    limits: { yellowHigh: 1.6, redHigh: 2.2 }
  },
  {
    id: 'wheel_temp',
    label: 'Reaction wheel bearing temperature',
    unit: '°C',
    subsystem: 'attitude',
    nominal: { min: 15.0, max: 45.0 },
    limits: { yellowHigh: 55.0, redHigh: 65.0, yellowLow: -5.0, redLow: -15.0 }
  },
  {
    id: 'pointing_error',
    label: 'Attitude pointing error',
    unit: 'deg',
    subsystem: 'attitude',
    nominal: { min: 0.0, max: 0.15 },
    limits: { yellowHigh: 0.35, redHigh: 0.6 }
  }
];

const exogenousInputs = [
  { id: 'eclipse_flag', label: 'Eclipse active (0=Sunlight, 1=Eclipse)', unit: 'flag' },
  { id: 'orbit_phase', label: 'Orbit phase angle', unit: 'rad' },
  { id: 'mode_cmd', label: 'Commanded spacecraft mode', unit: 'enum' }
];

module.exports = {
  signals,
  exogenousInputs
};
