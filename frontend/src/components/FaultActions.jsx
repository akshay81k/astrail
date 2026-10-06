import React from "react";
import { Zap, Dices, CheckCircle2, AlertCircle } from "lucide-react";

export default function FaultActions({
  onInjectFault,
  onInjectRandomFault,
  injecting,
  injectSuccess,
  errorMsg,
}) {
  return (
    <div className="card fault-actions-card">
      <div className="card-header-with-number">
        <div className="step-number">5</div>
        <div>
          <h2 className="card-step-title">Actions</h2>
          <p className="card-step-subtitle">
            Inject the configured fault or generate a random fault
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="action-error-banner">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {injectSuccess && (
        <div className="action-success-banner">
          <CheckCircle2 size={16} />
          <span>Fault injected successfully into simulator session!</span>
        </div>
      )}

      <div className="actions-button-group">
        <button
          className="btn-inject-primary"
          onClick={onInjectFault}
          disabled={injecting}
        >
          <Zap size={18} />
          <span>{injecting ? "Injecting..." : "Inject Fault"}</span>
        </button>

        <button
          className="btn-random-secondary"
          onClick={onInjectRandomFault}
          disabled={injecting}
        >
          <Dices size={18} />
          <span>Random Fault</span>
        </button>
      </div>
    </div>
  );
}
