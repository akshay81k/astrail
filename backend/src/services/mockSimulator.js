const idGen = require('../utils/idGenerator');
const { signals } = require('../data/signalCatalog');
const faultCatalog = require('../data/faultCatalog');

class MockSimulator {
  constructor(session) {
    this.sessionId = session.id || session._id;
    this.seed = session.seed || 42;
    this.speed = session.speed || 4;
    this.status = session.status || 'playing';
    this.simTime = session.simTime || 0;
    this.mismatchLevel = session.mismatchLevel || 'medium';
    this.detectorSettings = session.detector || { targetFalseAlarmRate: 0.01, persistK: 5, persistN: 8 };

    // State tracking
    this.faults = [];
    this.stress = {
      missingPct: 0,
      noiseScale: 1.0,
      delaySec: 0,
      jitterSec: 0,
      outOfOrderPct: 0
    };
    this.dropouts = []; // { channel, endSimTime }
    this.sensorStatuses = {};
    this.activeIncidents = [];
    this.suppressedNoiseEpisodes = 0;
    this.faultFreeSimDays = 0;
    this.falseAlertsCount = 0;

    // Sliding window for persistence
    this.flagHistory = [];
    this.currentEpisode = null;

    // Nominal base states
    this.channelStates = {
      solar_current: 5.2,
      bus_voltage: 28.0,
      battery_soc: 92.0,
      battery_voltage: 27.8,
      battery_current: 1.5,
      load_power: 65.0,
      battery_temp: 21.0,
      panel_temp: 25.0,
      avionics_temp: 28.0,
      heater_state: 0,
      wheel_speed: 2100.0,
      wheel_current: 0.65,
      wheel_temp: 29.0,
      pointing_error: 0.04
    };

    signals.forEach(s => {
      this.sensorStatuses[s.id] = 'ok';
    });
  }

  // Advance simulation by N ticks
  step(ticks = 1) {
    const frameTicks = [];

    for (let i = 0; i < ticks; i++) {
      this.simTime += 1;
      try {
        const tickData = this._simulateTick(this.simTime);
        frameTicks.push(tickData);
      } catch (err) {
        console.error(`[MockSimulator] Error in _simulateTick at t=${this.simTime}:`, err);
      }
    }

    return this._formatFrame(frameTicks);
  }

  _simulateTick(t) {
    // 95-minute orbit period = 5700 seconds. 60% sunlight, 40% eclipse
    const orbitPeriod = 5700;
    const orbitPhase = (t % orbitPeriod) / orbitPeriod; // 0 to 1
    const inEclipse = orbitPhase > 0.60;
    const regime = inEclipse ? 'eclipse' : 'sunlight';

    // Base environmental dynamics
    let sunFactor = inEclipse ? 0.0 : Math.sin(orbitPhase * Math.PI / 0.60);
    sunFactor = Math.max(0, sunFactor);

    // Active Fault Calculations
    let solarDegradation = 0;
    let heaterForcedOn = false;
    let batteryDegradation = 0;
    let wheelFriction = 0;
    let radiatorDegradation = 0;
    let sensorDrifts = {};
    let sensorStuck = {};
    let sensorSpikes = {};
    let noiseBurst = 1.0;

    this.faults.forEach(f => {
      if (f.status === 'scheduled' && t >= f.startSimTime) {
        f.status = 'active';
        f.onsetSimTime = t;
      }

      if (f.status === 'active') {
        const elapsed = t - f.startSimTime;
        const rampProgress = f.rampSec > 0 ? Math.min(1.0, elapsed / f.rampSec) : 1.0;
        const currentSeverity = f.severity * rampProgress;

        if (f.durationSec && elapsed >= f.durationSec) {
          f.status = 'cleared';
          return;
        }

        switch (f.type) {
          case 'solar_degradation':
            solarDegradation = Math.max(solarDegradation, currentSeverity);
            break;
          case 'heater_stuck_on':
            heaterForcedOn = true;
            break;
          case 'battery_degradation':
            batteryDegradation = Math.max(batteryDegradation, currentSeverity);
            break;
          case 'wheel_friction':
            wheelFriction = Math.max(wheelFriction, currentSeverity);
            break;
          case 'radiator_degradation':
            radiatorDegradation = Math.max(radiatorDegradation, currentSeverity);
            break;
          case 'sensor_drift':
            if (f.target) sensorDrifts[f.target] = (sensorDrifts[f.target] || 0) + currentSeverity * (elapsed / 60);
            break;
          case 'sensor_stuck':
            if (f.target) sensorStuck[f.target] = true;
            break;
          case 'sensor_spike':
            if (f.target && elapsed < 2) sensorSpikes[f.target] = f.severity * 10;
            break;
          case 'noise_burst':
            noiseBurst = Math.max(noiseBurst, f.severity);
            break;
        }
      }
    });

    // Check active dropouts
    this.dropouts = this.dropouts.filter(d => t < d.endSimTime);

    // Compute Physical Channels
    const values = {};
    const forecast = {};
    const channelStatus = {};
    const limitState = {};

    // 1. Solar Current (A)
    const nominalSolar = sunFactor * 5.6;
    forecast.solar_current = parseFloat(nominalSolar.toFixed(2));
    values.solar_current = parseFloat((nominalSolar * (1.0 - solarDegradation)).toFixed(2));

    // 2. Heater State
    forecast.heater_state = 0;
    values.heater_state = heaterForcedOn ? 1 : (values.battery_temp < 8 ? 1 : 0);

    // 3. Load Power (W)
    const baseLoad = 55.0 + (values.heater_state === 1 ? 25.0 : 0.0) + (wheelFriction * 20.0);
    forecast.load_power = 55.0;
    values.load_power = parseFloat(baseLoad.toFixed(1));

    // 4. Battery Current (A) (Solar input minus load)
    const busVolts = 28.0;
    const loadCurrent = values.load_power / busVolts;
    const netCurrent = values.solar_current - loadCurrent;
    forecast.battery_current = parseFloat((nominalSolar - (55.0 / busVolts)).toFixed(2));
    values.battery_current = parseFloat(netCurrent.toFixed(2));

    // 5. Battery SOC (%)
    const socDelta = (values.battery_current / 3600.0) * (batteryDegradation > 0 ? 1.5 : 1.0);
    this.channelStates.battery_soc = Math.min(100.0, Math.max(10.0, this.channelStates.battery_soc + socDelta));
    forecast.battery_soc = parseFloat(Math.min(100, this.channelStates.battery_soc + 0.1).toFixed(1));
    values.battery_soc = parseFloat(this.channelStates.battery_soc.toFixed(1));

    // 6. Battery Voltage (V)
    const nominalVolt = 24.5 + (values.battery_soc / 100.0) * 4.5 - (batteryDegradation * 1.8);
    forecast.battery_voltage = parseFloat((24.5 + (forecast.battery_soc / 100.0) * 4.5).toFixed(2));
    values.battery_voltage = parseFloat(nominalVolt.toFixed(2));

    // 7. Bus Voltage (V)
    forecast.bus_voltage = 28.0;
    values.bus_voltage = parseFloat((28.0 - (values.load_power > 80 ? 0.4 : 0.0)).toFixed(2));

    // 8. Panel Temp (°C)
    const nominalPanel = inEclipse ? -35.0 : 65.0 * sunFactor;
    forecast.panel_temp = parseFloat(nominalPanel.toFixed(1));
    values.panel_temp = parseFloat((nominalPanel + (radiatorDegradation * 12.0)).toFixed(1));

    // 9. Battery Temp (°C)
    const thermalHeaterEffect = values.heater_state === 1 ? 14.0 : 0.0;
    const nominalBattTemp = 18.0 + (sunFactor * 4.0);
    forecast.battery_temp = parseFloat(nominalBattTemp.toFixed(1));
    values.battery_temp = parseFloat((nominalBattTemp + thermalHeaterEffect + (solarDegradation > 0 ? 6.5 : 0.0) + (batteryDegradation * 8.0)).toFixed(1));

    // 10. Avionics Temp (°C)
    forecast.avionics_temp = 24.0;
    values.avionics_temp = parseFloat((24.0 + (values.heater_state === 1 ? 8.0 : 0.0) + (wheelFriction * 6.0)).toFixed(1));

    // 11. Wheel Speed (rpm)
    forecast.wheel_speed = 2200.0;
    values.wheel_speed = parseFloat((2200.0 + (Math.sin(t / 40) * 40)).toFixed(0));

    // 12. Wheel Current (A)
    forecast.wheel_current = 0.60;
    values.wheel_current = parseFloat((0.60 + (wheelFriction * 0.95)).toFixed(2));

    // 13. Wheel Temp (°C)
    forecast.wheel_temp = 28.0;
    values.wheel_temp = parseFloat((28.0 + (wheelFriction * 18.0)).toFixed(1));

    // 14. Pointing Error (deg)
    forecast.pointing_error = 0.03;
    values.pointing_error = parseFloat((0.03 + (wheelFriction * 0.18)).toFixed(3));

    // Add noise and sensor effects
    let activeStressNoise = this.stress.noiseScale * noiseBurst;
    let sumNormalizedZ2 = 0;
    let availableCount = 0;

    signals.forEach(s => {
      const channel = s.id;
      const nominalSpan = (s.nominal?.max - s.nominal?.min) || 1.0;
      const isDropped = this.dropouts.some(d => d.channel === channel);
      const isMissingRandom = Math.random() * 100 < this.stress.missingPct;

      if (isDropped || isMissingRandom) {
        channelStatus[channel] = isDropped ? 'unavailable' : 'missing';
        values[channel] = null;
        this.sensorStatuses[channel] = channelStatus[channel];
        return;
      }

      // Apply drift / stuck / spike
      if (sensorDrifts[channel]) {
        values[channel] += sensorDrifts[channel];
      }
      if (sensorSpikes[channel]) {
        values[channel] += sensorSpikes[channel];
      }
      if (sensorStuck[channel]) {
        values[channel] = this.channelStates[channel] || 25.0;
      }

      // Add small gaussian-like measurement noise (0.5% span)
      const noise = (Math.random() - 0.5) * (nominalSpan * 0.005) * activeStressNoise;
      values[channel] = parseFloat((values[channel] + noise).toFixed(2));
      this.channelStates[channel] = values[channel];

      // Sensor status
      channelStatus[channel] = activeStressNoise > 2.5 ? 'noisy' : 'ok';
      this.sensorStatuses[channel] = channelStatus[channel];

      // Limit checking comparison baseline
      let limitFlag = 'ok';
      if (s.limits) {
        if (s.limits.redHigh && values[channel] >= s.limits.redHigh) limitFlag = 'red';
        else if (s.limits.yellowHigh && values[channel] >= s.limits.yellowHigh) limitFlag = 'yellow';
        else if (s.limits.redLow && values[channel] <= s.limits.redLow) limitFlag = 'red';
        else if (s.limits.yellowLow && values[channel] <= s.limits.yellowLow) limitFlag = 'yellow';
      }
      limitState[channel] = limitFlag;

      // Calculate residual vs forecast
      const residual = Math.abs(values[channel] - forecast[channel]);
      const normalizedZ = residual / (nominalSpan * 0.05); // standard error proxy
      sumNormalizedZ2 += normalizedZ * normalizedZ;
      availableCount++;
    });

    // Compute composite anomaly score & conformal threshold
    const hasActiveFault = this.faults.some(f => f.status === 'active');
    const meanScore = availableCount > 0 ? (sumNormalizedZ2 / availableCount) : 0;
    const score = hasActiveFault
      ? parseFloat(Math.min(15.0, Math.max(3.2, meanScore * 1.5)).toFixed(2))
      : parseFloat(Math.min(1.4, Math.max(0.7, meanScore * 0.5 + 0.7)).toFixed(2));
    const threshold = regime === 'eclipse' ? 2.6 : 2.1;
    const isAboveThreshold = score >= threshold;

    // Persistence rule: k of n
    this.flagHistory.push(isAboveThreshold ? 1 : 0);
    if (this.flagHistory.length > this.detectorSettings.persistN) {
      this.flagHistory.shift();
    }
    const kCount = this.flagHistory.filter(f => f === 1).length;
    const persistenceFired = kCount >= this.detectorSettings.persistK;

    // Manage Anomaly Episodes & Incidents
    this._handleEpisodes(t, persistenceFired, score, threshold, values, forecast);

    if (!persistenceFired && this.faults.every(f => f.status !== 'active')) {
      this.faultFreeSimDays += (1 / 86400);
    }

    return {
      t,
      channels: values,
      forecast,
      status: channelStatus,
      score,
      threshold,
      flag: persistenceFired ? 1 : 0,
      regime,
      limitState
    };
  }

  _handleEpisodes(t, persistenceFired, score, threshold, values, forecast) {
    const activeFault = this.faults.find(f => f.status === 'active');

    // Trigger incident if persistence fired and either no episode exists, or currently in noise but real fault is now active
    if (persistenceFired && (!this.currentEpisode || (this.currentEpisode.class === 'noise' && activeFault))) {
      const episodeId = idGen.anomaly();
      const isNoise = !activeFault && score < 3.5;
      const isSensor = activeFault?.category === 'sensor';
      const episodeClass = isNoise ? 'noise' : (isSensor ? 'sensor_fault' : 'subsystem_fault');

      this.currentEpisode = {
        id: episodeId,
        startSim: t,
        class: episodeClass,
        peakScore: score
      };

      if (episodeClass === 'noise') {
        this.suppressedNoiseEpisodes++;
      } else {
        const incident = this._createIncident(t, episodeId, activeFault, values, forecast);
        this.activeIncidents.push(incident);
      }
    } else if (this.currentEpisode) {
      this.currentEpisode.peakScore = Math.max(this.currentEpisode.peakScore, score);

      if (!persistenceFired && score < threshold * 0.8) {
        // Episode ended
        this.currentEpisode.endSim = t;
        this.currentEpisode = null;
      }
    }
  }

  _createIncident(t, episodeId, activeFault, values, forecast) {
    const faultType = activeFault ? activeFault.type : 'solar_degradation';
    const faultDef = faultCatalog.find(f => f.type === faultType) || faultCatalog[0];
    const incidentId = idGen.incident();

    // Link fault to incident
    if (activeFault) {
      activeFault.linkedIncidentId = incidentId;
      activeFault.truth = {
        trueAffected: [faultDef.subsystem || 'power', 'thermal'],
        onsetSimTime: activeFault.startSimTime || t,
        linkedIncidentId: incidentId,
        outcome: {
          top1Correct: true,
          inTop3: true,
          severityErrorPct: parseFloat((Math.random() * 4).toFixed(1)),
          detectionDelaySec: t - activeFault.startSimTime
        }
      };
    }

    const isSensor = faultDef.category === 'sensor';
    const classification = {
      label: isSensor ? 'sensor_fault' : 'subsystem_fault',
      probs: isSensor
        ? { noise: 0.05, sensor_fault: 0.91, subsystem_fault: 0.04 }
        : { noise: 0.02, sensor_fault: 0.06, subsystem_fault: 0.92 },
      rulePath: isSensor
        ? ['n_exceeding = 1', 'linked_disagree = true', 'sensor_fault']
        : ['channelsExceeding >= 3', 'exceedingSetGraphConnected = true', 'onsetOrderConsistent = true']
    };

    // Onset and ranked hypotheses
    const rankedCauses = [
      {
        hypothesis: faultType,
        target: activeFault?.target || 'solar_array',
        posterior: 0.87,
        severityEstimate: activeFault ? activeFault.severity : 0.22,
        fitCost: 1.3
      },
      {
        hypothesis: 'battery_degradation',
        target: 'battery',
        posterior: 0.08,
        severityEstimate: 0.31,
        fitCost: 3.9
      },
      {
        hypothesis: 'heater_stuck_on',
        target: 'heater',
        posterior: 0.05,
        severityEstimate: 1.0,
        fitCost: 4.4
      }
    ];

    const topChannel = isSensor ? (activeFault?.target || 'battery_temp') : 'solar_current';
    const contributions = [
      {
        channel: topChannel,
        share: 0.65,
        zScore: -4.2,
        observed: values[topChannel] || 3.9,
        forecast: forecast[topChannel] || 4.8,
        unit: 'A'
      },
      {
        channel: 'battery_temp',
        share: 0.25,
        zScore: 3.1,
        observed: values.battery_temp || 28.5,
        forecast: forecast.battery_temp || 21.0,
        unit: '°C'
      }
    ];

    const explanation = {
      headline: `Probable ${faultDef.label} (${faultDef.subsystem || 'power'} subsystem).`,
      evidence: `${topChannel} is 22% deviating from forecast; secondary thermal gradient emerged 45s later.`,
      causeConfidence: `${faultDef.label}, about ${Math.round((activeFault?.severity || 0.22) * 100)}% severity, confidence 87%.`,
      action: faultDef.fmea?.rankedActions[0]?.action || 'Inspect subsystem telemetry.'
    };

    return {
      id: incidentId,
      sessionId: this.sessionId,
      status: 'open',
      severity: 'critical',
      risk: 'high',
      openedAtSim: t,
      openedAtTs: new Date().toISOString(),
      classification,
      onset: {
        simTime: activeFault?.startSimTime || t,
        order: [
          { channel: topChannel, t: activeFault?.startSimTime || t, z: -4.2 },
          { channel: 'battery_soc', t: t + 15, z: -2.8 },
          { channel: 'battery_temp', t: t + 35, z: 3.1 }
        ]
      },
      rankedCauses,
      confidence: {
        value: 0.87,
        previous: 0.94,
        components: {
          posteriorTop1: 0.87,
          dataQualityFactor: 0.98,
          detectorAgreement: 1.0
        },
        reason: 'High confidence fit across 3 linked physical channels.'
      },
      affectedSubsystems: [
        { subsystem: faultDef.subsystem || 'power', role: 'source' },
        { subsystem: 'thermal', role: 'affected' },
        { subsystem: 'attitude', role: 'not_affected' }
      ],
      propagation: [
        { t: activeFault?.startSimTime || t, channel: topChannel, event: 'Output dropped below predicted baseline' },
        { t: t + 15, channel: 'battery_soc', event: 'Battery charging rate decreased' },
        { t: t + 35, channel: 'battery_temp', event: 'Temperature rise detected' }
      ],
      contributions,
      explanation,
      recommendations: faultDef.fmea?.rankedActions || [],
      timeToLimit: {
        channel: 'battery_temp',
        limit: 45,
        etaSec: 1850,
        basis: 'twin_forecast'
      },
      detection: {
        gruFlag: true,
        iforestFlag: true,
        cusumFlag: false,
        limitAlarmAtSim: t + 650,
        leadTimeSec: 650
      },
      mode: 'full',
      diagnosisState: {
        stage: 'refined',
        fitsCompleted: 3,
        evidenceWindowSec: 120,
        heuristicOnly: false
      },
      groundTruth: null,
      history: [
        { action: 'created', note: 'Incident automatically opened upon conformal persistence threshold trigger' }
      ],
      notes: []
    };
  }

  _formatFrame(ticks) {
    const t = [];
    const channels = {};
    const forecast = {};
    const status = {};
    const score = [];
    const threshold = [];
    const flag = [];
    const regime = [];
    const limitState = {};

    signals.forEach(s => {
      channels[s.id] = [];
      forecast[s.id] = [];
      status[s.id] = [];
      limitState[s.id] = [];
    });

    ticks.forEach(tick => {
      t.push(tick.t);
      score.push(tick.score);
      threshold.push(tick.threshold);
      flag.push(tick.flag);
      regime.push(tick.regime);

      signals.forEach(s => {
        channels[s.id].push(tick.channels[s.id]);
        forecast[s.id].push(tick.forecast[s.id]);
        status[s.id].push(tick.status[s.id]);
        limitState[s.id].push(tick.limitState[s.id]);
      });
    });

    return {
      sessionId: this.sessionId,
      t,
      channels,
      forecast,
      status,
      score,
      threshold,
      flag,
      regime,
      limitState
    };
  }

  getStateSnapshot() {
    let powerHealth = 'green';
    let thermalHealth = 'green';
    let attitudeHealth = 'green';

    const latestValues = this.channelStates;
    if (latestValues.solar_current < 3.0 || latestValues.battery_soc < 60) powerHealth = 'amber';
    if (latestValues.battery_soc < 40) powerHealth = 'red';
    if (latestValues.battery_temp > 35) thermalHealth = 'amber';
    if (latestValues.battery_temp > 42) thermalHealth = 'red';
    if (latestValues.wheel_temp > 50 || latestValues.pointing_error > 0.15) attitudeHealth = 'amber';

    const sensorsList = signals.map(s => ({
      id: s.id,
      status: this.sensorStatuses[s.id] || 'ok',
      ageSec: this.sensorStatuses[s.id] === 'missing' ? 25 : 0,
      imputed: this.sensorStatuses[s.id] === 'missing'
    }));

    return {
      sessionId: this.sessionId,
      status: this.status,
      simTime: this.simTime,
      speed: this.speed,
      subsystemHealth: {
        power: powerHealth,
        thermal: thermalHealth,
        attitude: attitudeHealth
      },
      sensors: sensorsList,
      score: this.flagHistory.length > 0 ? (this.flagHistory[this.flagHistory.length - 1] === 1 ? 3.4 : 1.2) : 1.1,
      threshold: 2.1,
      persistence: {
        k: this.detectorSettings.persistK,
        n: this.detectorSettings.persistN,
        count: this.flagHistory.filter(f => f === 1).length
      },
      dataQuality: {
        score: parseFloat((1.0 - (this.stress.missingPct / 100) * 0.4).toFixed(2)),
        missingPct: this.stress.missingPct,
        delaySec: this.stress.delaySec
      },
      falseAlerts: {
        episodes: this.falseAlertsCount,
        faultFreeSimDays: parseFloat(this.faultFreeSimDays.toFixed(2)),
        perDay: parseFloat((this.falseAlertsCount / Math.max(0.1, this.faultFreeSimDays)).toFixed(2)),
        targetPerDay: this.detectorSettings.targetFalseAlarmRate * 100
      },
      activeIncidentIds: this.activeIncidents.filter(i => i.status === 'open' || i.status === 'analyzing').map(i => i.id),
      sourceLabel: `Physics-based simulator (seed ${this.seed}, ${this.mismatchLevel} mismatch)`
    };
  }
}

module.exports = MockSimulator;
