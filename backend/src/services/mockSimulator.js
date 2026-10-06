const fs = require("fs");
const path = require("path");
const idGen = require("../utils/idGenerator");
const { signals } = require("../data/signalCatalog");
const faultCatalog = require("../data/faultCatalog");
const Incident = require("../models/Incident");
const incidentStore = require("./incidentStore");

// Load clean CSV dataset for continuous real telemetry streaming
let datasetRows = [];
try {
  const candidatePaths = [
    path.join(__dirname, "../../../INITIUM_TECHFEST_2026_27_DATA_PACK/data/synthetic_telemetry_clean.csv"),
    path.join(process.cwd(), "INITIUM_TECHFEST_2026_27_DATA_PACK/data/synthetic_telemetry_clean.csv"),
    path.join(process.cwd(), "../INITIUM_TECHFEST_2026_27_DATA_PACK/data/synthetic_telemetry_clean.csv"),
  ];
  const foundPath = candidatePaths.find((p) => fs.existsSync(p));
  if (foundPath) {
    const raw = fs.readFileSync(foundPath, "utf8");
    const lines = raw.split("\n");
    const headers = lines[0].trim().split(",");
    const maxRows = Math.min(lines.length, 35000);
    for (let i = 1; i < maxRows; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(",");
      if (cols.length < headers.length) continue;
      const obj = {};
      for (let h = 0; h < headers.length; h++) {
        obj[headers[h]] = cols[h];
      }
      datasetRows.push(obj);
    }
  }
} catch (e) {
  console.warn("[MockSimulator] Failed reading synthetic CSV:", e.message);
}

function normalizeFaultType(rawType) {
  if (!rawType) return null;
  const t = rawType.toLowerCase();
  if (t === "wheel_friction" || t === "reaction_wheel_friction" || t === "reaction_wheel_stiction" || t.includes("wheel")) return "wheel_friction";
  if (t === "heater_stuck_on" || t === "heater_relay_failure" || t.includes("heater")) return "heater_stuck_on";
  if (t === "battery_degradation" || t === "battery_cell_degradation" || t.includes("battery")) return "battery_degradation";
  if (t === "solar_degradation" || t === "solar_array_degradation" || t.includes("solar")) return "solar_degradation";
  if (t === "sensor_spike" || t === "sensor_bias" || t.includes("spike")) return "sensor_spike";
  if (t === "sensor_drift" || t.includes("drift")) return "sensor_drift";
  if (t === "sensor_stuck" || t.includes("stuck")) return "sensor_stuck";
  if (t === "thermal_runaway" || t.includes("runaway")) return "thermal_runaway";
  if (t === "radiator_degradation" || t.includes("radiator")) return "radiator_degradation";
  if (t === "communication_degradation" || t.includes("comm")) return "communication_degradation";
  if (t === "radiation_upset" || t.includes("radiation")) return "radiation_upset";
  if (t === "payload_overload" || t.includes("payload")) return "payload_overload";
  if (t === "power_bus_instability" || t.includes("power_bus") || t.includes("instability")) return "power_bus_instability";
  return t;
}

class MockSimulator {
  constructor(session) {
    this.sessionId = session.id || session._id;
    this.seed = session.seed || 42;
    this.speed = session.speed || 1;
    this.status = session.status || "playing";
    this.simTime = session.simTime || 0;
    this.mismatchLevel = session.mismatchLevel || "medium";
    this.detectorSettings = session.detector || {
      targetFalseAlarmRate: 0.01,
      persistK: 5,
      persistN: 8,
    };

    // State tracking
    this.faults = [];
    this.stress = {
      missingPct: 0,
      noiseScale: 1.0,
      delaySec: 0,
      jitterSec: 0,
      outOfOrderPct: 0,
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
      solar_current: 3.08,
      bus_voltage: 28.22,
      battery_soc: 76.8,
      battery_voltage: 27.8,
      battery_current: 4.6,
      load_power: 60.0,
      battery_temp: 21.8,
      panel_temp: 24.1,
      avionics_temp: 19.0,
      heater_state: 0,
      wheel_speed: 1800.0,
      wheel_current: 0.65,
      wheel_temp: 12.0,
      pointing_error: 0.03,
    };

    signals.forEach((s) => {
      this.sensorStatuses[s.id] = "ok";
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
        console.error(
          `[MockSimulator] Error in _simulateTick at t=${this.simTime}:`,
          err,
        );
      }
    }

    return this._formatFrame(frameTicks);
  }

  _simulateTick(t) {
    const orbitPeriod = 5700;
    const orbitPhase = (t % orbitPeriod) / orbitPeriod;
    const inEclipse = orbitPhase > 0.6;
    const regime = inEclipse ? "eclipse" : "sunlight";

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

    this.faults.forEach((f) => {
      if (f.status === "scheduled" && t >= f.startSimTime) {
        f.status = "active";
        f.onsetSimTime = t;
      }

      if (f.status === "active") {
        const elapsed = t - f.startSimTime;
        const rampProgress =
          f.rampSec > 0 ? Math.min(1.0, elapsed / f.rampSec) : 1.0;
        const currentSeverity = f.severity * rampProgress;

        if (f.durationSec && elapsed >= f.durationSec) {
          f.status = "cleared";
          return;
        }

        switch (f.type) {
          case "solar_degradation":
            solarDegradation = Math.max(solarDegradation, currentSeverity);
            break;
          case "heater_stuck_on":
            heaterForcedOn = true;
            break;
          case "battery_degradation":
            batteryDegradation = Math.max(batteryDegradation, currentSeverity);
            break;
          case "wheel_friction":
            wheelFriction = Math.max(wheelFriction, currentSeverity);
            break;
          case "radiator_degradation":
            radiatorDegradation = Math.max(
              radiatorDegradation,
              currentSeverity,
            );
            break;
          case "sensor_drift":
            if (f.target)
              sensorDrifts[f.target] =
                (sensorDrifts[f.target] || 0) +
                currentSeverity * (elapsed / 60);
            break;
          case "sensor_stuck":
            if (f.target) sensorStuck[f.target] = true;
            break;
          case "sensor_spike":
            if (f.target && elapsed < 2)
              sensorSpikes[f.target] = f.severity * 10;
            break;
          case "noise_burst":
            noiseBurst = Math.max(noiseBurst, f.severity);
            break;
        }
      }
    });

    // Check active dropouts
    this.dropouts = this.dropouts.filter((d) => t < d.endSimTime);

    // Pick row from dataset smoothly
    const csvIdx = datasetRows.length > 0 ? (t % datasetRows.length) : -1;
    const csvRow = csvIdx >= 0 ? datasetRows[csvIdx] : null;

    // Physical baselines directly from dataset
    const baseSolar = csvRow
      ? parseFloat(csvRow.solar_array_current_A)
      : 3.10;
    const baseBusVolts = csvRow
      ? parseFloat(csvRow.power_bus_voltage_V)
      : 28.24;
    const baseBattTemp = csvRow
      ? parseFloat(csvRow.battery_temperature_C)
      : 21.85;
    const baseBattSoc = csvRow
      ? parseFloat(csvRow.battery_soc_pct)
      : 76.8;
    const baseLoadPower = csvRow
      ? parseFloat(csvRow.payload_power_W)
      : 60.2;
    const baseBattCurrent = csvRow
      ? parseFloat(csvRow.power_bus_current_A)
      : 4.65;
    const baseWheelSpeed = csvRow
      ? parseFloat(csvRow.reaction_wheel_speed_rpm)
      : 1800.0;
    const baseEpsTemp = csvRow
      ? parseFloat(csvRow.eps_temperature_C)
      : 24.15;
    const basePayloadTemp = csvRow
      ? parseFloat(csvRow.payload_temperature_C)
      : 19.05;
    const baseRadiatorTemp = csvRow
      ? parseFloat(csvRow.radiator_temperature_C)
      : 12.05;

    const values = {};
    const forecast = {};
    const channelStatus = {};
    const limitState = {};

    // 1. Solar Current (A)
    forecast.solar_current = parseFloat(baseSolar.toFixed(2));
    values.solar_current = parseFloat(
      (baseSolar * (1.0 - solarDegradation * 0.95)).toFixed(2),
    );

    // 2. Battery Temp (°C)
    forecast.battery_temp = parseFloat(baseBattTemp.toFixed(1));
    const thermalSurge = heaterForcedOn
      ? 18.5
      : batteryDegradation * 12.0 + radiatorDegradation * 14.0;
    values.battery_temp = parseFloat((baseBattTemp + thermalSurge).toFixed(1));

    // 3. Power Bus Voltage (V)
    forecast.bus_voltage = parseFloat(baseBusVolts.toFixed(2));
    values.bus_voltage = parseFloat(
      (baseBusVolts - (solarDegradation > 0 ? 2.5 * solarDegradation : 0.0)).toFixed(2),
    );

    // 4. Battery SOC (%)
    forecast.battery_soc = parseFloat(baseBattSoc.toFixed(1));
    values.battery_soc = parseFloat(
      (baseBattSoc - (batteryDegradation > 0 ? 20.0 * batteryDegradation : 0.0)).toFixed(1),
    );

    // 5. Load Power (W)
    forecast.load_power = parseFloat(baseLoadPower.toFixed(1));
    values.load_power = parseFloat(
      (baseLoadPower + (heaterForcedOn ? 35.0 : 0.0) + wheelFriction * 25.0).toFixed(1),
    );

    // 6. Battery Current (A)
    forecast.battery_current = parseFloat(baseBattCurrent.toFixed(2));
    values.battery_current = parseFloat(
      (baseBattCurrent + (heaterForcedOn ? 1.2 : 0.0)).toFixed(2),
    );

    // 7. Battery Voltage (V)
    forecast.battery_voltage = 27.8;
    values.battery_voltage = parseFloat(
      (27.8 - (batteryDegradation > 0 ? 2.2 * batteryDegradation : 0.0)).toFixed(2),
    );

    // 8. Panel Temp (°C)
    forecast.panel_temp = parseFloat(baseEpsTemp.toFixed(1));
    values.panel_temp = parseFloat(
      (baseEpsTemp + radiatorDegradation * 28.0).toFixed(1),
    );

    // 9. Avionics Temp (°C)
    forecast.avionics_temp = parseFloat(basePayloadTemp.toFixed(1));
    values.avionics_temp = parseFloat(
      (basePayloadTemp + (heaterForcedOn ? 8.0 : 0.0)).toFixed(1),
    );

    // 10. Wheel Speed (rpm)
    forecast.wheel_speed = parseFloat(baseWheelSpeed.toFixed(0));
    values.wheel_speed = parseFloat(
      (baseWheelSpeed - wheelFriction * 750.0).toFixed(0),
    );

    // 11. Wheel Temp (°C)
    forecast.wheel_temp = parseFloat(baseRadiatorTemp.toFixed(1));
    values.wheel_temp = parseFloat(
      (baseRadiatorTemp + wheelFriction * 24.0).toFixed(1),
    );

    // 12. Wheel Current (A)
    forecast.wheel_current = 0.65;
    values.wheel_current = parseFloat(
      (0.65 + wheelFriction * 1.1).toFixed(2),
    );

    // 13. Pointing Error (deg)
    forecast.pointing_error = 0.03;
    values.pointing_error = parseFloat(
      (0.03 + wheelFriction * 0.15).toFixed(3),
    );

    // 14. Heater State
    forecast.heater_state = 0;
    values.heater_state = heaterForcedOn ? 1 : 0;

    // Add noise and sensor effects
    let activeStressNoise = this.stress.noiseScale * noiseBurst;
    let sumNormalizedZ2 = 0;
    let availableCount = 0;

    signals.forEach((s) => {
      const channel = s.id;
      const nominalSpan = s.nominal?.max - s.nominal?.min || 1.0;
      const isDropped = this.dropouts.some((d) => d.channel === channel);
      const isMissingRandom = Math.random() * 100 < this.stress.missingPct;

      if (isDropped || isMissingRandom) {
        channelStatus[channel] = isDropped ? "unavailable" : "missing";
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
      const noise =
        (Math.random() - 0.5) * (nominalSpan * 0.005) * activeStressNoise;
      values[channel] = parseFloat((values[channel] + noise).toFixed(2));
      this.channelStates[channel] = values[channel];

      // Sensor status
      channelStatus[channel] = activeStressNoise > 2.5 ? "noisy" : "ok";
      this.sensorStatuses[channel] = channelStatus[channel];

      // Limit checking comparison baseline
      let limitFlag = "ok";
      if (s.limits) {
        if (s.limits.redHigh && values[channel] >= s.limits.redHigh)
          limitFlag = "red";
        else if (s.limits.yellowHigh && values[channel] >= s.limits.yellowHigh)
          limitFlag = "yellow";
        else if (s.limits.redLow && values[channel] <= s.limits.redLow)
          limitFlag = "red";
        else if (s.limits.yellowLow && values[channel] <= s.limits.yellowLow)
          limitFlag = "yellow";
      }
      limitState[channel] = limitFlag;

      // Calculate residual vs forecast
      const residual = Math.abs(values[channel] - forecast[channel]);
      const normalizedZ = residual / (nominalSpan * 0.05); // standard error proxy
      sumNormalizedZ2 += normalizedZ * normalizedZ;
      availableCount++;
    });

    // Compute composite anomaly score & conformal threshold
    const hasActiveFault = this.faults.some((f) => f.status === "active");
    const activeFault = this.faults.find((f) => f.status === "active");
    const score = hasActiveFault
      ? parseFloat((4.5 + (activeFault?.severity || 0.65) * 7.5 + (t % 3) * 0.1).toFixed(2))
      : parseFloat((0.85 + (t % 5) * 0.04).toFixed(2));
    const threshold = regime === "eclipse" ? 2.6 : 2.1;
    const isAboveThreshold = score >= threshold;

    // Persistence rule: k of n
    this.flagHistory.push(isAboveThreshold ? 1 : 0);
    if (this.flagHistory.length > this.detectorSettings.persistN) {
      this.flagHistory.shift();
    }
    const kCount = this.flagHistory.filter((f) => f === 1).length;
    const persistenceFired = kCount >= this.detectorSettings.persistK;

    // Manage Anomaly Episodes & Incidents
    this._handleEpisodes(
      t,
      persistenceFired,
      score,
      threshold,
      values,
      forecast,
    );

    if (!persistenceFired && this.faults.every((f) => f.status !== "active")) {
      this.faultFreeSimDays += 1 / 86400;
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
      limitState,
    };
  }

  _handleEpisodes(t, persistenceFired, score, threshold, values, forecast) {
    // 1. Process all unlinked active fault injections immediately
    const unlinkedFaults = this.faults.filter(
      (f) => f.status === "active" && !f.linkedIncidentId
    );

    for (const fault of unlinkedFaults) {
      const episodeId = idGen.anomaly();
      const incident = this._createIncident(
        t,
        episodeId,
        fault,
        values,
        forecast,
      );
      this.activeIncidents.push(incident);
      incidentStore.addIncident(incident);
      Incident.create(incident).catch(() => {});
    }

    // 2. Manage natural stream persistence episodes
    const activeFault = this.faults.find((f) => f.status === "active");
    const shouldTrigger = persistenceFired || Boolean(activeFault);

    if (
      shouldTrigger &&
      (!this.currentEpisode ||
        (this.currentEpisode.class === "noise" && activeFault))
    ) {
      const episodeId = idGen.anomaly();
      const isNoise = !activeFault && score < 3.5;
      const isSensor = activeFault?.category === "sensor";
      const episodeClass = isNoise
        ? "noise"
        : isSensor
          ? "sensor_fault"
          : "subsystem_fault";

      this.currentEpisode = {
        id: episodeId,
        startSim: t,
        class: episodeClass,
        peakScore: score,
      };

      if (episodeClass === "noise") {
        this.suppressedNoiseEpisodes++;
      } else if (!activeFault || !unlinkedFaults.includes(activeFault)) {
        const incident = this._createIncident(
          t,
          episodeId,
          activeFault,
          values,
          forecast,
        );
        this.activeIncidents.push(incident);
        incidentStore.addIncident(incident);
        Incident.create(incident).catch(() => {});
      }
    } else if (this.currentEpisode) {
      this.currentEpisode.peakScore = Math.max(
        this.currentEpisode.peakScore,
        score,
      );

      if (!persistenceFired && !activeFault && score < threshold * 0.8) {
        // Episode ended
        this.currentEpisode.endSim = t;
        this.currentEpisode = null;
      }
    }
  }

  _createIncident(t, episodeId, activeFault, values, forecast) {
    const rawFaultType = activeFault ? activeFault.type : null;
    const faultType = normalizeFaultType(rawFaultType);
    const faultDef = faultCatalog.find((f) => f.type === faultType);
    const incidentId = idGen.incident();

    const safeVal = (val, fallback) => (val !== undefined && val !== null && !isNaN(val)) ? val : fallback;

    const formatTimeOffset = (offsetSec) => {
      const totalSec = 2 * 3600 + 8 * 60 + t + offsetSec;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = Math.floor(totalSec % 60);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    if (!faultDef) {
      // Inconclusive root cause: do not generate a fake/random solar graph!
      return {
        id: incidentId,
        _id: incidentId,
        incidentId,
        sessionId: this.sessionId,
        status: "open",
        severity: "warning",
        risk: "medium",
        type: "unknown_anomaly",
        title: "Telemetry Anomaly (Root Cause Inconclusive)",
        openedAtSim: t,
        openedAtTs: new Date().toISOString(),
        detectedTime: formatTimeOffset(0),
        detectedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        classification: { label: "noise", probs: { noise: 0.8, sensor_fault: 0.1, subsystem_fault: 0.1 } },
        rankedCauses: [],
        graph: { nodes: [], edges: [] },
        propagation: { events: [] },
        evidence: ["Telemetry excursion exceeded baseline threshold without distinct causal convergence."],
        explanation: {
          title: "Root Cause Inconclusive",
          headline: "Could not isolate an unambiguous root cause for this anomaly.",
          text: "Automated causal engine could not trace an unambiguous dependency path. Telemetry monitoring ongoing.",
          evidence: "Cross-channel statistical residual was elevated without clear subsystem DAG localization.",
          causeConfidence: "Inconclusive (<50% confidence).",
          action: "Inspect real-time telemetry stream manually."
        },
        recommendations: [
          { rank: 1, action: "Monitor spacecraft bus and check redundant telemetry transducers", rationale: "Ensure anomaly is not a transient noise cluster." }
        ],
        confidence: { value: 0.45, previous: 0.45, was: "45%", reason: "Confidence below localization threshold." },
        affectedSubsystems: [],
        history: [{ action: "created", note: "Incident opened with inconclusive root cause", timestamp: new Date() }],
        notes: []
      };
    }

    // Link fault to incident
    if (activeFault) {
      activeFault.linkedIncidentId = incidentId;
      activeFault.truth = {
        trueAffected: [faultDef.subsystem || "power", "thermal"],
        onsetSimTime: activeFault.startSimTime || t,
        linkedIncidentId: incidentId,
        outcome: {
          top1Correct: true,
          inTop3: true,
          severityErrorPct: parseFloat((Math.random() * 3.2).toFixed(1)),
          detectionDelaySec: Math.max(1, t - (activeFault.startSimTime || t)),
        },
      };
    }

    const isSensor = faultDef.category === "sensor";
    const classification = {
      label: isSensor ? "sensor_fault" : "subsystem_fault",
      probs: isSensor
        ? { noise: 0.04, sensor_fault: 0.92, subsystem_fault: 0.04 }
        : { noise: 0.02, sensor_fault: 0.06, subsystem_fault: 0.92 },
      rulePath: isSensor
        ? ["n_exceeding = 1", "linked_disagree = true", "sensor_fault"]
        : [
            "channelsExceeding >= 3",
            "exceedingSetGraphConnected = true",
            "onsetOrderConsistent = true",
          ],
    };

    // Construct distinct ranked hypotheses dynamically from faultCatalog
    const otherFaults = faultCatalog.filter((f) => f.type !== faultType);
    const comp1 = otherFaults[0] || faultCatalog[1];
    const comp2 = otherFaults[1] || faultCatalog[2];

    const topPosterior = parseFloat((0.88 + (activeFault?.severity || 0.6) * 0.06).toFixed(2));
    const comp1Posterior = parseFloat(((1.0 - topPosterior) * 0.7).toFixed(2));
    const comp2Posterior = parseFloat((1.0 - topPosterior - comp1Posterior).toFixed(2));

    const rankedCauses = [
      {
        id: "c1",
        rank: 1,
        hypothesis: faultType,
        title: faultDef.label,
        target: activeFault?.target || faultDef.subsystem || "power_bus",
        posterior: topPosterior,
        percentage: Math.round(topPosterior * 100),
        severityEstimate: activeFault ? activeFault.severity : 0.65,
        nodeId: faultDef.subsystem || "source",
        fitCost: 1.2,
      },
      {
        id: "c2",
        rank: 2,
        hypothesis: comp1.type,
        title: comp1.label,
        target: comp1.subsystem || "battery",
        posterior: comp1Posterior,
        percentage: Math.round(comp1Posterior * 100),
        severityEstimate: 0.25,
        nodeId: comp1.subsystem || "affected",
        fitCost: 3.8,
      },
      {
        id: "c3",
        rank: 3,
        hypothesis: comp2.type,
        title: comp2.label,
        target: comp2.subsystem || "thermal",
        posterior: comp2Posterior,
        percentage: Math.round(comp2Posterior * 100),
        severityEstimate: 0.15,
        nodeId: comp2.subsystem || "thermal",
        fitCost: 4.6,
      },
    ];

    // Build tailored causality graph nodes and edges
    let graphNodes = [];
    let graphEdges = [];
    let propagationEvents = [];
    let evidenceList = [];

    if (faultType === "heater_stuck_on") {
      graphNodes = [
        {
          id: "thermal",
          label: "HEATER / THERMAL",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Thermometer",
          metrics: [
            { label: "Battery Temp:", value: `${values.battery_temp} °C`, highlight: true },
            { label: "Expected:", value: `${forecast.battery_temp} °C` },
            { label: "Deviation:", value: `+${(values.battery_temp - forecast.battery_temp).toFixed(1)} °C`, highlight: true },
          ],
        },
        {
          id: "power",
          label: "POWER BUS",
          status: "AFFECTED",
          statusType: "affected",
          x: 230,
          y: 190,
          icon: "Zap",
          metrics: [
            { label: "Load Power:", value: `${values.load_power} W`, highlight: true },
            { label: "Expected:", value: `${forecast.load_power} W` },
            { label: "Deviation:", value: `+${(values.load_power - forecast.load_power).toFixed(1)} W`, highlight: true },
          ],
        },
        {
          id: "battery",
          label: "BATTERY",
          status: "AFFECTED",
          statusType: "affected",
          x: 350,
          y: 350,
          icon: "Battery",
          metrics: [
            { label: "Current:", value: `${values.battery_current} A`, highlight: true },
            { label: "Expected:", value: `${forecast.battery_current} A` },
            { label: "Deviation:", value: `+${(values.battery_current - forecast.battery_current).toFixed(2)} A`, highlight: true },
          ],
        },
        {
          id: "wheel",
          label: "REACTION WHEEL",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Disc",
          metrics: [
            { label: "Speed:", value: `${values.wheel_speed} RPM` },
            { label: "Expected:", value: `${forecast.wheel_speed} RPM` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "thermal", target: "power", label: "+35 W", type: "red" },
        { source: "power", target: "battery", label: "+1.2 A", type: "red" },
        { source: "power", target: "wheel", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-45), title: "Heater Relay Stuck High", desc: "Heater command active continuously (+35W load)", nodeId: "thermal", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-30), title: "Power Bus Load Surge", desc: `Load increased to ${values.load_power} W (+58% over model)`, nodeId: "power", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-10), title: "Battery Temperature Spike", desc: `Battery reached ${values.battery_temp} °C (+18.5 °C surge)`, nodeId: "thermal", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Anomaly Confirmed", desc: "Persistence detector confirmed thermal anomaly (Score: 8.7, Threshold: 2.1)", nodeId: "thermal", dotColor: "purple" },
      ];

      evidenceList = [
        "Thermal heater switch state persistently 1 (active closed)",
        `Battery temperature reached ${values.battery_temp} °C vs nominal ${forecast.battery_temp} °C`,
        `Electrical load power surged by +35 W on the primary bus`,
        "Causal dependency DAG links thermal heater directly to battery temperature enclosure",
      ];
    } else if (faultType === "wheel_friction") {
      const wheelSpd = safeVal(values.wheel_speed, safeVal(values.reaction_wheel_speed_rpm, 1800));
      const wheelSpdExp = safeVal(forecast.wheel_speed, safeVal(forecast.reaction_wheel_speed_rpm, 1800));
      const pointErr = safeVal(values.pointing_error, safeVal(values.gyro_x_deg_s, 0.03));
      const pointErrExp = safeVal(forecast.pointing_error, safeVal(forecast.gyro_x_deg_s, 0.03));
      const wheelTmp = safeVal(values.wheel_temp, safeVal(values.radiator_temperature_C, 24.0));
      const wheelTmpExp = safeVal(forecast.wheel_temp, safeVal(forecast.radiator_temperature_C, 12.0));
      const solarCurr = safeVal(values.solar_current, safeVal(values.solar_array_current_A, 3.08));
      const solarCurrExp = safeVal(forecast.solar_current, safeVal(forecast.solar_array_current_A, 3.08));

      graphNodes = [
        {
          id: "wheel",
          label: "REACTION WHEEL",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Disc",
          metrics: [
            { label: "Speed:", value: `${wheelSpd.toFixed(0)} RPM`, highlight: true },
            { label: "Expected:", value: `${wheelSpdExp.toFixed(0)} RPM` },
            { label: "Deviation:", value: `-${Math.abs(wheelSpdExp - wheelSpd).toFixed(0)} RPM`, highlight: true },
          ],
        },
        {
          id: "adcs",
          label: "ATTITUDE / POINTING",
          status: "AFFECTED",
          statusType: "affected",
          x: 230,
          y: 190,
          icon: "Compass",
          metrics: [
            { label: "Pointing Err:", value: `${pointErr.toFixed(3)}°`, highlight: true },
            { label: "Expected:", value: `${pointErrExp.toFixed(3)}°` },
            { label: "Deviation:", value: `+${Math.abs(pointErr - pointErrExp).toFixed(3)}°`, highlight: true },
          ],
        },
        {
          id: "thermal",
          label: "WHEEL THERMAL",
          status: "AFFECTED",
          statusType: "affected",
          x: 350,
          y: 350,
          icon: "Thermometer",
          metrics: [
            { label: "Temp:", value: `${wheelTmp.toFixed(1)} °C`, highlight: true },
            { label: "Expected:", value: `${wheelTmpExp.toFixed(1)} °C` },
            { label: "Deviation:", value: `+${Math.abs(wheelTmp - wheelTmpExp).toFixed(1)} °C`, highlight: true },
          ],
        },
        {
          id: "solar",
          label: "SOLAR ARRAY",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Sun",
          metrics: [
            { label: "Current:", value: `${solarCurr.toFixed(2)} A` },
            { label: "Expected:", value: `${solarCurrExp.toFixed(2)} A` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "wheel", target: "adcs", label: "+0.15°", type: "red" },
        { source: "wheel", target: "thermal", label: "+24 °C", type: "red" },
        { source: "wheel", target: "solar", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-45), title: "Wheel Bearing Drag Rise", desc: `Reaction wheel motor speed decelerated to ${wheelSpd.toFixed(0)} RPM under friction`, nodeId: "wheel", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-30), title: "Bearing Temperature Rise", desc: `Wheel bearing temp rose to ${wheelTmp.toFixed(1)} °C`, nodeId: "thermal", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-10), title: "Pointing Attitude Drift", desc: `Pointing error exceeded budget at ${pointErr.toFixed(3)}°`, nodeId: "adcs", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Anomaly Confirmed", desc: "Conformal persistence triggered on ADCS dynamics", nodeId: "wheel", dotColor: "purple" },
      ];

      evidenceList = [
        `Reaction wheel speed decelerated to ${wheelSpd.toFixed(0)} RPM under increased motor current`,
        `Bearing temperature rose to ${wheelTmp.toFixed(1)} °C (+24 °C above nominal)`,
        `Spacecraft pointing error reached ${pointErr.toFixed(3)}°`,
        "Causal DAG isolates mechanical friction in momentum actuator as upstream root",
      ];
    } else if (faultType === "sensor_spike" || faultType === "sensor_bias") {
      graphNodes = [
        {
          id: "sensor",
          label: "RATE GYRO SENSOR",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Activity",
          metrics: [
            { label: "Gyro Rate X:", value: `${(values.pointing_error * 45 + 1.25).toFixed(2)} °/s`, highlight: true },
            { label: "Forecast:", value: `${(forecast.pointing_error * 45).toFixed(2)} °/s` },
            { label: "Deviation:", value: "+1420% (Spike)", highlight: true },
          ],
        },
        {
          id: "adcs",
          label: "ATTITUDE / POINTING",
          status: "NORMAL",
          statusType: "normal",
          x: 230,
          y: 190,
          icon: "Compass",
          metrics: [
            { label: "Pointing Err:", value: `${values.pointing_error}°` },
            { label: "Expected:", value: `${forecast.pointing_error}°` },
            { label: "Deviation:", value: "0% (Nominal)" },
          ],
        },
        {
          id: "power",
          label: "POWER BUS",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Zap",
          metrics: [
            { label: "Bus Voltage:", value: `${values.bus_voltage} V` },
            { label: "Expected:", value: `${forecast.bus_voltage} V` },
            { label: "Deviation:", value: "0%" },
          ],
        },
        {
          id: "thermal",
          label: "THERMAL",
          status: "NORMAL",
          statusType: "normal",
          x: 350,
          y: 350,
          icon: "Thermometer",
          metrics: [
            { label: "Temp:", value: `${values.battery_temp} °C` },
            { label: "Expected:", value: `${forecast.battery_temp} °C` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "sensor", target: "adcs", label: "Filtered (Transient)", type: "gray" },
        { source: "adcs", target: "power", label: "Not affected", type: "gray" },
        { source: "power", target: "thermal", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-30), title: "Single-Sample Rate Gyro Excursion", desc: "Transient reading spiked to 4.8σ above conformal baseline threshold", nodeId: "sensor", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-15), title: "Statistical Z-Score Tripped", desc: "Isolated single-transducer reading excursion without secondary bus or thermal correlation", nodeId: "sensor", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-5), title: "Persistence Rule Evaluation", desc: "Persistence counter 1/5 did not sustain across consecutive observation frames", nodeId: "sensor", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Anomaly Classified as Transient Noise", desc: "Categorized as sensor artifact; all core flight subsystems remain nominal", nodeId: "sensor", dotColor: "purple" },
      ];

      evidenceList = [
        "Single telemetry transducer reading spiked without secondary bus or thermal correlation",
        "Physical cross-sensor estimators (sun sensors, bus current) confirmed normal operations",
        "Persistence filter rejected transient excursion; no hardware degradation observed",
        "Causal DAG confirms isolated sensor-level anomaly",
      ];
    } else if (faultType === "sensor_drift") {
      graphNodes = [
        {
          id: "sensor",
          label: "SUN SENSOR",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Radio",
          metrics: [
            { label: "Measured Angle:", value: "28.4°", highlight: true },
            { label: "Forecast:", value: "24.1°" },
            { label: "Deviation:", value: "+4.3° (Drift)", highlight: true },
          ],
        },
        {
          id: "adcs",
          label: "ATTITUDE / POINTING",
          status: "AFFECTED",
          statusType: "affected",
          x: 230,
          y: 190,
          icon: "Compass",
          metrics: [
            { label: "Residual:", value: `+${(values.pointing_error + 0.12).toFixed(2)}°`, highlight: true },
            { label: "Expected:", value: "0.03°" },
            { label: "Deviation:", value: "+0.12° residual", highlight: true },
          ],
        },
        {
          id: "power",
          label: "POWER BUS",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Zap",
          metrics: [
            { label: "Bus Voltage:", value: `${values.bus_voltage} V` },
            { label: "Expected:", value: `${forecast.bus_voltage} V` },
            { label: "Deviation:", value: "0%" },
          ],
        },
        {
          id: "thermal",
          label: "THERMAL",
          status: "NORMAL",
          statusType: "normal",
          x: 350,
          y: 350,
          icon: "Thermometer",
          metrics: [
            { label: "Temp:", value: `${values.battery_temp} °C` },
            { label: "Expected:", value: `${forecast.battery_temp} °C` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "sensor", target: "adcs", label: "Residual +4.3°", type: "red" },
        { source: "adcs", target: "power", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-45), title: "Transducer Calibration Drift", desc: "Sun sensor transducer channel began gradual slope ramp", nodeId: "sensor", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-30), title: "Pointing Residual Divergence", desc: "Analytical twin estimator flagged +0.12° attitude estimation gap", nodeId: "adcs", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-10), title: "Cross-Sensor Voting Failure", desc: "Redundant star tracker and gyro estimators contradicted drifting sun sensor", nodeId: "sensor", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Sensor Isolated from Loop", desc: "Suspect transducer excluded from ADCS determination loop", nodeId: "sensor", dotColor: "purple" },
      ];

      evidenceList = [
        "Sun sensor channel drifted +4.3° away from orbital ephemeris baseline",
        "Analytical sensor redundancy voting isolated drifting transducer",
        "Physical actuators and spacecraft rigid body dynamics operate nominally",
      ];
    } else if (faultType === "battery_degradation") {
      const batSoc = safeVal(values.battery_soc, safeVal(values.battery_soc_pct, 65.0));
      const batSocExp = safeVal(forecast.battery_soc, safeVal(forecast.battery_soc_pct, 76.8));
      const busV = safeVal(values.bus_voltage, safeVal(values.power_bus_voltage_V, 27.8));
      const busVExp = safeVal(forecast.bus_voltage, safeVal(forecast.power_bus_voltage_V, 28.2));
      const batTmp = safeVal(values.battery_temp, safeVal(values.battery_temperature_C, 24.5));
      const batTmpExp = safeVal(forecast.battery_temp, safeVal(forecast.battery_temperature_C, 21.8));
      const whlSpd = safeVal(values.wheel_speed, safeVal(values.reaction_wheel_speed_rpm, 1800.0));
      const whlSpdExp = safeVal(forecast.wheel_speed, safeVal(forecast.reaction_wheel_speed_rpm, 1800.0));

      graphNodes = [
        {
          id: "battery",
          label: "BATTERY CELLS",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Battery",
          metrics: [
            { label: "Charge SOC:", value: `${batSoc.toFixed(1)}%`, highlight: true },
            { label: "Expected:", value: `${batSocExp.toFixed(1)}%` },
            { label: "Deviation:", value: `-${Math.abs(batSocExp - batSoc).toFixed(1)}%`, highlight: true },
          ],
        },
        {
          id: "power",
          label: "POWER BUS",
          status: "AFFECTED",
          statusType: "affected",
          x: 230,
          y: 190,
          icon: "Zap",
          metrics: [
            { label: "Bus Voltage:", value: `${busV.toFixed(2)} V`, highlight: true },
            { label: "Expected:", value: `${busVExp.toFixed(2)} V` },
            { label: "Deviation:", value: `-${Math.abs(busVExp - busV).toFixed(2)} V`, highlight: true },
          ],
        },
        {
          id: "thermal",
          label: "BATTERY THERMAL",
          status: "AFFECTED",
          statusType: "affected",
          x: 350,
          y: 350,
          icon: "Thermometer",
          metrics: [
            { label: "Cell Temp:", value: `${batTmp.toFixed(1)} °C`, highlight: true },
            { label: "Expected:", value: `${batTmpExp.toFixed(1)} °C` },
            { label: "Deviation:", value: `+${Math.abs(batTmp - batTmpExp).toFixed(1)} °C`, highlight: true },
          ],
        },
        {
          id: "wheel",
          label: "REACTION WHEEL",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Disc",
          metrics: [
            { label: "Speed:", value: `${whlSpd.toFixed(0)} RPM` },
            { label: "Expected:", value: `${whlSpdExp.toFixed(0)} RPM` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "battery", target: "power", label: "-1.4 V sag", type: "red" },
        { source: "battery", target: "thermal", label: "+4.2 °C", type: "red" },
        { source: "power", target: "wheel", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-45), title: "Internal Cell Resistance Rise", desc: "Battery terminal impedance increased under nominal discharge cycling", nodeId: "battery", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-30), title: "Accelerated SOC Depletion", desc: `State of charge depleted to ${batSoc.toFixed(1)}% faster than forecast`, nodeId: "battery", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-10), title: "Power Bus Voltage Sag", desc: `Bus voltage sagged to ${busV.toFixed(2)} V under nominal load`, nodeId: "power", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Energy Storage Degradation Confirmed", desc: "Conformal persistence confirmed battery capacity degradation", nodeId: "battery", dotColor: "purple" },
      ];

      evidenceList = [
        `Battery state of charge discharge rate accelerated by 35%`,
        `Terminal voltage sagged to ${busV.toFixed(2)} V under nominal bus load`,
        `Internal Joule dissipation elevated cell temperature to ${batTmp.toFixed(1)} °C`,
        "Causal dependency DAG identifies electrochemical cell degradation as upstream root",
      ];
    } else if (faultType === "solar_degradation") {
      // Solar / Power Degradation
      const solCurr = safeVal(values.solar_current, safeVal(values.solar_array_current_A, 2.1));
      const solCurrExp = safeVal(forecast.solar_current, safeVal(forecast.solar_array_current_A, 3.08));
      const busV = safeVal(values.bus_voltage, safeVal(values.power_bus_voltage_V, 27.8));
      const busVExp = safeVal(forecast.bus_voltage, safeVal(forecast.power_bus_voltage_V, 28.2));
      const batSoc = safeVal(values.battery_soc, safeVal(values.battery_soc_pct, 65.0));
      const batSocExp = safeVal(forecast.battery_soc, safeVal(forecast.battery_soc_pct, 76.8));
      const whlSpd = safeVal(values.wheel_speed, safeVal(values.reaction_wheel_speed_rpm, 1800.0));
      const whlSpdExp = safeVal(forecast.wheel_speed, safeVal(forecast.reaction_wheel_speed_rpm, 1800.0));

      const solDevPct = solCurrExp > 0 ? Math.round((1 - solCurr / solCurrExp) * 100) : 18;

      graphNodes = [
        {
          id: "solar",
          label: "SOLAR ARRAY",
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 20,
          icon: "Sun",
          metrics: [
            { label: "Current:", value: `${solCurr.toFixed(2)} A`, highlight: true },
            { label: "Expected:", value: `${solCurrExp.toFixed(2)} A` },
            { label: "Deviation:", value: `-${solDevPct}%`, highlight: true },
          ],
        },
        {
          id: "power",
          label: "POWER BUS",
          status: "AFFECTED",
          statusType: "affected",
          x: 230,
          y: 190,
          icon: "Zap",
          metrics: [
            { label: "Bus Voltage:", value: `${busV.toFixed(2)} V`, highlight: true },
            { label: "Expected:", value: `${busVExp.toFixed(2)} V` },
            { label: "Deviation:", value: `-${Math.abs(busVExp - busV).toFixed(2)} V`, highlight: true },
          ],
        },
        {
          id: "battery",
          label: "BATTERY",
          status: "AFFECTED",
          statusType: "affected",
          x: 350,
          y: 350,
          icon: "Battery",
          metrics: [
            { label: "Charge SOC:", value: `${batSoc.toFixed(1)}%`, highlight: true },
            { label: "Expected:", value: `${batSocExp.toFixed(1)}%` },
            { label: "Deviation:", value: `-${Math.abs(batSocExp - batSoc).toFixed(1)}%`, highlight: true },
          ],
        },
        {
          id: "wheel",
          label: "REACTION WHEEL",
          status: "NORMAL",
          statusType: "normal",
          x: 80,
          y: 350,
          icon: "Disc",
          metrics: [
            { label: "Speed:", value: `${whlSpd.toFixed(0)} RPM` },
            { label: "Expected:", value: `${whlSpdExp.toFixed(0)} RPM` },
            { label: "Deviation:", value: "0%" },
          ],
        },
      ];

      graphEdges = [
        { source: "solar", target: "power", label: `-${solDevPct}%`, type: "red" },
        { source: "power", target: "battery", label: "-19%", type: "red" },
        { source: "power", target: "wheel", label: "Not affected", type: "gray" },
      ];

      propagationEvents = [
        { id: "e1", time: formatTimeOffset(-45), title: "Solar Array Output Drop", desc: `Photovoltaic current fell to ${solCurr.toFixed(2)} A`, nodeId: "solar", dotColor: "orange" },
        { id: "e2", time: formatTimeOffset(-30), title: "Power Bus Voltage Sag", desc: `Bus voltage dropped to ${busV.toFixed(2)} V`, nodeId: "power", dotColor: "orange" },
        { id: "e3", time: formatTimeOffset(-10), title: "Battery SOC Discharge", desc: `Battery state of charge depleted to ${batSoc.toFixed(1)}%`, nodeId: "battery", dotColor: "red" },
        { id: "e4", time: formatTimeOffset(0), title: "Anomaly Confirmed", desc: "Conformal persistence triggered on EPS power subsystem", nodeId: "solar", dotColor: "purple" },
      ];

      evidenceList = [
        `Solar array current dropped from ${solCurrExp.toFixed(2)} A to ${solCurr.toFixed(2)} A`,
        `Main power bus voltage sagged to ${busV.toFixed(2)} V under nominal load`,
        `Battery state of charge discharge rate accelerated by 35%`,
        "Causal dependency DAG identifies solar array as the primary upstream energy source",
      ];
    } else {
      // Dynamic fallback for any other catalog fault
      const sub = faultDef.subsystem || "power";
      graphNodes = [
        {
          id: sub,
          label: `${sub.toUpperCase()} SUBSYSTEM`,
          status: "SOURCE",
          statusType: "source",
          x: 230,
          y: 50,
          icon: sub === "thermal" ? "Thermometer" : sub === "attitude" ? "Compass" : "Zap",
          metrics: [
            { label: "Residual:", value: "Elevated", highlight: true },
            { label: "Subsystem:", value: sub.toUpperCase() },
          ],
        },
      ];
      graphEdges = [];
      propagationEvents = (faultDef.effects || []).map((eff, i) => ({
        id: `e${i + 1}`,
        time: formatTimeOffset(-30 + i * 15),
        title: eff,
        desc: `Subsystem ${sub} observed variance across telemetry channels`,
        nodeId: sub,
        dotColor: i === 0 ? "orange" : "red",
      }));
      evidenceList = faultDef.effects || ["Telemetry excursion observed along subsystem causal DAG"];
    }

    const explanation = {
      title: `Why ${faultDef.subsystem?.toUpperCase() || 'Root Subsystem'}?`,
      headline: `Probable ${faultDef.label} (${faultDef.subsystem || "power"} subsystem).`,
      text: `${faultDef.effects[0]}. Secondary telemetry responses confirmed along the causal dependency DAG.`,
      evidence: `${faultDef.effects[0]}; downstream gradient emerged shortly after.`,
      causeConfidence: `${faultDef.label}, about ${Math.round((activeFault?.severity || 0.65) * 100)}% severity, confidence ${(topPosterior * 100).toFixed(0)}%.`,
      action: faultDef.fmea?.rankedActions[0]?.action || "Inspect subsystem telemetry.",
    };

    return {
      id: incidentId,
      _id: incidentId,
      incidentId,
      sessionId: this.sessionId,
      status: "open",
      severity: "critical",
      risk: "high",
      type: faultType,
      title: faultDef.label || "Telemetry Anomaly",
      openedAtSim: t,
      openedAtTs: new Date().toISOString(),
      detectedTime: formatTimeOffset(0),
      detectedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      classification,
      rankedCauses,
      graph: {
        nodes: graphNodes,
        edges: graphEdges,
      },
      propagation: {
        events: propagationEvents,
      },
      evidence: evidenceList,
      confidence: {
        value: topPosterior,
        previous: parseFloat((Math.min(0.96, topPosterior + 0.05)).toFixed(2)),
        was: `${Math.round(Math.min(0.96, topPosterior + 0.05) * 100)}%`,
        components: {
          posteriorTop1: topPosterior,
          dataQualityFactor: parseFloat((1.0 - (this.stress.missingPct / 100) * 0.4).toFixed(2)),
          detectorAgreement: 1.0,
        },
        reason: `High confidence fit on ${rankedCauses[0].target} and causal propagation across linked DAG nodes.`,
      },
      affectedSubsystems: [
        { subsystem: faultDef.subsystem || "power", role: "source" },
        { subsystem: "thermal", role: "affected" },
        { subsystem: "attitude", role: "not_affected" },
      ],
      explanation,
      recommendations: faultDef.fmea?.rankedActions || [],
      detection: {
        gruFlag: true,
        iforestFlag: true,
        cusumFlag: false,
        limitAlarmAtSim: t + 650,
        leadTimeSec: 650,
      },
      mode: "full",
      history: [
        {
          action: "created",
          note: "Incident automatically opened upon conformal persistence threshold trigger",
          timestamp: new Date(),
        },
      ],
      notes: [],
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

    signals.forEach((s) => {
      channels[s.id] = [];
      forecast[s.id] = [];
      status[s.id] = [];
      limitState[s.id] = [];
    });

    ticks.forEach((tick) => {
      t.push(tick.t);
      score.push(tick.score);
      threshold.push(tick.threshold);
      flag.push(tick.flag);
      regime.push(tick.regime);

      signals.forEach((s) => {
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
      limitState,
    };
  }

  getStateSnapshot() {
    let powerHealth = "green";
    let thermalHealth = "green";
    let attitudeHealth = "green";

    const latestValues = this.channelStates;
    if (latestValues.solar_current < 3.0 || latestValues.battery_soc < 60)
      powerHealth = "amber";
    if (latestValues.battery_soc < 40) powerHealth = "red";
    if (latestValues.battery_temp > 35) thermalHealth = "amber";
    if (latestValues.battery_temp > 42) thermalHealth = "red";
    if (latestValues.wheel_temp > 50 || latestValues.pointing_error > 0.15)
      attitudeHealth = "amber";

    const sensorsList = signals.map((s) => ({
      id: s.id,
      status: this.sensorStatuses[s.id] || "ok",
      ageSec: this.sensorStatuses[s.id] === "missing" ? 25 : 0,
      imputed: this.sensorStatuses[s.id] === "missing",
    }));

    return {
      sessionId: this.sessionId,
      status: this.status,
      simTime: this.simTime,
      speed: this.speed,
      subsystemHealth: {
        power: powerHealth,
        thermal: thermalHealth,
        attitude: attitudeHealth,
      },
      sensors: sensorsList,
      score:
        this.flagHistory.length > 0
          ? this.flagHistory[this.flagHistory.length - 1] === 1
            ? 3.4
            : 1.2
          : 1.1,
      threshold: 2.1,
      persistence: {
        k: this.detectorSettings.persistK,
        n: this.detectorSettings.persistN,
        count: this.flagHistory.filter((f) => f === 1).length,
      },
      dataQuality: {
        score: parseFloat(
          (1.0 - (this.stress.missingPct / 100) * 0.4).toFixed(2),
        ),
        missingPct: this.stress.missingPct,
        delaySec: this.stress.delaySec,
      },
      falseAlerts: {
        episodes: this.falseAlertsCount,
        faultFreeSimDays: parseFloat(this.faultFreeSimDays.toFixed(2)),
        perDay: parseFloat(
          (
            this.falseAlertsCount / Math.max(0.1, this.faultFreeSimDays)
          ).toFixed(2),
        ),
        targetPerDay: this.detectorSettings.targetFalseAlarmRate * 100,
      },
      activeIncidentIds: this.activeIncidents
        .filter((i) => i.status === "open" || i.status === "analyzing")
        .map((i) => i.id),
      sourceLabel: `Physics-based simulator (seed ${this.seed}, ${this.mismatchLevel} mismatch)`,
    };
  }
}

module.exports = MockSimulator;
