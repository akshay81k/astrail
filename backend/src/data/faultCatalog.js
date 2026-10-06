// Fault Catalog and FMEA recommendation mappings
const faults = [
  {
    type: 'solar_degradation',
    category: 'subsystem',
    subsystem: 'power',
    label: 'Solar Array Degradation',
    description: 'Loss of photovoltaic power output due to cell degradation or pointing offset',
    severityRange: { min: 0.05, max: 0.8 },
    effects: ['Solar current drops below forecast', 'Battery charge rate decreases', 'Battery temperature increases under heavier cycling'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Reduce non-essential payload load',
          rationale: 'Restores power margin while solar array capacity is degraded.',
          safetyChecks: [{ rule: 'battery_soc > 20%', passed: true }]
        },
        {
          rank: 2,
          action: 'Review array pointing and sun-tracking telemetry',
          rationale: 'Verify whether degradation is mechanical pointing offset vs cell aging.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Check heater status and thermal margins',
          rationale: 'Prevent thermal compounding on degraded battery power.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if state of charge trend is negative for more than 10 min'
    }
  },
  {
    type: 'heater_stuck_on',
    category: 'subsystem',
    subsystem: 'thermal',
    label: 'Thermal Heater Stuck On',
    description: 'Thermal control relay stuck in active closed state, driving unwanted heating and power load',
    severityRange: { min: 0.2, max: 1.0 },
    effects: ['Heater state high continuously', 'Battery and avionics temperatures rise above forecast', 'Electrical load increases'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Command backup heater circuit / cycle relay (if safe)',
          rationale: 'Attempt electrical unstick of the primary thermal switch.',
          safetyChecks: [{ rule: 'battery_temp > 5°C', passed: true }]
        },
        {
          rank: 2,
          action: 'Reduce non-essential electronic load in heated bay',
          rationale: 'Reduce auxiliary heat dissipation to avoid red temperature limits.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Adjust attitude to orient cold radiator panels toward deep space',
          rationale: 'Maximizes passive radiative heat rejection.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if battery temp is within 5 °C of red limit'
    }
  },
  {
    type: 'battery_degradation',
    category: 'subsystem',
    subsystem: 'power',
    label: 'Battery Cell Degradation',
    description: 'Internal resistance increase and capacity fade in the main energy storage cells',
    severityRange: { min: 0.1, max: 0.7 },
    effects: ['Faster state of charge depletion during eclipse', 'Terminal voltage sags under load', 'Internal heating increases'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Reduce electrical load during eclipse pass',
          rationale: 'Minimizes depth-of-discharge and avoids low-voltage trip.',
          safetyChecks: [{ rule: 'payload_power > 0', passed: true }]
        },
        {
          rank: 2,
          action: 'Limit maximum charging current from solar array',
          rationale: 'Reduces internal thermal runaway risk in degraded cells.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Plan reduced-ops mission duty cycle',
          rationale: 'Sustains longevity across upcoming orbits.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if state of charge falls below 40%'
    }
  },
  {
    type: 'wheel_friction',
    category: 'subsystem',
    subsystem: 'attitude',
    label: 'Reaction Wheel Bearing Friction',
    description: 'Mechanical bearing drag increase in reaction wheel assembly',
    severityRange: { min: 0.1, max: 0.9 },
    effects: ['Motor current increases for same wheel speed', 'Bearing temperature rises', 'Pointing jitter and error increase'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Reduce wheel speed demand / re-balance momentum',
          rationale: 'Lowers mechanical friction stress and motor heating.',
          safetyChecks: [{ rule: 'pointing_error < 0.35°', passed: true }]
        },
        {
          rank: 2,
          action: 'Schedule magnetic torque rod momentum dump',
          rationale: 'Unloads reaction wheel without requiring high motor RPM.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Prepare backup attitude control mode',
          rationale: 'Ensures redundancy in case of wheel seizure.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if pointing error exceeds 0.5°'
    }
  },
  {
    type: 'radiator_degradation',
    category: 'subsystem',
    subsystem: 'thermal',
    label: 'Radiator Surface Degradation',
    description: 'Optical solar reflector degradation or contamination causing reduced thermal emissivity',
    severityRange: { min: 0.1, max: 0.8 },
    effects: ['Panel and avionics temperatures drift upward slowly', 'Cooldown rate in eclipse slows down'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Adjust spacecraft attitude for optimized thermal balance',
          rationale: 'Minimizes direct solar flux onto degraded radiator surfaces.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Reduce avionics and payload thermal dissipation',
          rationale: 'Keeps equilibrium temperature inside safe operating band.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Monitor slow thermal creep trajectory',
          rationale: 'Track long-term degradation rate against model limits.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if temperature reaches yellow limit with positive trend'
    }
  },
  {
    type: 'sensor_drift',
    category: 'sensor',
    label: 'Sensor Calibration Drift',
    description: 'Gradual offset or slope ramp on a single telemetry transducer while linked physical sensors remain nominal',
    severityRange: { min: 0.1, max: 1.0 },
    effects: ['Single channel drifts while linked redundant channels contradict it'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Mark suspect sensor as UNRELIABLE and exclude from control loop',
          rationale: 'Prevents false control triggers on bad sensor readings.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Switch to analytical redundancy / linked sensors',
          rationale: 'Synthesize missing value from cross-sensor physics estimates.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Schedule sensor diagnostic and ground recalibration',
          rationale: 'Assess if sensor is salvageable.',
          safetyChecks: []
        }
      ],
      escalation: 'None (Informational)'
    }
  },
  {
    type: 'sensor_stuck',
    category: 'sensor',
    label: 'Sensor Stuck-at-Value',
    description: 'Telemetry transducer frozen at a constant numerical reading',
    severityRange: { min: 0.0, max: 1.0 },
    effects: ['Zero rolling variance on suspect sensor'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Flag sensor as UNAVAILABLE and ignore readings',
          rationale: 'Stuck values can mask actual thermal or electrical shifts.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Use twin estimator for health monitoring',
          rationale: 'Twin model supplies estimated value.',
          safetyChecks: []
        }
      ],
      escalation: 'None (Informational)'
    }
  },
  {
    type: 'sensor_spike',
    category: 'sensor',
    label: 'Transient Sensor Spike',
    effects: ['Single sample excursion without persistent physical shift'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Classified as transient noise - no operator action needed',
          rationale: 'Filtered out by persistence rule and noise rejection logic.',
          safetyChecks: []
        }
      ],
      escalation: 'None'
    }
  },
  {
    type: 'thermal_runaway',
    category: 'subsystem',
    subsystem: 'thermal',
    label: 'Thermal Runaway Excursion',
    description: 'Rapid thermal elevation across EPS, payload, and battery bays',
    severityRange: { min: 0.3, max: 0.95 },
    effects: ['eps_temperature_C and battery_temperature_C exceed threshold', 'power_bus_current_A rises', 'cpu_utilization_pct spikes under thermal throttling'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Reduce EPS load and inspect thermal regulation path',
          rationale: 'Thermal dissipation must be brought within safe margins immediately.',
          safetyChecks: [{ rule: 'eps_temp < 45°C', passed: true }]
        },
        {
          rank: 2,
          action: 'Switch to redundant thermal control loop',
          rationale: 'Isolate primary thermal control circuitry.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Enter spacecraft safe mode if temperatures do not recover in 5 minutes',
          rationale: 'Prevents irreversible cell and electronics damage.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if EPS temperature exceeds 35°C'
    }
  },
  {
    type: 'reaction_wheel_stiction',
    category: 'subsystem',
    subsystem: 'attitude',
    label: 'Reaction Wheel Stiction & Jitter',
    description: 'Actuator bearing drag anomaly leading to gyro oscillations and bus current draw',
    severityRange: { min: 0.2, max: 0.8 },
    effects: ['reaction_wheel_speed_rpm fluctuates', 'gyro_x/y/z angular rates oscillate', 'power_bus_current_A increases'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Check wheel health and attitude-control margin',
          rationale: 'Determines if bearing stiction is transient or persistent mechanical drag.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Transfer momentum to magnetic torque rods',
          rationale: 'Unloads reaction wheel assembly.',
          safetyChecks: []
        },
        {
          rank: 3,
          action: 'Engage backup attitude reaction wheel channel',
          rationale: 'Ensures nominal 3-axis pointing stability.',
          safetyChecks: []
        }
      ],
      escalation: 'Safe mode if pointing error > 0.5°'
    }
  },
  {
    type: 'communication_degradation',
    category: 'subsystem',
    subsystem: 'communications',
    label: 'Communications Link Degradation',
    description: 'Drop in RF RX/TX signal power proxy and spike in telemetry packet loss',
    severityRange: { min: 0.1, max: 0.7 },
    effects: ['comm_rx_dbm and comm_tx_dbm drop', 'packet_loss_pct rises > 5%', 'data_queue_MB buffer accumulates'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Switch/verify communication path and prioritize critical packets',
          rationale: 'Restores essential spacecraft telemetry downlink margin.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Throttle high-bandwidth science payload telemetry queue',
          rationale: 'Prevents onboard memory queue buffer overflow.',
          safetyChecks: []
        }
      ],
      escalation: 'Switch to redundant transponder if packet loss persists'
    }
  },
  {
    type: 'radiation_upset',
    category: 'subsystem',
    subsystem: 'radiation',
    label: 'Radiation Event Single-Event Upset',
    description: 'High particle flux count rate triggering processor errors and memory utilization spikes',
    severityRange: { min: 0.2, max: 0.9 },
    effects: ['radiation_rate_counts_s exceeds 20 counts/s', 'cpu_utilization_pct and memory_utilization_pct jump', 'packet_loss_pct increases'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Enter radiation-aware mode and check compute faults',
          rationale: 'Protects flight computer memory through parity scrubbing and watchdog reset if needed.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Power cycle affected instrument payload sub-units',
          rationale: 'Clears single-event latchups (SEL) on unshielded payload electronics.',
          safetyChecks: []
        }
      ],
      escalation: 'Reboot OBC into safe hold if compute errors propagate'
    }
  },
  {
    type: 'payload_overload',
    category: 'subsystem',
    subsystem: 'payload',
    label: 'Payload Power Overdraw',
    description: 'Payload experiment draw exceeds allotted power envelope',
    severityRange: { min: 0.2, max: 0.8 },
    effects: ['payload_power_W rises > 75W', 'power_bus_current_A rises', 'battery_soc_pct drains faster than nominal'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Reduce payload duty cycle and inspect load request',
          rationale: 'Brings power draw back within nominal bus allowance.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Isolate payload instrument sub-rack',
          rationale: 'Protects core bus voltage regulation.',
          safetyChecks: []
        }
      ],
      escalation: 'Trip payload circuit breaker if overcurrent exceeds 15% threshold'
    }
  },
  {
    type: 'sensor_bias',
    category: 'sensor',
    subsystem: 'attitude',
    label: 'Sensor Bias / Gyro Shift',
    description: 'Constant offset injected into IMU / Gyro telemetry transducers',
    severityRange: { min: 0.1, max: 0.6 },
    effects: ['imu_accel_x/y and gyro_x show persistent offset', 'redundant estimators disagree'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Mark suspect sensor as UNRELIABLE and exclude from control loop',
          rationale: 'Avoids closed-loop attitude destabilization from erroneous bias.',
          safetyChecks: []
        },
        {
          rank: 2,
          action: 'Switch to analytical sensor fusion / sun sensors',
          rationale: 'Maintains orientation accuracy via independent estimators.',
          safetyChecks: []
        }
      ],
      escalation: 'None (Sensor-level isolation)'
    }
  },
  {
    type: 'power_bus_instability',
    category: 'subsystem',
    subsystem: 'power',
    label: 'Power Bus Voltage Instability',
    description: 'High-frequency oscillation and voltage drop across the main 28V power bus',
    severityRange: { min: 0.4, max: 1.0 },
    effects: ['power_bus_voltage_V drops < 25V or fluctuates', 'power_bus_current_A oscillates', 'battery_temperature_C elevates'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Check EPS regulation; reduce nonessential loads',
          rationale: 'Restores stable 28V power rail regulation.',
          safetyChecks: [{ rule: 'bus_voltage > 22V', passed: true }]
        },
        {
          rank: 2,
          action: 'Switch to redundant EPS power conditioning unit (PCU)',
          rationale: 'Isolates failing power stage.',
          safetyChecks: []
        }
      ],
      escalation: 'Immediate autonomous load shed to prevent bus brownout'
    }
  }
];

module.exports = faults;
