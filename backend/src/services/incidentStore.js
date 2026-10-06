const memoryIncidents = new Map();

const incidentStore = {
  addIncident(incident) {
    const id = incident.id || incident._id;
    memoryIncidents.set(id, incident);
  },

  getIncident(id) {
    return memoryIncidents.get(id);
  },

  getAllIncidents() {
    return Array.from(memoryIncidents.values());
  },

  updateIncident(id, incident) {
    memoryIncidents.set(id, incident);
  },

  clear() {
    memoryIncidents.clear();
  }
};

module.exports = incidentStore;
