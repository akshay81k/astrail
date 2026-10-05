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
  const [telemetryData, setTelemetryData] = useState(() => generateInitialTelemetry());
  const [subsystemHealthData, setSubsystemHealthData] = useState(() => normalizeSubsystemHealth({ power: 'green', thermal: 'green', attitude: 'green' }));
  const [sensorsData, setSensorsData] = useState(() => normalizeSensors([]));
  const [incidentsList, setIncidentsList] = useState([]);
  const [activeFault, setActiveFault] = useState(null);
  const [timeRange, setTimeRange] = useState('Live');
  const [activeAlertId, setActiveAlertId] = useState(null);
  const [source, setSource] = useState('Simulator');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const lastSocketFrameTs = useRef(0);

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
        if (isMounted) {
          setSessionId('ses_live_sim');
          setIsConnected(true);
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
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    function onConnect() {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      if (sessionId) {
        socket.emit('session:join', { sessionId });
      }
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onConnectError() {
      setIsConnected(true); // Fall back to local live engine
      setIsConnecting(false);
    }

    function onSessionState(state) {
      if (!state) return;
      if (state.status) setIsPlaying(state.status === 'playing');
      if (state.speed) setPlaybackSpeed(state.speed);
      if (state.simTime !== undefined) setMissionTimeSec(INITIAL_MISSION_TIME_SECONDS + state.simTime);
      if (state.subsystemHealth) {
        setSubsystemHealthData(normalizeSubsystemHealth(state.subsystemHealth));
      }
      if (state.sensors) {
        setSensorsData(normalizeSensors(state.sensors));
      }
    }

    function onTelemetryFrame(frame) {
      lastSocketFrameTs.current = Date.now();
      const newPoints = normalizeTelemetryFrame(frame);
      if (newPoints.length > 0) {
        setTelemetryData((prev) => {
          const merged = [...prev, ...newPoints];
          return merged.length > 120 ? merged.slice(merged.length - 120) : merged;
        });

        const lastPoint = newPoints[newPoints.length - 1];
        if (lastPoint && lastPoint.simTime !== undefined) {
          setMissionTimeSec(INITIAL_MISSION_TIME_SECONDS + lastPoint.simTime);
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

  // Continuous live simulator ticker (keeps charts and time advancing smoothly)
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.max(200, Math.floor(1000 / (playbackSpeed || 4)));
    const ticker = setInterval(() => {
      // If socket hasn't delivered a frame in over 500ms, generate next point smoothly
      if (Date.now() - lastSocketFrameTs.current > 400) {
        setMissionTimeSec((prevSec) => {
          const nextSec = prevSec + 2;
          setTelemetryData((prevData) => {
            const last = prevData[prevData.length - 1] || {};
            const nextPt = generateNextPoint(prevSec, last, activeFault);
            const updated = [...prevData, nextPt];
            return updated.length > 120 ? updated.slice(updated.length - 120) : updated;
          });
          return nextSec;
        });
      }
    }, intervalMs);

    return () => clearInterval(ticker);
  }, [isPlaying, playbackSpeed, activeFault]);

  // Inject a fault into both local state and backend API
  const injectFaultAnomaly = useCallback(async (faultConfig) => {
    setActiveFault(faultConfig);

    // Update subsystem health cards
    if (faultConfig.id === 'solar_degradation' || faultConfig.type === 'solar_degradation') {
      setSubsystemHealthData(normalizeSubsystemHealth({ power: 'amber', thermal: 'red', attitude: 'green' }));
    } else if (faultConfig.id === 'heater_stuck_on') {
      setSubsystemHealthData(normalizeSubsystemHealth({ power: 'amber', thermal: 'red', attitude: 'green' }));
    }

    // Add new incident to alerts & history
    const newInc = {
      id: `014-${Math.floor(Math.random() * 899 + 100)}`,
      severity: 'CRITICAL',
      time: formatMissionTime(missionTimeSec),
      title: `${faultConfig.name || faultConfig.type?.replace(/_/g, ' ') || 'Anomaly'} active`,
      description: 'Variance detected on power and thermal telemetry channels',
      colorClass: 'red'
    };

    setIncidentsList((prev) => [newInc, ...prev]);

    // Send to backend session if active
    if (sessionId && sessionId !== 'ses_live_sim') {
      await faultApi.injectFault(sessionId, {
        type: faultConfig.backendType || faultConfig.type || 'solar_degradation',
        target: faultConfig.backendTarget || faultConfig.target || 'solar_array',
        severity: faultConfig.severity ?? 0.6,
        startOffsetSec: 0,
        rampSec: 5
      }).catch(() => {});
    }
  }, [sessionId, missionTimeSec]);

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
        activeFault,
        injectFaultAnomaly,
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
