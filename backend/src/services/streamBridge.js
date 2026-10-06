const WebSocket = require("ws");
const config = require("../config/env");
const logger = require("../utils/logger");
const liveHub = require("../sockets/liveHub");
const MockSimulator = require("./mockSimulator");
const Telemetry = require("../models/Telemetry");
const Incident = require("../models/Incident");
const { convertKeysToCamel } = require("../utils/caseConverter");

class SessionStreamBridge {
  constructor(session) {
    this.sessionId = session.id || session._id;
    this.session = session;
    this.speed = session.speed || 4;
    this.status = session.status || "created";

    this.ws = null;
    this.wsConnected = false;
    this.mockSim = new MockSimulator(session);
    this.timer = null;
    this.telemetryBuffer = [];
    this.persistTimer = null;

    this.lastStateEmit = 0;
  }

  start() {
    this.status = "playing";
    this.mockSim.status = "playing";
    this._tryConnectWebSocket();

    // Start local loop (runs ticks based on speed and delivers 5 fps frames)
    this._startLocalStreamLoop();
  }

  pause() {
    this.status = "paused";
    this.mockSim.status = "paused";
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._emitState();
  }

  resume() {
    this.status = "playing";
    this.mockSim.status = "playing";
    this._startLocalStreamLoop();
    this._emitState();
  }

  setSpeed(newSpeed) {
    this.speed = newSpeed;
    this.mockSim.speed = newSpeed;
    if (this.status === "playing") {
      this._startLocalStreamLoop();
    }
    this._emitState();
  }

  stop() {
    this.status = "ended";
    this.mockSim.status = "ended";
    if (this.timer) clearInterval(this.timer);
    if (this.persistTimer) clearInterval(this.persistTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
    }
  }

  _tryConnectWebSocket() {
    const wsUrl = `${config.mlWsUrl}/${this.sessionId}`;
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        this.wsConnected = true;
        logger.info(
          `[StreamBridge] Upstream WS connected to Python ML for session ${this.sessionId}`,
        );
      });

      this.ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this._handleUpstreamMessage(parsed);
        } catch (e) {
          logger.warn(
            `[StreamBridge] Failed to parse upstream WS message: ${e.message}`,
          );
        }
      });

      this.ws.on("error", () => {
        this.wsConnected = false;
      });

      this.ws.on("close", () => {
        this.wsConnected = false;
      });
    } catch (e) {
      this.wsConnected = false;
    }
  }

  _startLocalStreamLoop() {
    if (this.timer) clearInterval(this.timer);

    // Dynamic interval based on speed: 1x = 1000ms, 2x = 500ms, 4x = 250ms
    const speedMult = Math.max(1, Math.min(60, Number(this.speed) || 1));
    const intervalMs = Math.max(50, Math.round(1000 / speedMult));

    this.timer = setInterval(() => {
      if (this.status !== "playing") return;

      // Always step telemetry simulator from CSV data
      const frame = this.mockSim.step(1);
      this._processAndEmitFrame(frame);
    }, intervalMs);

    // Telemetry persistence batch timer (every 2 seconds)
    if (!this.persistTimer) {
      this.persistTimer = setInterval(() => {
        this._flushTelemetryBuffer();
      }, 2000);
    }
  }

  _processAndEmitFrame(frame) {
    // 1. Forward frame strictly to Socket.IO session room (isolate from other sessions)
    liveHub.emitToSession(this.sessionId, "telemetry:frame", frame);

    // 2. Buffer for DB persistence
    if (frame.t && frame.t.length > 0) {
      for (let i = 0; i < frame.t.length; i++) {
        const v = {};
        const q = {};
        const fc = {};
        const ls = {};

        Object.keys(frame.channels).forEach((ch) => {
          v[ch] = frame.channels[ch][i];
          fc[ch] = frame.forecast?.[ch]?.[i];
          q[ch] = frame.status?.[ch]?.[i] || "ok";
          ls[ch] = frame.limitState?.[ch]?.[i] || "ok";
        });

        // Downsample DB persistence (1 point every 5 sim-seconds) to keep Atlas storage under 5 MB
        if (frame.t[i] % 5 === 0) {
          this.telemetryBuffer.push({
            ts: new Date(),
            meta: { sessionId: this.sessionId },
            simTime: frame.t[i],
            v,
            q,
            forecast: fc,
            score: frame.score[i],
            threshold: frame.threshold[i],
            flag: frame.flag[i],
            regime: frame.regime[i],
            limitState: ls,
          });
        }
      }
    }

    // 3. Check for new mock incidents created
    if (this.mockSim.activeIncidents.length > 0) {
      this.mockSim.activeIncidents.forEach((inc) => {
        if (!inc._emitted) {
          inc._emitted = true;
          const incidentStore = require("./incidentStore");
          incidentStore.addIncident(inc);
          const incPayload = {
            id: inc.id,
            _id: inc.id,
            incidentId: inc.id,
            sessionId: this.sessionId,
            severity: inc.severity,
            status: "open",
            openedAtSim: inc.openedAtSim,
            headline: inc.explanation?.headline || inc.title,
            title: inc.title || inc.explanation?.headline,
            description: inc.explanation?.evidence || inc.description,
            explanation: inc.explanation,
            classification: inc.classification,
            rankedCauses: inc.rankedCauses,
            confidence: inc.confidence,
            affectedSubsystems: inc.affectedSubsystems,
          };
          liveHub.emitToSession(this.sessionId, "incident:created", incPayload);
          liveHub.emitGlobal("incident:created", incPayload);
          liveHub.emitToSession(this.sessionId, "incident:updated", incPayload);
          liveHub.emitGlobal("incident:updated", incPayload);
        }
      });
    }

    // 4. Periodic state broadcast (every ~2 seconds)
    const now = Date.now();
    if (now - this.lastStateEmit > 2000) {
      this.lastStateEmit = now;
      this._emitState();
    }
  }

  _handleUpstreamMessage(msg) {
    const type = msg.type;
    const data = convertKeysToCamel(msg.data || msg);

    switch (type) {
      case "frame":
        liveHub.emitToSession(this.sessionId, "telemetry:frame", data);
        break;
      case "sensor_status":
        liveHub.emitToSession(this.sessionId, "sensor:status", data);
        break;
      case "incident":
        if (data.status === "analyzing" || data.status === "open") {
          liveHub.emitToSession(this.sessionId, "incident:created", data);
        }
        liveHub.emitToSession(this.sessionId, "incident:updated", data);
        Incident.findByIdAndUpdate(data.id, data, { upsert: true }).catch(
          () => {},
        );
        break;
      case "limit_alarm":
        liveHub.emitToSession(this.sessionId, "limit:alarm", data);
        break;
      case "false_alerts":
        liveHub.emitToSession(this.sessionId, "falsealerts:update", data);
        break;
      default:
        liveHub.emitToSession(this.sessionId, type, data);
    }
  }

  async _flushTelemetryBuffer() {
    if (this.telemetryBuffer.length === 0) return;
    const batch = [...this.telemetryBuffer];
    this.telemetryBuffer = [];

    try {
      await Telemetry.insertMany(batch, { ordered: false });
    } catch (_) {
      // Ignored if DB is in-memory or duplicate
    }
  }

  _emitState() {
    const state = this.mockSim.getStateSnapshot();
    liveHub.emitToSession(this.sessionId, "session:state", state);
  }
}

class StreamBridgeManager {
  constructor() {
    this.bridges = new Map();
  }

  createBridge(session) {
    const id = session.id || session._id;
    // Clean up any stale active bridge loops so only the active session runs
    for (const [existingId, oldBridge] of this.bridges.entries()) {
      oldBridge.stop();
      this.bridges.delete(existingId);
    }
    const bridge = new SessionStreamBridge(session);
    this.bridges.set(id, bridge);
    return bridge;
  }

  getBridge(sessionId) {
    return this.bridges.get(sessionId);
  }

  destroyBridge(sessionId) {
    const bridge = this.bridges.get(sessionId);
    if (bridge) {
      bridge.stop();
      this.bridges.delete(sessionId);
    }
  }
}

module.exports = new StreamBridgeManager();
module.exports = new StreamBridgeManager();
