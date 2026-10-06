// Scripted seeded scenarios for live judging and demonstrations
const scenarios = [
  {
    id: 'solar_early_detection',
    name: 'Solar Array Degradation (Early Detection Lead Time)',
    description: 'Injects a 22% solar array degradation fault. Demonstrates early ML detection with ~855s lead time before traditional threshold limits trip.',
    seed: 42,
    durationSec: 14400,
    mismatchLevel: 'medium',
    steps: [
      {
        atSimTime: 120,
        fault: {
          type: 'solar_degradation',
          severity: 0.22,
          rampSec: 300,
          target: 'solar_array'
        }
      }
    ]
  },
  {
    id: 'heater_stuck_thermal_runaway',
    name: 'Thermal Control Relay Failure (Heater Stuck On)',
    description: 'Heater gets stuck in the ON position. Thermal coupling raises battery temperature towards limits.',
    seed: 101,
    durationSec: 14400,
    mismatchLevel: 'medium',
    steps: [
      {
        atSimTime: 90,
        fault: {
          type: 'heater_stuck_on',
          severity: 1.0,
          rampSec: 60,
          target: 'heater'
        }
      }
    ]
  },
  {
    id: 'wheel_friction_drag',
    name: 'Reaction Wheel Bearing Drag & Friction',
    description: 'Elevated bearing friction increases motor current and temperature while pointing jitter grows.',
    seed: 202,
    durationSec: 14400,
    mismatchLevel: 'medium',
    steps: [
      {
        atSimTime: 150,
        fault: {
          type: 'wheel_friction',
          severity: 0.45,
          rampSec: 400,
          target: 'reaction_wheel'
        }
      }
    ]
  },
  {
    id: 'sensor_drift_vs_subsystem',
    name: 'Sensor Fault vs Real Subsystem Noise Rejection',
    description: 'Demonstrates analytical redundancy: battery_temp drifts on a single sensor while thermal linked channels stay nominal, correctly classifying it as sensor_fault instead of spacecraft fault.',
    seed: 303,
    durationSec: 14400,
    mismatchLevel: 'none',
    steps: [
      {
        atSimTime: 60,
        fault: {
          type: 'sensor_drift',
          target: 'battery_temp',
          severity: 0.6,
          rampSec: 600
        }
      }
    ]
  },
  {
    id: 'ten_minute_sensor_dropout',
    name: '10-Minute Sensor Dropout & Honest Uncertainty',
    description: 'Applies a 600s complete dropout on battery_temp. Shows sensor marked UNAVAILABLE, and confidence drops with explicit explanation reason.',
    seed: 404,
    durationSec: 14400,
    mismatchLevel: 'medium',
    steps: [
      {
        atSimTime: 100,
        stress: {
          channel: 'battery_temp',
          durationSec: 600
        }
      }
    ]
  }
];

module.exports = scenarios;
