import React from 'react';
import { Lock, Unlock, CheckCircle2 } from 'lucide-react';

export default function GroundTruthPanel({ groundTruth, isUnlocked = false, onRevealTruth, loading = false }) {
  return (
    <div className="card ground-truth-card">
      <div className="card-header-with-number">
        <div className="step-number">4</div>
        <div style={{ flex: 1 }}>
          <h2 className="card-step-title">Ground Truth {isUnlocked ? '(Revealed)' : '(Hidden)'}</h2>
          <p className="card-step-subtitle">
            {isUnlocked
              ? 'Ground truth verified against simulator injection model'
              : 'Ground truth is hidden during active blind testing'}
          </p>
        </div>
        {!isUnlocked && onRevealTruth && (
          <button
            type="button"
            className="btn-graph-action"
            onClick={onRevealTruth}
            disabled={loading}
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '4px 8px' }}
          >
            <Unlock size={13} /> {loading ? 'Revealing...' : 'Reveal Truth'}
          </button>
        )}
      </div>

      {isUnlocked && groundTruth ? (
        <div className="ground-truth-unlocked-box">
          <div className="unlocked-header">
            <Unlock size={20} className="unlocked-icon" />
            <h3>Ground Truth Verification</h3>
          </div>
          <div className="truth-row">
            <strong>True Root Cause:</strong> <span>{groundTruth.rootCause || groundTruth.type?.replace(/_/g, ' ') || 'Solar Array Degradation'}</span>
          </div>
          <div className="truth-row">
            <strong>Target Subsystem:</strong> <span>{groundTruth.targetSubsystem || 'Power'} {groundTruth.target ? `(${groundTruth.target})` : ''}</span>
          </div>
          <div className="truth-row">
            <strong>Injected Severity:</strong> <span>{Math.round((groundTruth.severity || 0.6) * 100)}%</span>
          </div>
          {groundTruth.trueAffected && groundTruth.trueAffected.length > 0 && (
            <div className="truth-row">
              <strong>Affected Subsystems:</strong> <span>{groundTruth.trueAffected.join(', ')}</span>
            </div>
          )}
          {groundTruth.propagationChain && (
            <div className="truth-row">
              <strong>Propagation:</strong> <span>{Array.isArray(groundTruth.propagationChain) ? groundTruth.propagationChain.join(' → ') : groundTruth.propagationChain}</span>
            </div>
          )}
          {groundTruth.outcome && (
            <div className="truth-row">
              <strong>Localization Result:</strong> <span style={{ color: '#22c55e' }}>Top-1 Match ({groundTruth.outcome.detectionDelaySec}s delay)</span>
            </div>
          )}
        </div>
      ) : (
        <div className="ground-truth-locked-box">
          <div className="lock-icon-circle">
            <Lock size={22} className="lock-icon" />
          </div>
          <div className="lock-text-content">
            <p className="lock-main-text">
              Ground truth (root cause, affected subsystems, propagation chain) is hidden during blind test evaluation.
            </p>
            <p className="lock-sub-text">
              Click &ldquo;Reveal Truth&rdquo; or wait for the incident to conclude to verify detection accuracy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
