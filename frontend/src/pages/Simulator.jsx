import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import SimulatorHeader from '../components/simulator/SimulatorHeader';
import SpacecraftScene from '../components/simulator/SpacecraftScene';
import SubsystemCallouts from '../components/simulator/SubsystemCallout';
import OrbitStatusPanel from '../components/simulator/OrbitStatusPanel';
import AttitudeIndicator from '../components/simulator/AttitudeIndicator';
import MissionSignalBar from '../components/simulator/MissionSignalBar';
import FaultControlPanel from '../components/simulator/FaultControlPanel';
import TelemetryCharts from '../components/simulator/TelemetryCharts';
import SimulationTimeline from '../components/simulator/SimulationTimeline';
import EventLog from '../components/simulator/EventLog';
import { useTelemetry } from '../context/TelemetryContext';
import { FAULT_TYPES } from '../data/faultMetadata';
import '../components/simulator/Simulator.css';

export default function Simulator() {
  const navigate = useNavigate();
  const {
    sessionId,
    isPlaying,
    togglePlay,
    formattedMissionTime,
    telemetryData,
    currentReading,
    sensorsData,
    incidentsList,
    activeFault,
    injectFaultAnomaly,
    reset: resetTelemetryContext,
    isConnected
  } = useTelemetry();

  // Subsystem shared selection & hover state ('solar' | 'battery' | 'antenna' | 'wheel' | 'thermal')
  const [selectedSubsystem, setSelectedSubsystem] = useState('solar');
  const [hoveredSubsystem, setHoveredSubsystem] = useState(null);

  // Fault configuration state
  const [selectedFaultId, setSelectedFaultId] = useState('solar_degradation');
  const [severityPct, setSeverityPct] = useState(48);
  const [startMode, setStartMode] = useState('now');
  const [delaySec, setDelaySec] = useState(30);
  const [durationMode, setDurationMode] = useState('continuous');
  const [tempDurationSec, setTempDurationSec] = useState(10);

  // Fault injection execution state
  const [injecting, setInjecting] = useState(false);
  const [injectSuccess, setInjectSuccess] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // Event stream state — starts with a single system-ready message
  const [events, setEvents] = useState([
    {
      id: 'evt-boot-0',
      timestamp: '',
      text: 'Simulator ready. Select a fault type and click Inject Fault to begin.',
      severity: 'success',
      tag: 'SYSTEM'
    }
  ]);

  // Simulation timeline tracking state
  const [timelineState, setTimelineState] = useState({
    faultConfiguredTime: null,
    injectionStartedTime: null,
    telemetryRespondingTime: null,
    anomalyDetectedTime: null,
    incidentGeneratedTime: null,
    hasFaultConfigured: false,
    hasInjected: false,
    hasTelemetryResponding: false,
    hasAnomalyDetected: false,
    hasIncidentGenerated: false,
    incidentId: null
  });

  // Watch for real incident creation from TelemetryContext or WebSocket
  useEffect(() => {
    if (incidentsList && incidentsList.length > 0) {
      const latestIncident = incidentsList[0];
      setTimelineState((prev) => {
        if (prev.hasIncidentGenerated) return prev;
        return {
          ...prev,
          hasIncidentGenerated: true,
          incidentGeneratedTime: latestIncident.time || formattedMissionTime,
          incidentId: latestIncident.id
        };
      });

      setEvents((prev) => {
        const text = `Incident generated: ${latestIncident.title || latestIncident.id}`;
        if (prev.some((e) => e.text === text)) return prev;
        return [
          {
            id: `evt-inc-${Date.now()}`,
            timestamp: latestIncident.time || formattedMissionTime,
            text,
            severity: 'critical',
            tag: 'CRITICAL'
          },
          ...prev
        ];
      });
    }
  }, [incidentsList, formattedMissionTime]);

  // Watch real telemetry frame updates to advance timeline stages when deviation occurs
  useEffect(() => {
    if (!currentReading || !timelineState.hasInjected) return;

    // Stage 3: Telemetry responding (only after fault injected)
    const isSolarDeviating = currentReading.regime === 'sunlight' && currentReading.solarCurrent !== undefined && currentReading.solarCurrent < 3.2;
    const isBatteryElevated = currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 34.0;
    const isWheelDeviating = currentReading.wheelSpeed !== undefined && currentReading.wheelSpeed < 1800;
    const isStatusDeviating = currentReading.status === 'WARNING' || currentReading.status === 'ANOMALY';
    const isTelemetryResponding = isSolarDeviating || isBatteryElevated || isWheelDeviating || isStatusDeviating;

    if (isTelemetryResponding && !timelineState.hasTelemetryResponding) {
      setTimelineState((prev) => ({
        ...prev,
        hasTelemetryResponding: true,
        telemetryRespondingTime: formattedMissionTime
      }));
      setEvents((prev) => [
        {
          id: `evt-telemetry-${Date.now()}`,
          timestamp: formattedMissionTime,
          text: 'Telemetry responding to fault injection',
          severity: 'blue',
          tag: 'INFO'
        },
        ...prev
      ]);
    }

    // Stage 4: Anomaly detected (driven by real backend anomaly detector score/threshold)
    const isAnomalyDetected = currentReading.isAnomalyPeak ||
      (currentReading.anomalyScore !== undefined && currentReading.threshold !== undefined && currentReading.anomalyScore >= currentReading.threshold) ||
      (currentReading.status === 'ANOMALY');

    if (isAnomalyDetected && !timelineState.hasAnomalyDetected) {
      setTimelineState((prev) => ({
        ...prev,
        hasAnomalyDetected: true,
        anomalyDetectedTime: formattedMissionTime
      }));
      setEvents((prev) => [
        {
          id: `evt-anomaly-${Date.now()}`,
          timestamp: formattedMissionTime,
          text: `Anomaly threshold exceeded (score: ${currentReading.anomalyScore?.toFixed(2)}, threshold: ${currentReading.threshold?.toFixed(2) || '2.10'})`,
          severity: 'critical',
          tag: 'CRITICAL'
        },
        ...prev
      ]);
    }
  }, [currentReading, timelineState.hasInjected, timelineState.hasTelemetryResponding, timelineState.hasAnomalyDetected, formattedMissionTime]);

  // Keep selected subsystem matching fault type if user changes fault type
  const handleSelectFault = (faultId) => {
    setSelectedFaultId(faultId);
    if (faultId === 'solar_degradation') setSelectedSubsystem('solar');
    else if (faultId === 'heater_stuck_on' || faultId === 'battery_degradation') setSelectedSubsystem('battery');
    else if (faultId === 'wheel_friction') setSelectedSubsystem('wheel');

    const matched = FAULT_TYPES.find((f) => f.id === faultId);
    if (matched) {
      // Mark Stage 1 of timeline as configured
      setTimelineState((prev) => ({
        ...prev,
        hasFaultConfigured: true,
        faultConfiguredTime: prev.faultConfiguredTime || formattedMissionTime
      }));

      setEvents((prev) => [
        {
          id: `evt-cfg-${Date.now()}`,
          timestamp: formattedMissionTime,
          text: `Fault configured: ${matched.title || matched.name} (${severityPct}%)`,
          severity: 'success',
          tag: 'INFO'
        },
        ...prev
      ]);
    }
  };

  // Real Fault Injection Handler calling existing API and context
  const handleInjectFault = async () => {
    setErrorMsg(null);
    setInjectSuccess(false);

    const selectedFault = FAULT_TYPES.find((f) => f.id === selectedFaultId) || FAULT_TYPES[0];

    try {
      setInjecting(true);

      // Build the payload with the correct type field that the backend mockSimulator recognizes
      const faultPayload = {
        id: selectedFault.id,
        name: selectedFault.title || selectedFault.name,
        type: selectedFault.backendType,   // backendType matches backend catalog (e.g. 'solar_degradation')
        target: selectedFault.backendTarget,
        severity: Number((severityPct / 100).toFixed(2)),
        startOffsetSec: startMode === 'delay' ? Number(delaySec) : 0,
        rampSec: 10
      };

      if (durationMode === 'temporary') {
        faultPayload.durationSec = Number(tempDurationSec) * 60;
      }

      // injectFaultAnomaly handles sending to backend session via TelemetryContext
      await injectFaultAnomaly(faultPayload);

      // Update feedback & timeline
      const statusFeedback = startMode === 'delay' ? '✓ FAULT SCHEDULED' : '✓ FAULT INJECTED';
      setFeedbackText(statusFeedback);
      setInjectSuccess(true);

      setTimelineState((prev) => ({
        ...prev,
        hasFaultConfigured: true,
        hasInjected: true,
        injectionStartedTime: formattedMissionTime,
        faultConfiguredTime: prev.faultConfiguredTime || formattedMissionTime
      }));

      // Log event
      setEvents((prev) => [
        {
          id: `evt-inj-${Date.now()}`,
          timestamp: formattedMissionTime,
          text: `Fault injection started: ${selectedFault.title || selectedFault.name}`,
          severity: 'blue',
          tag: 'INFO'
        },
        ...prev
      ]);

      setTimeout(() => {
        setInjectSuccess(false);
      }, 5000);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Fault injection failed';
      setErrorMsg(msg);
      setFeedbackText('');
      setInjectSuccess(false);
    } finally {
      setInjecting(false);
    }
  };

  // Handle Full Simulation Reset
  const handleResetSimulation = async () => {
    await resetTelemetryContext();
    setTimelineState({
      faultConfiguredTime: formattedMissionTime,
      injectionStartedTime: null,
      telemetryRespondingTime: null,
      anomalyDetectedTime: null,
      incidentGeneratedTime: null,
      hasFaultConfigured: false,
      hasInjected: false,
      hasTelemetryResponding: false,
      hasAnomalyDetected: false,
      hasIncidentGenerated: false,
      incidentId: null
    });
    setEvents([
      {
        id: `evt-reset-${Date.now()}`,
        timestamp: formattedMissionTime,
        text: 'Simulation reset: All subsystems nominal',
        severity: 'success',
        tag: 'INFO'
      }
    ]);
  };

  // Derive active fault state flags for 3D model highlights
  // activeFault.id is the frontend id (e.g. 'solar_degradation')
  // activeFault.type is the backendType (now also 'solar_degradation')
  const faultState = useMemo(() => {
    const activeFaultId = activeFault?.id;
    const activeFaultType = activeFault?.type;
    const isSolar = activeFaultId === 'solar_degradation' || activeFaultType === 'solar_degradation'
      || (currentReading.solarCurrent !== undefined && currentReading.solarCurrent < 3.2);
    const isBattery = activeFaultId === 'battery_degradation' || activeFaultType === 'battery_degradation'
      || (currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 34.0);
    const isThermal = activeFaultId === 'heater_stuck_on' || activeFaultType === 'heater_stuck_on'
      || (currentReading.batteryTemp !== undefined && currentReading.batteryTemp > 34.0);
    const isWheel = activeFaultId === 'wheel_friction' || activeFaultType === 'wheel_friction';
    return { solar: isSolar, battery: isBattery, thermal: isThermal, wheel: isWheel };
  }, [activeFault, currentReading]);

  // Derive dynamic system status for header badge
  const { systemStatus, statusSubtext, statusType } = useMemo(() => {
    if (!isPlaying) {
      return { systemStatus: 'Paused', statusSubtext: 'Simulation execution paused', statusType: 'paused' };
    }
    if (timelineState.hasIncidentGenerated) {
      return { systemStatus: 'Incident Generated', statusSubtext: 'Investigation required', statusType: 'critical' };
    }
    if (timelineState.hasAnomalyDetected || currentReading.status === 'ANOMALY') {
      return { systemStatus: 'Anomaly Detected', statusSubtext: 'Telemetry variance critical', statusType: 'critical' };
    }
    if (timelineState.hasInjected || activeFault) {
      return { systemStatus: 'Fault Active', statusSubtext: 'Telemetry actively deviating', statusType: 'warning' };
    }
    return { systemStatus: 'Simulation Active', statusSubtext: 'All systems nominal', statusType: 'nominal' };
  }, [isPlaying, timelineState.hasIncidentGenerated, timelineState.hasAnomalyDetected, timelineState.hasInjected, activeFault, currentReading.status]);

  return (
    <div className="app-container simulator-app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="simulator-page">
          {/* 1. Header */}
          <SimulatorHeader
            systemStatus={systemStatus}
            statusSubtext={statusSubtext}
            statusType={statusType}
            formattedMissionTime={formattedMissionTime}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onReset={handleResetSimulation}
          />

          {/* 2. Top Row: 3D Spacecraft Viewport + Inject Fault Control Panel */}
          <div className="simulator-top-row">
            <div className="spacecraft-viewport-container">
              {/* 3D WebGL Digital Twin Spacecraft */}
              <SpacecraftScene
                selectedSubsystem={selectedSubsystem}
                hoveredSubsystem={hoveredSubsystem}
                onHoverSubsystem={setHoveredSubsystem}
                onClickSubsystem={setSelectedSubsystem}
                faultState={faultState}
                isPaused={!isPlaying}
              />

              {/* Floating Subsystem Telemetry Callouts */}
              <SubsystemCallouts
                telemetry={currentReading}
                activeFault={activeFault}
                selectedSubsystem={selectedSubsystem}
                hoveredSubsystem={hoveredSubsystem}
                onSelectSubsystem={setSelectedSubsystem}
                onHoverSubsystem={setHoveredSubsystem}
              />

              {/* Orbit Status Panel in Top-Right */}
              <OrbitStatusPanel sensorsData={sensorsData} telemetry={currentReading} />

              {/* Attitude Indicator Widget in Bottom-Right */}
              <AttitudeIndicator />

              {/* Mission Signal HUD Strip */}
              <MissionSignalBar
                telemetry={currentReading}
                isConnected={isConnected}
                isPlaying={isPlaying}
              />
            </div>

            {/* Right: Inject Fault Panel */}
            <FaultControlPanel
              selectedFaultId={selectedFaultId}
              onSelectFault={handleSelectFault}
              severityPct={severityPct}
              onChangeSeverity={setSeverityPct}
              startMode={startMode}
              onChangeStartMode={setStartMode}
              delaySec={delaySec}
              onChangeDelaySec={setDelaySec}
              durationMode={durationMode}
              onChangeDurationMode={setDurationMode}
              tempDurationSec={tempDurationSec}
              onChangeTempDurationSec={setTempDurationSec}
              onInjectFault={handleInjectFault}
              injecting={injecting}
              injectSuccess={injectSuccess}
              feedbackText={feedbackText}
              errorMsg={errorMsg}
            />
          </div>

          {/* 3. Middle Row: Real-Time Telemetry with 3 ECharts and KPI Strips */}
          <TelemetryCharts
            telemetryData={telemetryData}
            selectedSubsystem={selectedSubsystem}
            hoveredSubsystem={hoveredSubsystem}
            isPlaying={isPlaying}
          />

          {/* 4. Bottom Row: Simulation Timeline + Event Log */}
          <div className="simulator-bottom-row">
            <SimulationTimeline
              timelineState={timelineState}
              onSelectIncident={(incId) => {
                if (incId) navigate(`/incidents/${incId}`);
                else navigate('/incidents');
              }}
            />

            <EventLog
              events={events}
              onClearEvents={() => setEvents([])}
            />
          </div>
        </main>
      </div>
    </div>
  );
}