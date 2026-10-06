import apiClient from './client';

export const evaluationApi = {
  getSummary: () => apiClient.get('/evaluation/summary').catch(() => fetch('/results.json').then(r => r.json())),
  getDetection: () => apiClient.get('/evaluation/detection'),
  getRootCause: () => apiClient.get('/evaluation/root-cause'),
  getFalseAlerts: () => apiClient.get('/evaluation/false-alerts'),
  getRobustness: () => apiClient.get('/evaluation/robustness'),
  getLeadTime: () => apiClient.get('/evaluation/lead-time'),
  getResultsJson: async () => {
    try {
      const res = await apiClient.get('/evaluation/results-json');
      if (res?.detection_8faults || res?.metadata) return res;
    } catch (_) {}
    try {
      const resp = await fetch('/results.json');
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return null;
  }
};
