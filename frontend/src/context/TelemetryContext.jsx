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
  const isPlayingRef = useRef(true);
  const playbackSpeedRef = useRef(4);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

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
          isPlayingRef.current = true;
          if (currentSess.speed) {
            setPlaybackSpeed(currentSess.speed);
            playbackSpeedRef.current = currentSess.speed;
          }
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
      if (state.sessionId && sessionId && state.sessionId !== sessionId) return;

      if (state.status) {
        const playing = state.status === 'playing';
        setIsPlaying(playing);
        isPlayingRef.current = playing;
      }
      if (state.speed) {
        setPlaybackSpeed(state.speed);
        playbackSpeedRef.current = state.speed;
      }
      if (state.simTime !== undefined && isPlayingRef.current) {
        setMissionTimeSec(state.simTime);
      }
      if (state.subsystemHealth) {
        setSubsystemHealthData(normalizeSubsystemHealth(state.subsystemHealth));
      }
      if (state.sensors) {
        setSensorsData(normalizeSensors(state.sensors));
      }
    }

    function onTelemetryFrame(frame) {
      // Strictly ignore frames when simulation is paused
      if (!isPlayingRef.current) return;
      if (frame.sessionId && sessionId && frame.sessionId !== sessionId) return;

      const newPoints = normalizeTelemetryFrame(frame);
      if (newPoints.length > 0) {
        setTelemetryData((prev) => {
          const merged = [...prev, ...newPoints];
          // Keep bounded buffer of latest 90 points for responsive charts
          return merged.length > 90 ? merged.slice(merged.length - 90) : merged;
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
        const existingIdx = prev.findIndex((i) => i.id === normalized.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...normalized };
          return updated;
        }
        return [normalized, ...prev];
      });
      setActiveAlertId(normalized.id);
    }

    function onIncidentUpdated(inc) {
      if (!inc) return;
      const normalized = normalizeIncident(inc);
      setIncidentsList((prev) => {
        const existingIdx = prev.findIndex((i) => i.id === normalized.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...normalized };
          return updated;
        }
        return [normalized, ...prev];
      });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session:state', onSessionState);
    socket.on('telemetry:frame', onTelemetryFrame);
    socket.on('incident:created', onIncidentCreated);
    socket.on('incident:updated', onIncidentUpdated);
    socket.on('incident:new', onIncidentCreated);

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
      socket.off('incident:updated', onIncidentUpdated);
      socket.off('incident:new', onIncidentCreated);
    };
  }, [sessionId]);

  // Initial load of telemetry history & incidents from backend
  useEffect(() => {
    if (!sessionId) return;

    async function loadInitialData() {
      try {
        const history = await sessionApi.getTelemetryHistory(sessionId, { downsample: 60 });
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
        } else {
          setTelemetryData(generateInitialTelemetry());
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

  // Fault anomaly injector helper for immediate UI responsiveness
  const injectFaultAnomaly = useCallback((fault) => {
    if (!fault) return;
    const isThermal = fault.type?.includes('heater') || fault.target === 'heater' || fault.target === 'battery';
    const isSolar = fault.type?.includes('solar') || fault.target === 'solar_array';

    const tempSurge = isThermal ? 18.5 : 0;
    const solarDrop = isSolar ? 1.4 : 0;
    const scoreVal = 5.2 + (fault.severity || 0.6) * 4.0;

    setTelemetryData((prev) => {
      const latest = prev[prev.length - 1] || { simTime: 60, batteryTemp: 21.8, solarCurrent: 3.10 };
      const newSec = (latest.simTime || 60) + 1;
      const newPoint = {
        simTime: newSec,
        timestamp: formatMissionTime(newSec),
        batteryTemp: parseFloat((21.8 + tempSurge + Math.random() * 0.4).toFixed(1)),
        solarCurrent: parseFloat(Math.max(0.5, 3.10 - solarDrop + (Math.random() * 0.1 - 0.05)).toFixed(2)),
        anomalyScore: parseFloat(scoreVal.toFixed(2)),
        threshold: 2.1,
        status: 'ANOMALY',
        isAnomalyPeak: true
      };
      const merged = [...prev, newPoint];
      return merged.length > 90 ? merged.slice(merged.length - 90) : merged;
    });

    // Also optimistically create an incident alert if not yet received via socket
    const mockIncidentId = `inc_${Date.now()}`;
    const newInc = {
      id: mockIncidentId,
      severity: 'CRITICAL',
      time: formatMissionTime(missionTimeSec),
      title: fault.name || (fault.type ? fault.type.replace(/_/g, ' ') : 'Spacecraft Anomaly'),
      description: isThermal
        ? 'Battery temperature exceeded critical operational threshold (+18.5°C surge)'
        : 'Solar array current dropped significantly below nominal model expectation',
      colorClass: 'red',
    };
    setIncidentsList((prev) => [newInc, ...prev.filter((i) => i.id !== mockIncidentId)]);
    setActiveAlertId(mockIncidentId);
  }, [missionTimeSec]);

  // Playback control actions calling backend API
  const play = useCallback(async () => {
    setIsPlaying(true);
    isPlayingRef.current = true;
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'play' }).catch(() => { });
    }
  }, [sessionId]);

  const pause = useCallback(async () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'pause' }).catch(() => { });
    }
  }, [sessionId]);

  const togglePlay = useCallback(async () => {
    const nextState = !isPlayingRef.current;
    setIsPlaying(nextState);
    isPlayingRef.current = nextState;
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: nextState ? 'play' : 'pause' }).catch(() => { });
    }
  }, [sessionId]);

  const changeSpeed = useCallback(async (newSpeed) => {
    const spd = Number(newSpeed) || 1;
    setPlaybackSpeed(spd);
    playbackSpeedRef.current = spd;
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'speed', speed: spd }).catch(() => { });
    }
  }, [sessionId]);

  const reset = useCallback(async () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setMissionTimeSec(0);
    setTelemetryData(generateInitialTelemetry());
    setActiveAlertId(null);
    setIncidentsList([]);
    if (sessionId) {
      await sessionApi.controlSession(sessionId, { action: 'reset' }).catch(() => { });
    }
  }, [sessionId]);

  const formattedMissionTime = formatMissionTime(missionTimeSec);

  const currentReading = telemetryData[telemetryData.length - 1] || {
    batteryTemp: 21.8,
    solarCurrent: 3.10,
    anomalyScore: 0.85,
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
        injectFaultAnomaly,
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
