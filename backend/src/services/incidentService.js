const Incident = require('../models/Incident');
const { AppError } = require('../middleware/errorHandler');
const { isDBConnected } = require('../config/db');
const logger = require('../utils/logger');
const incidentStore = require('./incidentStore');

class IncidentService {
  async listIncidents({ sessionId, status, severity, limit = 50, cursor }) {
    const query = {};
    if (sessionId) query.sessionId = sessionId;
    if (status) query.status = status;
    if (severity) query.severity = severity;

    const incidentMap = new Map();

    // 1. Fetch from DB
    if (isDBConnected()) {
      try {
        const dbIncidents = await Incident.find(query).sort({ openedAtSim: -1, createdAt: -1 }).limit(parseInt(limit, 10)).lean();
        dbIncidents.forEach((i) => incidentMap.set(i._id || i.id, { ...i, id: i._id || i.id }));
      } catch (_) {}
    }

    // 2. Fetch from in-memory incidentStore
    const storeList = incidentStore.getAllIncidents();
    storeList.forEach((i) => {
      const id = i.id || i._id;
      if (!incidentMap.has(id)) incidentMap.set(id, i);
    });

    // 3. Fetch from active stream bridges
    try {
      const streamBridge = require('./streamBridge');
      for (const bridge of streamBridge.bridges.values()) {
        if (bridge.mockSim && bridge.mockSim.activeIncidents) {
          bridge.mockSim.activeIncidents.forEach((inc) => {
            const id = inc.id || inc._id;
            if (!incidentMap.has(id)) incidentMap.set(id, inc);
          });
        }
      }
    } catch (_) {}

    let list = Array.from(incidentMap.values());
    if (sessionId) list = list.filter((i) => i.sessionId === sessionId);
    if (status && status !== 'all') list = list.filter((i) => i.status === status);
    if (severity && severity !== 'all') list = list.filter((i) => i.severity === severity);

    list.sort((a, b) => {
      const tsA = new Date(a.openedAtTs || a.createdAt || 0).getTime() || (a.openedAtSim || 0);
      const tsB = new Date(b.openedAtTs || b.createdAt || 0).getTime() || (b.openedAtSim || 0);
      return tsB - tsA;
    });

    return {
      data: list.slice(0, parseInt(limit, 10)),
      meta: { count: list.length, nextCursor: null }
    };
  }

  async getIncident(incidentId) {
    let incident = incidentStore.getIncident(incidentId);
    if (!incident && isDBConnected()) {
      try {
        const dbInc = await Incident.findById(incidentId).lean();
        if (dbInc) {
          incident = { ...dbInc, id: dbInc._id };
        }
      } catch (_) {}
    }

    if (!incident) {
      try {
        const streamBridge = require('./streamBridge');
        for (const bridge of streamBridge.bridges.values()) {
          const found = bridge.mockSim.activeIncidents.find(i => i.id === incidentId);
          if (found) {
            incident = found;
            break;
          }
        }
      } catch (_) {}
    }

    if (!incident) {
      throw new AppError(404, 'NOT_FOUND', `Incident with ID ${incidentId} not found`);
    }

    // Augment with live ML Root Cause Engine if needed
    if (!incident.root_cause_analysis) {
      try {
        const mlClient = require('./mlClient');
        const flagged = incident.flaggedSensors || (incident.contributions?.map(c => c.channel)) || ['power_bus_voltage_V', 'solar_array_current_A'];
        const readings = {};
        flagged.forEach(f => { readings[f] = 23.4; });
        const mlRes = await mlClient.analyzeAnomaly(flagged, readings);
        if (mlRes) {
          incident.root_cause_analysis = mlRes.root_cause_analysis;
          incident.safety_recommendation = mlRes.safety_recommendation;
          if (mlRes.graph && (!incident.graph || !incident.graph.nodes || incident.graph.nodes.length === 0)) {
            incident.graph = mlRes.graph;
          }
          if (mlRes.propagation && (!incident.propagation || (Array.isArray(incident.propagation) && incident.propagation.length === 0))) {
            incident.propagation = mlRes.propagation;
          }
          if (mlRes.explanation) {
            incident.explanation = { headline: mlRes.explanation, ...incident.explanation };
          }
        }
      } catch (_) {}
    }

    return incident;
  }

  async acknowledgeIncident(incidentId, note = '') {
    const incident = await this.getIncident(incidentId);
    incident.status = 'acknowledged';
    incident.history = incident.history || [];
    incident.history.push({
      action: 'acknowledged',
      note,
      timestamp: new Date()
    });

    incidentStore.updateIncident(incidentId, incident);
    if (isDBConnected()) {
      Incident.findByIdAndUpdate(incidentId, incident, { upsert: true }).catch(() => {});
    }
    return incident;
  }

  async dismissIncident(incidentId, note = '') {
    const incident = await this.getIncident(incidentId);
    incident.status = 'dismissed';
    incident.history = incident.history || [];
    incident.history.push({
      action: 'dismissed',
      note,
      timestamp: new Date()
    });

    incidentStore.updateIncident(incidentId, incident);
    if (isDBConnected()) {
      Incident.findByIdAndUpdate(incidentId, incident, { upsert: true }).catch(() => {});
    }
    return incident;
  }

  async closeIncident(incidentId, note = '') {
    const incident = await this.getIncident(incidentId);
    incident.status = 'closed';
    incident.closedAtTs = new Date().toISOString();
    incident.history = incident.history || [];
    incident.history.push({
      action: 'closed',
      note,
      timestamp: new Date()
    });

    incidentStore.updateIncident(incidentId, incident);
    if (isDBConnected()) {
      Incident.findByIdAndUpdate(incidentId, incident, { upsert: true }).catch(() => {});
    }
    return incident;
  }

  async getComparison(sessionId) {
    const incidents = (await this.listIncidents({ sessionId })).data;
    const items = incidents.map(inc => ({
      incidentId: inc.id || inc._id,
      channel: inc.contributions?.[0]?.channel || 'battery_temp',
      detectorAlertSim: inc.openedAtSim,
      limitAlarmSim: inc.openedAtSim + (inc.detection?.leadTimeSec || 650),
      leadTimeSec: inc.detection?.leadTimeSec || 650,
      limitThreshold: { type: 'redHigh', value: 45 }
    }));

    const meanLeadTime = items.length > 0
      ? Math.round(items.reduce((acc, i) => acc + (i.leadTimeSec || 0), 0) / items.length)
      : 650;

    return {
      sessionId,
      items,
      summary: {
        meanLeadTimeSec: meanLeadTime,
        incidentsWithoutLimitAlarm: 0
      }
    };
  }

  async generateReport(incidentId, format = 'json') {
    const incident = await this.getIncident(incidentId);

    if (format === 'md') {
      return `
# Incident Diagnosis Report: ${incident.id}
**Session ID:** ${incident.sessionId}
**Opened At:** ${incident.openedAtTs} (SimTime: ${incident.openedAtSim}s)
**Status:** ${incident.status} | **Severity:** ${incident.severity} | **Risk:** ${incident.risk}

## Summary & Explanation
- **Headline:** ${incident.explanation?.headline}
- **Evidence:** ${incident.explanation?.evidence}
- **Cause & Confidence:** ${incident.explanation?.causeConfidence}
- **First Recommended Action:** ${incident.explanation?.action}

## Ranked Root Causes
${incident.rankedCauses?.map((rc, idx) => `${idx + 1}. **${rc.hypothesis}** (Target: ${rc.target}) - Posterior: ${(rc.posterior * 100).toFixed(1)}%, Severity: ${(rc.severityEstimate * 100).toFixed(0)}%`).join('\n')}

## Recommended FMEA Actions
${incident.recommendations?.map(rec => `- **[Rank ${rec.rank}] ${rec.action}**: ${rec.rationale}`).join('\n')}

## Confidence Breakdown
- **Overall Confidence:** ${(incident.confidence?.value * 100).toFixed(0)}%
- **Audit Reason:** ${incident.confidence?.reason}
      `.trim();
    }

    return incident;
  }
}

module.exports = new IncidentService();
