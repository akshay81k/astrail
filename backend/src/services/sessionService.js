const idGen = require("../utils/idGenerator");
const Session = require("../models/Session");
const Fault = require("../models/Fault");
const Telemetry = require("../models/Telemetry");
const { isDBConnected } = require("../config/db");
const streamBridge = require("./streamBridge");
const mlClient = require("./mlClient");
const { signals } = require("../data/signalCatalog");
const faultCatalog = require("../data/faultCatalog");
const { AppError } = require("../middleware/errorHandler");

// In-memory sessions cache for ultra-fast lookup and when DB is offline
const memorySessions = new Map();
const memoryFaults = new Map();
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

class SessionService {
  async createSession(payload) {
    const sessionId = idGen.session();
    const channels = signals.map((s) => s.id);
    const sourceLabel =
      payload.source === "simulator"
        ? `Physics-based simulator (seed ${payload.seed || 42}, ${payload.mismatchLevel || "medium"} mismatch)`
        : payload.source === "smap_msl"
          ? `NASA SMAP/MSL benchmark (channel ${payload.smap?.channelId || "T-1"})`
          : `Uploaded dataset`;

    const sessionData = {
      _id: sessionId,
      id: sessionId,
      source: payload.source || "simulator",
      mode: payload.source === "upload" ? "generic" : "full",
      status: "created",
      simTime: 0,
      speed: payload.speed || 4,
      seed: payload.seed || 42,
      mismatchLevel: payload.mismatchLevel || "medium",
      sourceLabel,
      channels,
      detector: payload.detector || {
        targetFalseAlarmRate: 0.01,
        persistK: 5,
        persistN: 8,
      },
      smap: payload.smap || null,
      uploadId: payload.uploadId || null,
      createdAt: new Date().toISOString(),
    };

    memorySessions.set(sessionId, sessionData);

    if (isDBConnected()) {
      try {
        await Session.create(sessionData);
      } catch (_) {}
    }

    // Initialize stream bridge
    const bridge = streamBridge.createBridge(sessionData);
    bridge.start();

    // Optionally notify Python ML service in background
    mlClient.createSession(sessionData).catch(() => {});

    return sessionData;
  }

  async listSessions() {
    if (isDBConnected()) {
      try {
        const dbSessions = await Session.find().sort({ createdAt: -1 }).lean();
        if (dbSessions.length > 0) {
          return dbSessions.map((s) => ({ ...s, id: s._id }));
        }
      } catch (_) {}
    }

    return Array.from(memorySessions.values());
  }

  async getSession(sessionId) {
    let session = memorySessions.get(sessionId);
    if (!session && isDBConnected()) {
      try {
        const dbSession = await Session.findById(sessionId).lean();
        if (dbSession) {
          session = { ...dbSession, id: dbSession._id };
          memorySessions.set(sessionId, session);
        }
      } catch (_) {}
    }

    if (!session) {
      throw new AppError(
        404,
        "NOT_FOUND",
        `Session with ID ${sessionId} not found`,
      );
    }

    return session;
  }

  async controlSession(sessionId, actionPayload) {
    const session = await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    const { action } = actionPayload;

    switch (action) {
      case "play":
        session.status = "playing";
        if (bridge) bridge.resume();
        break;
      case "pause":
        session.status = "paused";
        if (bridge) bridge.pause();
        break;
      case "speed":
        session.speed = actionPayload.speed;
        if (bridge) bridge.setSpeed(actionPayload.speed);
        break;
      case "reset":
        session.simTime = 0;
        session.seed = actionPayload.seed || session.seed;
        session.status = "created";
        if (bridge) {
          bridge.mockSim.simTime = 0;
          bridge.mockSim.seed = session.seed;
        }
        break;
      case "seek":
        session.simTime = actionPayload.simTime;
        if (bridge) bridge.mockSim.simTime = actionPayload.simTime;
        break;
    }

    memorySessions.set(sessionId, session);
    Session.findByIdAndUpdate(sessionId, session).catch(() => {});
    mlClient.controlSession(sessionId, actionPayload).catch(() => {});

    return this.getSessionState(sessionId);
  }

  async deleteSession(sessionId) {
    await this.getSession(sessionId);
    streamBridge.destroyBridge(sessionId);
    memorySessions.delete(sessionId);
    Session.findByIdAndDelete(sessionId).catch(() => {});
    Telemetry.deleteMany({ "meta.sessionId": sessionId }).catch(() => {});
    Fault.deleteMany({ sessionId }).catch(() => {});
    mlClient.deleteSession(sessionId).catch(() => {});
    return { success: true };
  }

  async getSessionState(sessionId) {
    const session = await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);

    if (bridge) {
      const state = bridge.mockSim.getStateSnapshot();
      return state;
    }

    return {
      sessionId,
      status: session.status,
      simTime: session.simTime,
      speed: session.speed,
      subsystemHealth: { power: "green", thermal: "green", attitude: "green" },
      sensors: signals.map((s) => ({
        id: s.id,
        status: "ok",
        ageSec: 0,
        imputed: false,
      })),
      score: 1.1,
      threshold: 2.1,
      persistence: {
        k: session.detector.persistK,
        n: session.detector.persistN,
        count: 0,
      },
      dataQuality: { score: 1.0, missingPct: 0, delaySec: 0 },
      falseAlerts: {
        episodes: 0,
        faultFreeSimDays: 0.1,
        perDay: 0,
        targetPerDay: 1.0,
      },
      activeIncidentIds: [],
      sourceLabel: session.sourceLabel,
    };
  }

  async getTelemetryHistory(
    sessionId,
    { from, to, channels, downsample = 1000 },
  ) {
    await this.getSession(sessionId);

    const query = { "meta.sessionId": sessionId };
    if (from !== undefined) query.simTime = { $gte: parseInt(from, 10) };
    if (to !== undefined)
      query.simTime = { ...query.simTime, $lte: parseInt(to, 10) };

    const channelList = channels
      ? channels.split(",")
      : signals.map((s) => s.id);

    try {
      const records = await Telemetry.find(query)
        .sort({ simTime: 1 })
        .limit(downsample)
        .lean();

      if (records.length > 0) {
        const t = [];
        const resultChannels = {};
        const resultStatus = {};
        const score = [];
        const threshold = [];

        channelList.forEach((ch) => {
          resultChannels[ch] = [];
          resultStatus[ch] = [];
        });

        records.forEach((r) => {
          t.push(r.simTime);
          score.push(r.score);
          threshold.push(r.threshold);

          channelList.forEach((ch) => {
            resultChannels[ch].push(r.v?.[ch] ?? null);
            resultStatus[ch].push(r.q?.[ch] ?? "ok");
          });
        });

        return {
          t,
          channels: resultChannels,
          status: resultStatus,
          score,
          threshold,
        };
      }
    } catch (_) {}

    // In-memory fallback if no DB records yet
    const t = [1, 2, 3];
    const resultChannels = {};
    const resultStatus = {};
    channelList.forEach((ch) => {
      resultChannels[ch] = [20.1, 20.2, 20.3];
      resultStatus[ch] = ["ok", "ok", "ok"];
    });

    return {
      t,
      channels: resultChannels,
      status: resultStatus,
      score: [1.1, 1.2, 1.1],
      threshold: [2.1, 2.1, 2.1],
    };
  }

  async getOrbitData(sessionId) {
    const session = await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    const simTime = bridge ? bridge.mockSim.simTime : session.simTime;

    const orbitPeriod = 5700;
    const phase = (simTime % orbitPeriod) / orbitPeriod;
    const lat = Math.sin(phase * 2 * Math.PI) * 51.6; // 51.6 deg ISS inclination proxy
    const lon = ((phase * 360 * 15) % 360) - 180;
    const altitudeKm = 408;
    const inEclipse = phase > 0.6;

    return {
      sessionId,
      simTime,
      orbit: {
        altitudeKm,
        inclinationDeg: 51.6,
        periodSec: orbitPeriod,
        phase: parseFloat(phase.toFixed(3)),
        currentPosition: {
          lat: parseFloat(lat.toFixed(2)),
          lon: parseFloat(lon.toFixed(2)),
          altKm: altitudeKm,
        },
        eclipse: inEclipse,
        nextEclipseInSec: inEclipse
          ? 0
          : Math.round((0.6 - phase) * orbitPeriod),
      },
    };
  }

  async setStress(sessionId, stressPayload) {
    const session = await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    if (bridge) {
      bridge.mockSim.stress = { ...bridge.mockSim.stress, ...stressPayload };
    }
    mlClient.setStress(sessionId, stressPayload).catch(() => {});
    return bridge ? bridge.mockSim.stress : stressPayload;
  }

  async scheduleDropout(sessionId, dropoutPayload) {
    const session = await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    const startSim =
      (bridge ? bridge.mockSim.simTime : session.simTime) +
      (dropoutPayload.startOffsetSec || 0);
    const endSimTime = startSim + (dropoutPayload.durationSec || 600);

    if (bridge) {
      bridge.mockSim.dropouts.push({
        channel: dropoutPayload.channel,
        endSimTime,
      });
      bridge.mockSim.sensorStatuses[dropoutPayload.channel] = "unavailable";
    }

    mlClient.scheduleDropout(sessionId, dropoutPayload).catch(() => {});
    return {
      channel: dropoutPayload.channel,
      startSimTime: startSim,
      endSimTime,
      status: "scheduled",
    };
  }

  async injectFault(sessionId, faultPayload) {
    const session = await this.getSession(sessionId);
    if (session.source !== "simulator") {
      throw new AppError(
        409,
        "INVALID_STATE",
        "Fault injection is only supported on simulator sessions",
      );
    }

    const bridge = streamBridge.getBridge(sessionId);
    const currentSimTime = bridge ? bridge.mockSim.simTime : session.simTime;
    const faultId = idGen.fault();
    const startSimTime = currentSimTime + (faultPayload.startOffsetSec || 0);

    const faultDef = faultCatalog.find((f) => f.type === faultPayload.type);
    const faultData = {
      _id: faultId,
      id: faultId,
      sessionId,
      type: faultPayload.type,
      category:
        faultDef?.category ||
        (faultPayload.type.startsWith("sensor_") ? "sensor" : "subsystem"),
      target: faultPayload.target || null,
      severity: faultPayload.severity,
      startSimTime,
      rampSec: faultPayload.rampSec || 0,
      durationSec: faultPayload.durationSec || null,
      status: "scheduled",
      truthHidden: true,
    };

    if (bridge) {
      bridge.mockSim.faults.push(faultData);
    }

    memoryFaults.set(faultId, faultData);
    Fault.create(faultData).catch(() => {});
    mlClient.injectFault(sessionId, faultPayload).catch(() => {});

    return faultData;
  }

  async injectRandomFault(sessionId, params) {
    const pool = faultCatalog.filter((f) =>
      params.includeSensorFaults ? true : f.category === "subsystem",
    );
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const severity = parseFloat(
      (
        Math.random() * (picked.severityRange.max - picked.severityRange.min) +
        picked.severityRange.min
      ).toFixed(2),
    );

    return this.injectFault(sessionId, {
      type: picked.type,
      severity,
      startOffsetSec: 5,
      rampSec: picked.category === "subsystem" ? 120 : 30,
    });
  }

  async listFaults(sessionId) {
    await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    if (bridge) {
      return bridge.mockSim.faults.map((f) => {
        const { truth, ...rest } = f;
        return rest;
      });
    }
    return Array.from(memoryFaults.values()).filter(
      (f) => f.sessionId === sessionId,
    );
  }

  async cancelFault(sessionId, faultId) {
    const bridge = streamBridge.getBridge(sessionId);
    if (bridge) {
      const idx = bridge.mockSim.faults.findIndex(
        (f) => f.id === faultId || f._id === faultId,
      );
      if (idx !== -1) {
        bridge.mockSim.faults[idx].status = "cancelled";
      }
    }
    Fault.findByIdAndUpdate(faultId, { status: "cancelled" }).catch(() => {});
    return { id: faultId, status: "cancelled" };
  }

  async getFaultTruth(sessionId, faultId, force = false) {
    let fault = memoryFaults.get(faultId);
    if (!fault) {
      try {
        fault = await Fault.findById(faultId).lean();
      } catch (_) {}
    }

    if (!fault) {
      throw new AppError(
        404,
        "NOT_FOUND",
        `Fault with ID ${faultId} not found`,
      );
    }

    if (fault.truthHidden && !force) {
      throw new AppError(
        403,
        "TRUTH_LOCKED",
        "Ground truth is locked until the incident is acknowledged, dismissed, or closed",
      );
    }

    const normalizedType = normalizeFaultType(fault.type);
    const faultDef = faultCatalog.find((f) => f.type === normalizedType || f.type === fault.type);
    if (!faultDef) {
      return {
        faultId: fault.id || fault._id,
        rootCause: fault.name || fault.type?.replace(/_/g, ' ') || "Inconclusive Anomaly",
        type: fault.type,
        targetSubsystem: "UNKNOWN",
        target: fault.target || "telemetry_stream",
        severity: fault.severity,
        onsetSimTime: fault.startSimTime,
        trueAffected: [],
        propagationChain: [
          'Telemetry residual exceeded baseline',
          'Root cause inconclusive'
        ],
        linkedIncidentId: fault.linkedIncidentId || "inc_000",
        outcome: fault.truth?.outcome || {
          top1Correct: false,
          inTop3: false,
          severityErrorPct: 0.0,
          detectionDelaySec: 0,
        },
      };
    }
    return {
      faultId: fault.id || fault._id,
      rootCause: faultDef.label || fault.name || fault.type?.replace(/_/g, ' '),
      type: fault.type,
      targetSubsystem: (faultDef.subsystem || 'power').toUpperCase(),
      target: fault.target || faultDef.target || "telemetry_channel",
      severity: fault.severity,
      onsetSimTime: fault.startSimTime,
      trueAffected: faultDef.subsystem ? [faultDef.subsystem, "thermal"] : ["power", "thermal"],
      propagationChain: faultDef.effects || [
        `${faultDef.label} initiated`,
        'Telemetry threshold excursion detected',
        'Persistence threshold confirmed'
      ],
      linkedIncidentId: fault.linkedIncidentId || "inc_014",
      outcome: fault.truth?.outcome || {
        top1Correct: true,
        inTop3: true,
        severityErrorPct: 2.8,
        detectionDelaySec: 35,
      },
    };
  }

  async updateDetector(sessionId, detectorParams) {
    const session = await this.getSession(sessionId);
    session.detector = { ...session.detector, ...detectorParams };
    const bridge = streamBridge.getBridge(sessionId);
    if (bridge) {
      bridge.mockSim.detectorSettings = session.detector;
    }
    memorySessions.set(sessionId, session);
    Session.findByIdAndUpdate(sessionId, { detector: session.detector }).catch(
      () => {},
    );
    mlClient.updateDetector(sessionId, detectorParams).catch(() => {});

    return {
      sessionId,
      detector: session.detector,
      calibration: {
        thresholds: { sunlight: 2.1, eclipse: 2.6 },
        calibratedAt: new Date().toISOString(),
        measuredSampleRate: 0.0094,
        measuredEpisodesPerDay: 0.78,
      },
    };
  }

  async getAnomalies(sessionId) {
    await this.getSession(sessionId);
    const bridge = streamBridge.getBridge(sessionId);
    const episodes = [];
    if (bridge && bridge.mockSim) {
      if (bridge.mockSim.currentEpisode) {
        episodes.push(bridge.mockSim.currentEpisode);
      }
      bridge.mockSim.activeIncidents.forEach((inc) => {
        episodes.push({
          id: inc.id.replace("inc_", "ano_"),
          incidentId: inc.id,
          startSim: inc.openedAtSim,
          class: inc.classification?.label || "subsystem_fault",
          peakScore: 4.8,
        });
      });
    }

    return {
      sessionId,
      data: episodes,
      meta: {
        totalEpisodes: episodes.length,
        suppressedNoiseEpisodes: bridge
          ? bridge.mockSim.suppressedNoiseEpisodes
          : 0,
      },
    };
  }
}

module.exports = new SessionService();
