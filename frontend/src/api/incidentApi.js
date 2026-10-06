import apiClient from './client';

export const incidentApi = {
  listIncidents: (params = {}) => apiClient.get('/incidents', { params }),

  getIncident: (id) => apiClient.get(`/incidents/${id}`),

  acknowledgeIncident: (id, note = '') =>
    apiClient.post(`/incidents/${id}/acknowledge`, { note }),

  dismissIncident: (id, note = '') =>
    apiClient.post(`/incidents/${id}/dismiss`, { note }),

  closeIncident: (id, note = '') =>
    apiClient.post(`/incidents/${id}/close`, { note })
};
