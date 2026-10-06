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
  const [sessionId, setSessionId] = useState('ml_live_session');
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

  const [lastTelemetryFrameRaw, setLastTelemetryFrameRaw] = useState(null);
  const [lastIncidentRaw, setLastIncidentRaw] = useState(null);

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

  // Connect directly to Python ML FastAPI native WebSocket (port 8001 / 8000)
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let isDisposed = false;

    const urls = [
      'ws://127.0.0.1:8001/stream?token=dev-key-123',
      'ws://localhost:8001/stream?token=dev-key-123',
      'ws://127.0.0.1:8000/stream?token=dev-key-123'
    ];
    let urlIndex = 0;

    function connectNativeWS() {
      if (isDisposed) return;
      const wsUrl = urls[urlIndex % urls.length];
      console.log(`[ML Stream] Attempting WebSocket connection to: ${wsUrl}`);
      setIsConnecting(true);

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isDisposed) return;
          console.log(`[ML Stream] Successfully connected to Python ML Backend: ${wsUrl}`);
          setIsConnected(true);
          setIsConnecting(false);
          setError(null);
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'telemetry' && msg.data) {
              setLastTelemetryFrameRaw(msg.data);
              const signals = msg.data.signals || {};
              const ts = msg.data.timestamp || Date.now() / 1000;
              const date = new Date(ts * 1000);
              const timeStr = date.toISOString().substring(11, 19);

              const simSec = Math.floor(ts);
              setMissionTimeSec(simSec);

              const tempVal = signals.battery_temperature_C != null ? Number(signals.battery_temperature_C) : 21.8;
              const solarVal = signals.solar_array_current_A != null ? Number(signals.solar_array_current_A) : 3.10;
              const voltVal = signals.power_bus_voltage_V != null ? Number(signals.power_bus_voltage_V) : 28.2;
              const scoreVal = msg.data.anomaly_score != null ? Number(msg.data.anomaly_score) : 0.08;
              const threshVal = msg.data.threshold != null ? Number(msg.data.threshold) : 1.022;
              const statusVal = msg.data.status || (scoreVal > threshVal ? 'ANOMALY' : 'NOMINAL');
              const isAnomaly = msg.data.is_anomaly || statusVal === 'ANOMALY';

              const newPoint = {
                simTime: simSec,
                timestamp: timeStr,
                batteryTemp: parseFloat(tempVal.toFixed(2)),
                solarCurrent: parseFloat(solarVal.toFixed(2)),
                powerBusVoltage: parseFloat(voltVal.toFixed(2)),
                anomalyScore: parseFloat(scoreVal.toFixed(3)),
                threshold: parseFloat(threshVal.toFixed(3)),
                status: statusVal,
                isAnomalyPeak: isAnomaly
              };

              setTelemetryData((prev) => {
                const merged = [...prev, newPoint];
                return merged.length > 90 ? merged.slice(merged.length - 90) : merged;
              });

              // Also update sensor values for all 23 sensors
              setSensorsData(
                Object.keys(signals).map((k) => ({
                  id: k,
                  name: k,
                  value: signals[k],
                  status: 'OK'
                }))
              );
            } else if (msg.type === 'incident' && msg.data) {
              setLastIncidentRaw(msg.data);
              const inc = msg.data;
              const rcList = inc.root_cause_analysis?.root_cause_candidates || [];
              const topCand = rcList[0] || {};
              const scoreMax = inc.anomaly_score_max != null ? Number(inc.anomaly_score_max) : 3.5;

              // Spike anomaly score on the latest telemetry point
              setTelemetryData((prev) => {
                if (prev.length === 0) return prev;
                const copy = [...prev];
                const last = { ...copy[copy.length - 1] };
                last.anomalyScore = parseFloat(scoreMax.toFixed(2));
                last.status = 'ANOMALY';
                last.isAnomalyPeak = true;
                copy[copy.length - 1] = last;
                return copy;
              });

              const incId = `inc_${Date.now()}`;
              const normalized = {
                id: incId,
                incidentId: incId,
                event_type: 'subsystem_fault',
                severity: scoreMax > 3.0 ? 'CRITICAL' : 'HIGH',
                title: `${topCand.subsystem || 'SPACECRAFT'} Anomaly Detected`,
                headline: inc.explanation || 'Conformal residual exceeded operational threshold',
                top_cause: topCand.subsystem || 'POWER',
                confidence: topCand.confidence_score ? topCand.confidence_score / 100 : 0.85,
                openedAt: new Date((inc.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString(),
                flagged_sensors: inc.flagged_sensors || [],
                explanation: inc.explanation,
                root_cause_analysis: inc.root_cause_analysis,
                recommendations: inc.safety_recommendation?.recommended_actions?.map((a, idx) => ({
                  id: idx + 1,
                  rule_id: `RULE_00${idx + 1}`,
                  subsystem: topCand.subsystem || 'POWER',
                  signal: inc.flagged_sensors?.[0] || 'power_bus_voltage_V',
                  risk: 'HIGH',
                  action: a.action || a.title || 'Investigate telemetry'
                })) || []
              };

              setIncidentsList((prev) => [normalized, ...prev.filter((i) => i.id !== incId)]);
              setActiveAlertId(incId);
            }
          } catch (e) {
            console.warn('[ML Stream] Error parsing frame:', e);
          }
        };

        ws.onerror = () => {
          console.warn(`[ML Stream] WebSocket error on ${wsUrl}`);
        };

        ws.onclose = () => {
          if (isDisposed) return;
          console.warn(`[ML Stream] WebSocket closed on ${wsUrl}, retrying in 2s...`);
          setIsConnected(false);
          setIsConnecting(true);
          urlIndex++;
          reconnectTimeout = setTimeout(connectNativeWS, 2000);
        };
      } catch (err) {
        if (!isDisposed) {
          setIsConnected(false);
          urlIndex++;
          reconnectTimeout = setTimeout(connectNativeWS, 2000);
        }
      }
    }

    connectNativeWS();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
    };
  }, []);

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

  // Replay real fault incident (F001, F004, F006)
  const replayIncident = useCallback(async (faultId) => {
    try {
      const cleanId = String(faultId).replace(/^inc_/, '');
      const resp = await fetch(`/incident_${cleanId}.json`);
      if (resp.ok) {
        const incData = await resp.json();
        setLastIncidentRaw(incData);
        setIncidentsList((prev) => [incData, ...prev.filter((i) => i.id !== incData.id)]);
        setActiveAlertId(incData.id);

        // Trip anomaly score chart above threshold
        const scoreVal = incData.anomaly_score_max || 4.2;
        setTelemetryData((prev) => {
          const latest = prev[prev.length - 1] || { simTime: 60, batteryTemp: 21.8, solarCurrent: 3.10 };
          const newSec = (latest.simTime || 60) + 1;
          const newPoint = {
            simTime: newSec,
            timestamp: formatMissionTime(newSec),
            batteryTemp: parseFloat((latest.batteryTemp || 21.8).toFixed(1)),
            solarCurrent: parseFloat((latest.solarCurrent || 3.10).toFixed(2)),
            anomalyScore: parseFloat(scoreVal.toFixed(2)),
            threshold: 1.022,
            status: 'ANOMALY',
            isAnomalyPeak: true
          };
          const merged = [...prev, newPoint];
          return merged.length > 90 ? merged.slice(merged.length - 90) : merged;
        });
        return incData;
      }
    } catch (e) {
      console.warn('Failed to replay incident:', e);
    }
  }, []);

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
        replayIncident,
        lastTelemetryFrameRaw,
        lastIncidentRaw,
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
