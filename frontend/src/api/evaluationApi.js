import apiClient from './client';

export const evaluationApi = {
  getSummary: () => apiClient.get('/evaluation/summary'),
  getDetection: () => apiClient.get('/evaluation/detection'),
  getRootCause: () => apiClient.get('/evaluation/root-cause'),
  getFalseAlerts: () => apiClient.get('/evaluation/false-alerts'),
  getRobustness: () => apiClient.get('/evaluation/robustness'),
  getLeadTime: () => apiClient.get('/evaluation/lead-time')
};
