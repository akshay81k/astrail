import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { incidentApi } from '../api/incidentApi';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import IncidentHeader from '../components/IncidentHeader';
import RootCauseGraph from '../components/RootCauseGraph';
import PropagationTimeline from '../components/PropagationTimeline';
import RankedCauses from '../components/RankedCauses';
import IncidentExplanation from '../components/IncidentExplanation';
import EvidenceList from '../components/EvidenceList';
import RecommendedActions from '../components/RecommendedActions';
import IncidentActions from '../components/IncidentActions';

const FALLBACK_INCIDENT_014 = {
  id: '014',
  severity: 'CRITICAL',
  title: 'Thermal anomaly detected',
  detectedTime: '02:09:40',
  detectedDate: 'Oct 05, 2026',
  confidence: {
    value: 0.82,
    was: '92%',
    reason: 'Sensor 3 delayed for 40 seconds'
  },
  duration: '14m 36s',
  statusNote: '(Ongoing)',
  explanation: {
    title: 'Why Solar Array?',
    text: 'Solar current fell 18% below forecast at 02:09:40, then battery charge dropped 35 seconds later and battery temperature rose 6°C at 02:11:08. The solar array deviated first and the dependency graph links it to both downstream signals.'
  },
  evidence: [
    'Solar current deviated first (02:09:40)',
    'Battery charge responded after 35 s',
    'Thermal response followed (02:11:08)',
    'Dependency graph supports causal direction'
  ],
  recommendations: [
    {
      id: 1,
      number: 1,
      title: 'Reduce non-essential load',
      description: 'Lower payload and auxiliary systems load to reduce power demand.'
    },
    {
      id: 2,
      number: 2,
      title: 'Check heater status',
      description: 'Verify heater control signals and switch to redundant heater if available.'
    },
    {
      id: 3,
      number: 3,
      title: 'Enter safe mode if it persists > 10 min',
      description: 'If temperature continues to rise, enter safe mode to prevent further damage.'
    }
  ]
};

export default function IncidentDetail() {
  const { incidentId } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);

  useEffect(() => {
    async function fetchIncident() {
      try {
        setLoading(true);
        const res = await incidentApi.getIncident(incidentId);
        const data = res?.data || res;
        setIncident(data);
        setError(null);
      } catch (err) {
        // Fallback to default incident details if endpoint returns empty/404 for mock demo
        setIncident({ ...FALLBACK_INCIDENT_014, id: incidentId || '014' });
        setError(null);
      } finally {
        setLoading(false);
      }
    }
    fetchIncident();
  }, [incidentId]);

  const handleNodeSelect = (nodeId) => {
    setSelectedNodeId(nodeId);
  };

  const handleEventSelect = (eventId) => {
    setSelectedEventId(eventId);
    if (eventId === 'e1') setSelectedNodeId('solar');
    if (eventId === 'e2') setSelectedNodeId('battery');
    if (eventId === 'e3') setSelectedNodeId('thermal');
    if (eventId === 'e4') setSelectedNodeId('solar');
  };

  const activeIncident = incident || FALLBACK_INCIDENT_014;

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-layout">
        <main className="dashboard-content incident-detail-page">
          {loading ? (
            <div className="loading-skeleton-box">
              <div className="skeleton-line title"></div>
              <div className="skeleton-grid"></div>
            </div>
          ) : (
            <>
              <IncidentHeader incident={activeIncident} />

              <div className="incident-grid-top">
                <div className="graph-col">
                  <RootCauseGraph
                    nodes={activeIncident.graph?.nodes}
                    edges={activeIncident.graph?.edges}
                    selectedNodeId={selectedNodeId}
                    onNodeSelect={handleNodeSelect}
                  />
                </div>

                <div className="timeline-col">
                  <PropagationTimeline
                    events={activeIncident.propagation?.events}
                    selectedEventId={selectedEventId}
                    onEventSelect={handleEventSelect}
                  />

                  <RankedCauses
                    causes={activeIncident.rankedCauses}
                    onCauseSelect={(cause) => handleNodeSelect(cause.nodeId || 'solar')}
                  />
                </div>
              </div>

              <div className="incident-grid-bottom">
                <div className="explanation-evidence-col">
                  <IncidentExplanation explanation={activeIncident.explanation} />
                  <EvidenceList evidence={activeIncident.evidence} />
                </div>

                <div className="actions-recommendations-col">
                  <RecommendedActions actions={activeIncident.recommendations} />

                  <div className="bottom-action-buttons-wrapper">
                    <IncidentActions incidentId={activeIncident.id} />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}
