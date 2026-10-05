import apiClient from './client';

export const sessionApi = {
  createSession: (payload = {}) =>
    apiClient.post('/sessions', {
      source: 'simulator',
      speed: 4,
      seed: 42,
      mismatchLevel: 'medium',
      ...payload
    }),

  listSessions: () => apiClient.get('/sessions'),

  getSession: (id) => apiClient.get(`/sessions/${id}`),

  getSessionState: (id) => apiClient.get(`/sessions/${id}/state`),

  controlSession: (id, actionPayload) =>
    apiClient.post(`/sessions/${id}/control`, actionPayload),

  getTelemetryHistory: (id, params = {}) =>
    apiClient.get(`/sessions/${id}/telemetry`, { params }),

  getSensors: (id) => apiClient.get(`/sessions/${id}/sensors`),

  getComparison: (id) => apiClient.get(`/sessions/${id}/comparison`),

  deleteSession: (id) => apiClient.delete(`/sessions/${id}`)
};

