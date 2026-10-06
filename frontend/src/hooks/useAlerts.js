import { useState, useEffect, useCallback } from 'react';
import { incidentApi } from '../api/incidentApi';
import { normalizeIncident } from '../utils/telemetryNormalizer';

export function useAlerts(sessionId) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIncidents = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await incidentApi.listIncidents({ sessionId });
      const normalized = (Array.isArray(data) ? data : []).map(normalizeIncident);
      setIncidents(normalized);
    } catch (err) {
      setError(err.message || 'Failed to fetch incidents');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  return {
    incidents,
    setIncidents,
    loading,
    error,
    refetch: fetchIncidents
  };
}
