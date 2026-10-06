import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { incidentApi } from "../api/incidentApi";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";
import IncidentHeader from "../components/IncidentHeader";
import RootCauseGraph from "../components/RootCauseGraph";
import PropagationTimeline from "../components/PropagationTimeline";
import RankedCauses from "../components/RankedCauses";
import IncidentExplanation from "../components/IncidentExplanation";
import EvidenceList from "../components/EvidenceList";
import RecommendedActions from "../components/RecommendedActions";
import IncidentActions from "../components/IncidentActions";



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
        setError(err.message || "Failed to load incident details");
        setIncident(null);
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
    if (incident?.propagation?.events) {
      const match = incident.propagation.events.find(e => e.id === eventId);
      if (match?.nodeId) setSelectedNodeId(match.nodeId);
    }
  };

  const activeIncident = incident;

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
          ) : error || !activeIncident ? (
            <div className="card" style={{ padding: "40px", textAlign: "center", margin: "40px auto", maxWidth: "600px" }}>
              <h2 style={{ color: "#ef4444", marginBottom: "12px" }}>Incident Not Found</h2>
              <p style={{ color: "#94a3b8", marginBottom: "20px" }}>The requested incident ID (#{incidentId}) is not active or has been resolved.</p>
              <button className="btn-primary" onClick={() => navigate('/incidents')} style={{ padding: "8px 16px" }}>
                Return to Incidents List
              </button>
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
                    events={activeIncident.propagation}
                    selectedEventId={selectedEventId}
                    onEventSelect={handleEventSelect}
                  />

                  <RankedCauses
                    causes={activeIncident.rankedCauses}
                    onCauseSelect={(cause) =>
                      handleNodeSelect(cause.nodeId || "source")
                    }
                  />
                </div>
              </div>

              <div className="incident-grid-bottom">
                <div className="explanation-evidence-col">
                  <IncidentExplanation
                    explanation={activeIncident.explanation}
                    rootCause={activeIncident.root_cause_analysis}
                  />
                  <EvidenceList evidence={activeIncident.evidence} />
                </div>

                <div className="actions-recommendations-col">
                  <RecommendedActions
                    actions={activeIncident.recommendations}
                  />

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
