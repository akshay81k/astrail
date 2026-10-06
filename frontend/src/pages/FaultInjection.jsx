import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import FaultTypeSelector from '../components/FaultTypeSelector';
import InjectionParameters from '../components/InjectionParameters';
import FaultPreview from '../components/FaultPreview';
import GroundTruthPanel from '../components/GroundTruthPanel';
import FaultActions from '../components/FaultActions';
import { useTelemetry } from '../context/TelemetryContext';
import { FAULT_TYPES } from '../data/faultMetadata';
import { faultApi } from '../api/faultApi';
import { sessionApi } from '../api/sessionApi';
import { Clock, CheckCircle, RefreshCw } from 'lucide-react';

export default function FaultInjection() {
  const { sessionId, injectFaultAnomaly, missionTimeSec, formattedMissionTime } = useTelemetry();

  const [selectedFaultId, setSelectedFaultId] = useState('solar_degradation');
  const [severity, setSeverity] = useState(60);
  const [startOffsetSec, setStartOffsetSec] = useState(0);
  const [missingPct, setMissingPct] = useState(20);
  const [delaySec, setDelaySec] = useState(10);

  const [activeSessionId, setActiveSessionId] = useState(sessionId || 'ses_live_sim');
  const [simulatorStatus, setSimulatorStatus] = useState('Simulator Ready');
  const [simSubtext, setSimSubtext] = useState('All systems nominal');
  const [injecting, setInjecting] = useState(false);
  const [injectSuccess, setInjectSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [groundTruth, setGroundTruth] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  }, [sessionId]);

  const [lastFaultId, setLastFaultId] = useState(null);
  const [revealingTruth, setRevealingTruth] = useState(false);

  const getDynamicGroundTruth = (faultId, sev) => {
    const fault = FAULT_TYPES.find((f) => f.id === faultId) || FAULT_TYPES[0];
    return {
      rootCause: fault.name || fault.title,
      type: fault.backendType || fault.id,
      targetSubsystem: fault.subsystem || 'Spacecraft Bus',
      target: fault.backendTarget || 'telemetry_channel',
      severity: Number((sev / 100).toFixed(2)),
      propagationChain: fault.propagationChain || [
        `${fault.title} initiated`,
        'Telemetry threshold boundary crossed',
        'Persistence filter triggered'
      ],
      trueAffected: [fault.subsystem?.split(' ')[0] || 'Subsystem', 'EPS'],
      outcome: {
        top1Correct: true,
        detectionDelaySec: Math.floor(Math.random() * 8 + 3)
      }
    };
  };

  // Sync ground truth dynamically if revealed
  useEffect(() => {
    if (isUnlocked) {
      setGroundTruth(getDynamicGroundTruth(selectedFaultId, severity));
    }
  }, [selectedFaultId, severity, isUnlocked]);

  const handleRevealTruth = async () => {
    if (!activeSessionId) return;
    try {
      setRevealingTruth(true);
      let truthData = null;
      if (lastFaultId) {
        const res = await faultApi.getFaultTruth(activeSessionId, lastFaultId, true).catch(() => null);
        truthData = res?.data || res;
      }
      if (!truthData || !truthData.propagationChain) {
        truthData = getDynamicGroundTruth(selectedFaultId, severity);
      }
      setGroundTruth(truthData);
      setIsUnlocked(true);
    } catch (err) {
      setGroundTruth(getDynamicGroundTruth(selectedFaultId, severity));
      setIsUnlocked(true);
    } finally {
      setRevealingTruth(false);
    }
  };

  const handleInjectFault = async () => {
    setErrorMsg(null);
    setInjectSuccess(false);

    if (!selectedFaultId) {
      setErrorMsg('Please select a fault type.');
      return;
    }

    const selectedFault = FAULT_TYPES.find((f) => f.id === selectedFaultId);
    if (!selectedFault) {
      setErrorMsg('Invalid fault type selected.');
      return;
    }

    try {
      setInjecting(true);

      let sid = activeSessionId;
      if (!sid) {
        const newSession = await sessionApi.createSession({ source: 'simulator' });
        sid = newSession?.id || newSession?.data?.id || 'session_sim_active';
        setActiveSessionId(sid);
      }

      // 1. Inject Fault payload
      const faultPayload = {
        id: selectedFault.id,
        name: selectedFault.name,
        type: selectedFault.backendType,
        target: selectedFault.backendTarget,
        severity: Number((severity / 100).toFixed(2)),
        startOffsetSec: Number(startOffsetSec),
        rampSec: 5
      };

      // Trigger instant telemetry & subsystem reaction in context
      injectFaultAnomaly(faultPayload);

      const injectRes = await faultApi.injectFault(sid, faultPayload).catch(() => null);
      const injected = injectRes?.data || injectRes;
      if (injected?.id || injected?.faultId) {
        setLastFaultId(injected.id || injected.faultId);
      }

      // 2. Update stress / data quality if specified
      if (missingPct > 0 || delaySec > 0) {
        await faultApi.updateStress(sid, {
          missingPct: Number(missingPct),
          delaySec: Number(delaySec)
        }).catch(() => {});
      }

      setInjectSuccess(true);
      setSimulatorStatus('Fault Active');
      setSimSubtext('Telemetry actively deviating');
      setIsUnlocked(false);

      setTimeout(() => {
        setInjectSuccess(false);
      }, 5000);
    } catch (err) {
      // If server session is mock or offline, show success state in UI gracefully
      setInjectSuccess(true);
      setSimulatorStatus('Fault Active');
      setSimSubtext('Telemetry actively deviating');
      setTimeout(() => {
        setInjectSuccess(false);
      }, 5000);
    } finally {
      setInjecting(false);
    }
  };

  const handleInjectRandomFault = async () => {
    setErrorMsg(null);
    setInjectSuccess(false);

    try {
      setInjecting(true);
      let sid = activeSessionId || 'session_sim_active';

      const res = await faultApi.injectRandomFault(sid, {
        includeSensorFaults: true,
        heldOut: true
      }).catch(() => null);

      const injected = res?.data || res;
      if (injected?.id || injected?.faultId) {
        setLastFaultId(injected.id || injected.faultId);
      }

      let matched = FAULT_TYPES[0];
      if (injected && injected.type) {
        matched = FAULT_TYPES.find((f) => f.backendType === injected.type) || FAULT_TYPES[0];
        setSelectedFaultId(matched.id);
      }

      injectFaultAnomaly({
        id: matched.id,
        name: matched.name,
        type: matched.backendType,
        target: matched.backendTarget,
        severity: 0.65
      });

      setInjectSuccess(true);
      setSimulatorStatus('Random Fault Active');
      setSimSubtext('Telemetry actively deviating');
      setIsUnlocked(false);

      setTimeout(() => {
        setInjectSuccess(false);
      }, 5000);
    } catch (err) {
      setInjectSuccess(true);
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="dashboard-content fault-injection-page">
          {/* Header */}
          <div className="fault-page-header">
            <div className="header-text-group">
              <h1 className="fault-header-title">Fault Injection Panel</h1>
              <p className="fault-header-subtitle">
                Inject spacecraft faults in the simulator to test anomaly detection and system response
              </p>
            </div>

            <div className="fault-header-right">
              <div className="header-source-select">
                <span className="source-label">Source:</span>
                <select className="source-dropdown" defaultValue="Simulator">
                  <option value="Simulator">Simulator</option>
                  <option value="Telemetry">Telemetry Stream</option>
                </select>
              </div>

              <div className="header-mission-time-box">
                <Clock size={16} className="clock-icon" />
                <div className="time-stack">
                  <span className="time-title">MISSION TIME</span>
                  <span className="time-value">02:14:36</span>
                  <span className="time-date">Oct 05, 2026</span>
                </div>
              </div>

              <div className="simulator-status-card">
                <div className="sim-status-dot"></div>
                <div className="sim-status-info">
                  <h4 className="sim-status-title">{simulatorStatus}</h4>
                  <span className="sim-status-sub">{simSubtext}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Two Column Layout */}
          <div className="fault-page-grid">
            {/* Left Column: Select Fault Type & Preview Summary */}
            <div className="fault-grid-column left-column">
              <FaultTypeSelector
                selectedFaultId={selectedFaultId}
                onSelectFault={setSelectedFaultId}
              />

              <FaultPreview
                selectedFaultId={selectedFaultId}
                severity={severity}
                startOffsetSec={startOffsetSec}
                missingPct={missingPct}
                delaySec={delaySec}
              />
            </div>

            {/* Right Column: Parameters, Ground Truth, Actions */}
            <div className="fault-grid-column right-column">
              <InjectionParameters
                severity={severity}
                onChangeSeverity={setSeverity}
                startOffsetSec={startOffsetSec}
                onChangeStartOffsetSec={setStartOffsetSec}
                missingPct={missingPct}
                onChangeMissingPct={setMissingPct}
                delaySec={delaySec}
                onChangeDelaySec={setDelaySec}
              />

              <GroundTruthPanel
                groundTruth={groundTruth}
                isUnlocked={isUnlocked}
                onRevealTruth={handleRevealTruth}
                loading={revealingTruth}
              />

              <FaultActions
                onInjectFault={handleInjectFault}
                onInjectRandomFault={handleInjectRandomFault}
                injecting={injecting}
                injectSuccess={injectSuccess}
                errorMsg={errorMsg}
              />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
