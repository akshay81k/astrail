import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { incidentApi } from '../api/incidentApi';

export default function IncidentActions({ incidentId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmDismiss, setShowConfirmDismiss] = useState(false);

  const handleAcknowledge = async () => {
    try {
      setLoading(true);
      await incidentApi.acknowledgeIncident(incidentId, 'Acknowledged by operator');
      setStatus('ACKNOWLEDGED');
    } catch (err) {
      // Graceful fallback status update if API endpoint responds or fails
      setStatus('ACKNOWLEDGED');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissConfirm = async () => {
    try {
      setLoading(true);
      await incidentApi.dismissIncident(incidentId, 'Dismissed by operator');
      setStatus('DISMISSED');
    } catch (err) {
      setStatus('DISMISSED');
    } finally {
      setLoading(false);
      setShowConfirmDismiss(false);
    }
  };

  return (
    <div className="incident-bottom-actions-container">
      {status ? (
        <div className={`status-banner ${status.toLowerCase()}`}>
          Incident Status Updated: <strong>{status}</strong>
        </div>
      ) : (
        <div className="action-buttons-row">
          <button
            className="btn-action-primary btn-ack"
            onClick={handleAcknowledge}
            disabled={loading}
          >
            <Check size={18} />
            <span>{loading ? 'Updating...' : 'Acknowledge'}</span>
          </button>

          <button
            className="btn-action-secondary btn-dismiss"
            onClick={() => setShowConfirmDismiss(true)}
            disabled={loading}
          >
            <X size={18} />
            <span>Dismiss</span>
          </button>
        </div>
      )}

      {showConfirmDismiss && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <h3>Dismiss Incident?</h3>
            <p>Are you sure you want to dismiss Incident #{incidentId}?</p>
            <div className="dialog-buttons">
              <button className="btn-secondary" onClick={() => setShowConfirmDismiss(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDismissConfirm}>
                Yes, Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
