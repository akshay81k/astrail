const WebSocket = require('ws');
const config = require('../config/env');
const logger = require('../utils/logger');
const liveHub = require('../sockets/liveHub');
const MockSimulator = require('./mockSimulator');
const Telemetry = require('../models/Telemetry');
const Incident = require('../models/Incident');
const { convertKeysToCamel } = require('../utils/caseConverter');

class SessionStreamBridge {
  constructor(session) {
    this.sessionId = session.id || session._id;
    this.session = session;
    this.speed = session.speed || 4;
    this.status = session.status || 'created';

    this.ws = null;
    this.wsConnected = false;
    this.mockSim = new MockSimulator(session);
    this.timer = null;
    this.telemetryBuffer = [];

    this.lastStateEmit = 0;
  }

  start() {
    this.status = 'playing';
    this.mockSim.status = 'playing';
    this._tryConnectWebSocket();

    // Start local loop (runs ticks based on speed and delivers 5 fps frames)
    this._startLocalStreamLoop();
  }

  pause() {
    this.status = 'paused';
    this.mockSim.status = 'paused';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._emitState();
  }

  resume() {
    this.status = 'playing';
    this.mockSim.status = 'playing';
    this._startLocalStreamLoop();
    this._emitState();
  }

  setSpeed(newSpeed) {
    this.speed = newSpeed;
    this.mockSim.speed = newSpeed;
    if (this.status === 'playing') {
      this._startLocalStreamLoop();
    }
    this._emitState();
  }

  stop() {
    this.status = 'ended';
    this.mockSim.status = 'ended';
    if (this.timer) clearInterval(this.timer);
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

      this.ws.on('open', () => {
        this.wsConnected = true;
        logger.info(`[StreamBridge] Upstream WS connected to Python ML for session ${this.sessionId}`);
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this._handleUpstreamMessage(parsed);
        } catch (e) {
          logger.warn(`[StreamBridge] Failed to parse upstream WS message: ${e.message}`);
        }
      });

      this.ws.on('error', () => {
        this.wsConnected = false;
      });

      this.ws.on('close', () => {
        this.wsConnected = false;
      });
    } catch (e) {
      this.wsConnected = false;
    }
  }

  _startLocalStreamLoop() {
    if (this.timer) clearInterval(this.timer);

    // Render frame 5 times a second (200ms interval)
    const intervalMs = 200;
    this.timer = setInterval(() => {
      if (this.status !== 'playing') return;

      // If upstream WS is active, Python produces frames; otherwise MockSimulator generates them
      if (!this.wsConnected) {
        // Compute how many simulated ticks occurred in this 200ms window based on speed
        // speed 1 = 1 tick / sec -> 0.2 ticks per 200ms
        // speed 5 = 1 tick per 200ms
        const ticksThisStep = Math.max(1, Math.round(this.speed * (intervalMs / 1000)));
        const frame = this.mockSim.step(ticksThisStep);

        this._processAndEmitFrame(frame);
      }
    }, intervalMs);
  }

  _processAndEmitFrame(frame) {
    // 1. Forward frame in real-time to Socket.IO room (no DB write)
    liveHub.emitToSession(this.sessionId, 'telemetry:frame', frame);

    // 2. Keep bounded in-memory history (last 180 points) for REST polling if needed
    if (frame.t && frame.t.length > 0) {
      for (let i = 0; i < frame.t.length; i++) {
        const v = {};
        Object.keys(frame.channels).forEach(ch => {
          v[ch] = frame.channels[ch][i];
        });
        this.telemetryBuffer.push({
          simTime: frame.t[i],
          channels: v,
          score: frame.score[i],
          threshold: frame.threshold[i],
          flag: frame.flag[i]
        });
      }
      if (this.telemetryBuffer.length > 180) {
        this.telemetryBuffer = this.telemetryBuffer.slice(this.telemetryBuffer.length - 180);
      }
    }

    // 3. Check for new mock incidents created
    if (this.mockSim.activeIncidents.length > 0) {
      this.mockSim.activeIncidents.forEach(inc => {
        if (!inc._emitted) {
          inc._emitted = true;
          const incidentStore = require('./incidentStore');
          incidentStore.addIncident(inc);
          liveHub.emitToSession(this.sessionId, 'incident:created', {
            incidentId: inc.id,
            sessionId: this.sessionId,
            severity: inc.severity,
            status: 'open',
            openedAtSim: inc.openedAtSim,
            headline: inc.explanation?.headline
          });
          liveHub.emitToSession(this.sessionId, 'incident:updated', inc);
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
      case 'frame':
        liveHub.emitToSession(this.sessionId, 'telemetry:frame', data);
        break;
      case 'sensor_status':
        liveHub.emitToSession(this.sessionId, 'sensor:status', data);
        break;
      case 'incident':
        if (data.status === 'analyzing' || data.status === 'open') {
          liveHub.emitToSession(this.sessionId, 'incident:created', data);
        }
        liveHub.emitToSession(this.sessionId, 'incident:updated', data);
        Incident.findByIdAndUpdate(data.id, data, { upsert: true }).catch(() => {});
        break;
      case 'limit_alarm':
        liveHub.emitToSession(this.sessionId, 'limit:alarm', data);
        break;
      case 'false_alerts':
        liveHub.emitToSession(this.sessionId, 'falsealerts:update', data);
        break;
      default:
        liveHub.emitToSession(this.sessionId, type, data);
    }
  }

  _emitState() {
    const state = this.mockSim.getStateSnapshot();
    liveHub.emitToSession(this.sessionId, 'session:state', state);
  }
}

class StreamBridgeManager {
  constructor() {
    this.bridges = new Map();
  }

  createBridge(session) {
    const id = session.id || session._id;
    if (this.bridges.has(id)) {
      this.destroyBridge(id);
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
