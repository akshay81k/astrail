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
    description: 'Single-tick outlier excursion that immediately reverts',
    severityRange: { min: 0.5, max: 5.0 },
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
    type: 'noise_burst',
    category: 'benign',
    label: 'Benign Noise Burst',
    description: 'Short-duration increase in sensor variance without subsystem deviation',
    severityRange: { min: 1.5, max: 5.0 },
    effects: ['Higher rolling variance over 1-5 seconds'],
    fmea: {
      rankedActions: [
        {
          rank: 1,
          action: 'Suppressed by cross-sensor consistency checks',
          rationale: 'No subsystem health impact.',
          safetyChecks: []
        }
      ],
      escalation: 'None'
    }
  }
];

module.exports = faults;
