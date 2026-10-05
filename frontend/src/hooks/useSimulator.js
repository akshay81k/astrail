import { useState, useCallback } from 'react';
import { sessionApi } from '../api/sessionApi';

export function useSimulator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initSession = useCallback(async (customPayload = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Check existing active sessions first
      const activeList = await sessionApi.listSessions();
      let activeSession = activeList.find((s) => s.status === 'playing' || s.status === 'created');

      if (!activeSession) {
        activeSession = await sessionApi.createSession(customPayload);
      }

      setSession(activeSession);
      return activeSession;
    } catch (err) {
      setError(err.message || 'Failed to initialize session');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const controlSession = useCallback(async (sessionId, actionPayload) => {
    if (!sessionId) return null;
    try {
      const updatedState = await sessionApi.controlSession(sessionId, actionPayload);
      return updatedState;
    } catch (err) {
      console.error('[Simulator Control Error]:', err);
      return null;
    }
  }, []);

  return {
    session,
    loading,
    error,
    initSession,
    controlSession
  };
}
