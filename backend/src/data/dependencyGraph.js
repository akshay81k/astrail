// Dependency graph specifying physical causal links and lag bounds
const nodes = [
  { id: 'solar_array', label: 'Solar Array Subsystem', type: 'subsystem', subsystem: 'power' },
  { id: 'solar_current', label: 'Solar Current', type: 'channel', subsystem: 'power' },
  { id: 'battery_current', label: 'Battery Current', type: 'channel', subsystem: 'power' },
  { id: 'battery_soc', label: 'Battery SOC', type: 'channel', subsystem: 'power' },
  { id: 'battery_voltage', label: 'Battery Voltage', type: 'channel', subsystem: 'power' },
  { id: 'bus_voltage', label: 'Bus Voltage', type: 'channel', subsystem: 'power' },
  { id: 'heater', label: 'Thermal Heater Subsystem', type: 'subsystem', subsystem: 'thermal' },
  { id: 'heater_state', label: 'Heater State', type: 'channel', subsystem: 'thermal' },
  { id: 'battery_temp', label: 'Battery Temp', type: 'channel', subsystem: 'thermal' },
  { id: 'load_power', label: 'Load Power', type: 'channel', subsystem: 'power' },
  { id: 'wheel_speed', label: 'Wheel Speed', type: 'channel', subsystem: 'attitude' },
  { id: 'wheel_current', label: 'Wheel Current', type: 'channel', subsystem: 'attitude' },
  { id: 'wheel_temp', label: 'Wheel Temp', type: 'channel', subsystem: 'attitude' },
  { id: 'avionics_temp', label: 'Avionics Temp', type: 'channel', subsystem: 'thermal' },
  { id: 'radiator', label: 'Radiator Subsystem', type: 'subsystem', subsystem: 'thermal' },
  { id: 'panel_temp', label: 'Panel Temp', type: 'channel', subsystem: 'thermal' },
  { id: 'pointing_error', label: 'Pointing Error', type: 'channel', subsystem: 'attitude' }
];

const edges = [
  { from: 'solar_array', to: 'solar_current', sign: '+', lagMinSec: 0, lagMaxSec: 5, rationale: 'Array degradation directly reduces output current' },
  { from: 'solar_current', to: 'battery_current', sign: '+', lagMinSec: 0, lagMaxSec: 10, rationale: 'Reduced solar input decreases battery charge current' },
  { from: 'battery_current', to: 'battery_soc', sign: '+', lagMinSec: 5, lagMaxSec: 60, rationale: 'Net current changes battery charge over time' },
  { from: 'battery_current', to: 'battery_temp', sign: '+', lagMinSec: 60, lagMaxSec: 600, rationale: 'I^2*R dissipation and electrochemical heating' },
  { from: 'battery_soc', to: 'battery_voltage', sign: '+', lagMinSec: 0, lagMaxSec: 30, rationale: 'OCV depends on cell state of charge' },
  { from: 'battery_voltage', to: 'bus_voltage', sign: '+', lagMinSec: 0, lagMaxSec: 10, rationale: 'EPS power regulation follows battery voltage' },
  { from: 'heater', to: 'heater_state', sign: '+', lagMinSec: 0, lagMaxSec: 5, rationale: 'Heater command activates resistive elements' },
  { from: 'heater_state', to: 'battery_temp', sign: '+', lagMinSec: 30, lagMaxSec: 600, rationale: 'Thermal conduction from heater to battery bay' },
  { from: 'heater_state', to: 'load_power', sign: '+', lagMinSec: 0, lagMaxSec: 10, rationale: 'Heater draw adds directly to electrical load' },
  { from: 'load_power', to: 'battery_current', sign: '-', lagMinSec: 0, lagMaxSec: 10, rationale: 'Increased electrical load drains battery current' },
  { from: 'wheel_speed', to: 'wheel_current', sign: '+', lagMinSec: 0, lagMaxSec: 10, rationale: 'Torque demand increases motor current' },
  { from: 'wheel_current', to: 'wheel_temp', sign: '+', lagMinSec: 60, lagMaxSec: 900, rationale: 'Motor winding dissipation heats the bearing assembly' },
  { from: 'wheel_current', to: 'load_power', sign: '+', lagMinSec: 0, lagMaxSec: 10, rationale: 'Reaction wheel motor power increases system load' },
  { from: 'wheel_temp', to: 'avionics_temp', sign: '+', lagMinSec: 300, lagMaxSec: 1800, rationale: 'Heat conducts to the structural mounting plate' },
  { from: 'radiator', to: 'panel_temp', sign: '-', lagMinSec: 60, lagMaxSec: 900, rationale: 'Radiator dissipation cools exterior panels' },
  { from: 'panel_temp', to: 'avionics_temp', sign: '+', lagMinSec: 120, lagMaxSec: 1200, rationale: 'External panel temperature drives interior thermal gradient' },
  { from: 'avionics_temp', to: 'battery_temp', sign: '+', lagMinSec: 120, lagMaxSec: 1200, rationale: 'Thermal conduction between avionics and battery compartment' }
];

module.exports = {
  nodes,
  edges
};
