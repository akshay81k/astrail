import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../api/socketClient';
import { sessionApi } from '../api/sessionApi';
import { incidentApi } from '../api/incidentApi';
import {
  generateInitialTelemetry,
  generateNextPoint,
  INITIAL_MISSION_TIME_SECONDS,
  formatMissionTime as formatSimTime
} from '../data/telemetrySimulator';
import {
  normalizeTelemetryFrame,
  normalizeSubsystemHealth,
  normalizeSensors,
  normalizeIncident,
  formatMissionTime
} from '../utils/telemetryNormalizer';

const TelemetryContext = createContext(null);

export const TelemetryProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(4);
  const [missionTimeSec, setMissionTimeSec] = useState(INITIAL_MISSION_TIME_SECONDS);
  const [telemetryData, setTelemetryData] = useState([]);
  const [subsystemHealthData, setSubsystemHealthData] = useState([]);
  const [sensorsData, setSensorsData] = useState([]);
  const [incidentsList, setIncidentsList] = useState([]);
  const [timeRange, setTimeRange] = useState('Live');
  const [activeAlertId, setActiveAlertId] = useState(null);
  const [source, setSource] = useState('Simulator');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);

  // Initialize or fetch backend session
  useEffect(() => {
    let isMounted = true;

    async function setupBackendSession() {
      setIsConnecting(true);
      setError(null);
      try {
        const currentSessRes = await sessionApi.createSession({ source: 'simulator', speed: 4 });
        const currentSess = currentSessRes?.data || currentSessRes;

        if (isMounted && currentSess) {
          const id = currentSess.id || currentSess._id;
          setSessionId(id);
          setIsPlaying(true);
          if (currentSess.speed) setPlaybackSpeed(currentSess.speed);
        }
      } catch (err) {
        console.warn('[Backend Warning] Could not connect to session REST API, using fallback mode:', err.message);
        if (isMounted) {
          // Fallback to local simulator data if backend fails
          setTelemetryData(generateInitialTelemetry());
          setIsConnected(false);
          setIsConnecting(false);
        }
      }
    }

    setupBackendSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Connect Socket.IO when session ID is available
  useEffect(() => {
    if (!sessionId) return;

    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    function onConnect() {
      console.log('[Socket.IO] Connected to /live gateway');
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      socket.emit('session:join', { sessionId });
    }

    function onDisconnect(reason) {
      console.warn('[Socket.IO] Disconnected:', reason);
      setIsConnected(false);
    }

    function onConnectError(err) {
      console.warn('[Socket.IO] Connect Error:', err.message);
      setIsConnected(false);
      setIsConnecting(false);
    }

    function onSessionState(state) {
      if (!state) return;
      if (state.status) setIsPlaying(state.status === 'playing');
      if (state.speed) setPlaybackSpeed(state.speed);
      if (state.simTime !== undefined) setMissionTimeSec(state.simTime);
      if (state.subsystemHealth) {
        setSubsystemHealthData(normalizeSubsystemHealth(state.subsystemHealth));
      }
      if (state.sensors) {
        setSensorsData(normalizeSensors(state.sensors));
      }
    }

    function onTelemetryFrame(frame) {
      const newPoints = normalizeTelemetryFrame(frame);
      if (newPoints.length > 0) {
        setTelemetryData((prev) => {
          const merged = [...prev, ...newPoints];
          // Keep bounded buffer of max 180 points for smooth charts
          return merged.length > 180 ? merged.slice(merged.length - 180) : merged;
        });

        const lastPoint = newPoints[newPoints.length - 1];
        if (lastPoint && lastPoint.simTime !== undefined) {
          setMissionTimeSec(lastPoint.simTime);
        }
      }
    }

    function onIncidentCreated(inc) {
      if (!inc) return;
      const normalized = normalizeIncident(inc);
      setIncidentsList((prev) => {
        if (prev.some((i) => i.id === normalized.id)) return prev;
        return [normalized, ...prev];
      });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session:state', onSessionState);
    socket.on('telemetry:frame', onTelemetryFrame);
    socket.on('incident:created', onIncidentCreated);

    // Initial session join if already connected
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session:state', onSessionState);
      socket.off('telemetry:frame', onTelemetryFrame);
      socket.off('incident:created', onIncidentCreated);
    };
  }, [sessionId]);

  // Initial load of telemetry history & incidents from backend
  useEffect(() => {
    if (!sessionId) return;

    async function loadInitialData() {
      try {
        const history = await sessionApi.getTelemetryHistory(sessionId, { downsample: 100 });
        if (history && history.t && history.t.length > 0) {
          const frameObj = {
            t: history.t,
            channels: history.channels || {},
            score: history.score || [],
            threshold: history.threshold || [],
            flag: history.flag || []
          };
          const points = normalizeTelemetryFrame(frameObj);
          if (points.length > 0) {
            setTelemetryData(points);
          }
        }

        const state = await sessionApi.getSessionState(sessionId);
        if (state) {
          if (state.subsystemHealth) setSubsystemHealthData(normalizeSubsystemHealth(state.subsystemHealth));
          if (state.sensors) setSensorsData(normalizeSensors(state.sensors));
        }

        const incs = await incidentApi.listIncidents({ sessionId });
        if (Array.isArray(incs) && incs.length > 0) {
          setIncidentsList(incs.map(normalizeIncident));
        }
      } catch (err) {
        console.warn('[Backend] Failed loading initial history, using default visualization:', err.message);
        setTelemetryData(generateInitialTelemetry());
      }
    }

    loadInitialData();
  }, [sessionId]);

  // Playback control actions calling backend API
  const play = useCallback(async () => {
    setIsPlaying(true);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'play' }).catch(() => { });
    }
  }, [sessionId]);

  const pause = useCallback(async () => {
    setIsPlaying(false);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'pause' }).catch(() => { });
    }
  }, [sessionId]);

  const togglePlay = useCallback(async () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: nextState ? 'play' : 'pause' }).catch(() => { });
    }
  }, [isPlaying, sessionId]);

  const changeSpeed = useCallback(async (newSpeed) => {
    setPlaybackSpeed(newSpeed);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'speed', speed: newSpeed }).catch(() => { });
    }
  }, [sessionId]);

  const reset = useCallback(async () => {
    setIsPlaying(false);
    setTelemetryData([]);
    setActiveAlertId(null);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'reset' }).catch(() => { });
      const freshHistory = await sessionApi.getTelemetryHistory(sessionId).catch(() => null);
      if (freshHistory && freshHistory.t) {
        setTelemetryData(normalizeTelemetryFrame(freshHistory));
      } else {
        setTelemetryData(generateInitialTelemetry());
      }
    } else {
      setTelemetryData(generateInitialTelemetry());
    }
  }, [sessionId]);

  const formattedMissionTime = formatMissionTime(missionTimeSec);

  const currentReading = telemetryData[telemetryData.length - 1] || {
    batteryTemp: 39.5,
    solarCurrent: 1.6,
    anomalyScore: 0.22,
    timestamp: formattedMissionTime,
    status: 'NOMINAL'
  };

  return (
    <TelemetryContext.Provider
      value={{
        sessionId,
        isPlaying,
        play,
        pause,
        togglePlay,
        playbackSpeed,
        setPlaybackSpeed: changeSpeed,
        missionTimeSec,
        formattedMissionTime,
        telemetryData,
        currentReading,
        subsystemHealthData,
        sensorsData,
        incidentsList,
        timeRange,
        setTimeRange,
        activeAlertId,
        setActiveAlertId,
        source,
        setSource,
        reset,
        isFullscreen,
        setIsFullscreen,
        isConnected,
        isConnecting,
        error
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
};
