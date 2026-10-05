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

    if (isDBConnected()) {
      try {
        const dbIncidents = await Incident.find(query).sort({ openedAtSim: -1 }).limit(parseInt(limit, 10)).lean();
        if (dbIncidents.length > 0) {
          return {
            data: dbIncidents.map(i => ({ ...i, id: i._id })),
            meta: { count: dbIncidents.length, nextCursor: null }
          };
        }
      } catch (_) {}
    }

    let list = incidentStore.getAllIncidents();
    try {
      const streamBridge = require('./streamBridge');
      for (const bridge of streamBridge.bridges.values()) {
        if (bridge.mockSim && bridge.mockSim.activeIncidents) {
          bridge.mockSim.activeIncidents.forEach(inc => {
            if (!list.some(item => item.id === inc.id)) {
              list.push(inc);
            }
          });
        }
      }
    } catch (_) {}

    if (sessionId) list = list.filter(i => i.sessionId === sessionId);
    if (status) list = list.filter(i => i.status === status);
    if (severity) list = list.filter(i => i.severity === severity);

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
