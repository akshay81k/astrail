import apiClient from './client';

export const faultApi = {
  injectFault: (sessionId, payload) =>
    apiClient.post(`/sessions/${sessionId}/faults`, payload),

  injectRandomFault: (sessionId, payload = {}) =>
    apiClient.post(`/sessions/${sessionId}/faults/random`, payload),

  listFaults: (sessionId) =>
    apiClient.get(`/sessions/${sessionId}/faults`),

  updateStress: (sessionId, payload) =>
    apiClient.put(`/sessions/${sessionId}/stress`, payload),

  getFaultTruth: (sessionId, faultId, force = false) =>
    apiClient.get(`/sessions/${sessionId}/faults/${faultId}/truth`, {
      params: { force }
    })
};
