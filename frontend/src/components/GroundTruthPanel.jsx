import React from 'react';
import { Lock, Unlock, CheckCircle2 } from 'lucide-react';

export default function GroundTruthPanel({ groundTruth, isUnlocked = false }) {
  return (
    <div className="card ground-truth-card">
      <div className="card-header-with-number">
        <div className="step-number">4</div>
        <div>
          <h2 className="card-step-title">Ground Truth {isUnlocked ? '(Revealed)' : '(Hidden)'}</h2>
          <p className="card-step-subtitle">
            {isUnlocked
              ? 'Ground truth revealed following incident completion'
              : 'Ground truth information is hidden until the incident ends'}
          </p>
        </div>
      </div>

      {isUnlocked && groundTruth ? (
        <div className="ground-truth-unlocked-box">
          <div className="unlocked-header">
            <Unlock size={20} className="unlocked-icon" />
            <h3>Ground Truth Verification</h3>
          </div>
          <div className="truth-row">
            <strong>True Root Cause:</strong> <span>{groundTruth.rootCause || groundTruth.type}</span>
          </div>
          <div className="truth-row">
            <strong>Target Subsystem:</strong> <span>{groundTruth.targetSubsystem || groundTruth.target}</span>
          </div>
          <div className="truth-row">
            <strong>Injected Severity:</strong> <span>{Math.round((groundTruth.severity || 0.6) * 100)}%</span>
          </div>
        </div>
      ) : (
        <div className="ground-truth-locked-box">
          <div className="lock-icon-circle">
            <Lock size={22} className="lock-icon" />
          </div>
          <div className="lock-text-content">
            <p className="lock-main-text">
              Ground truth (root cause, affected subsystems, propagation chain) will be revealed here after the incident ends.
            </p>
            <p className="lock-sub-text">
              This information is used for evaluation and analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
