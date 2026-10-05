# MODELING GUIDE

## Baseline
- Rolling z-score / robust deviation
- Isolation Forest

## Deep model
- LSTM autoencoder trained on normal sequences only
- Windowed reconstruction error
- Threshold learned from validation tail

## Cross-signal layer
Compute Pearson correlation and lagged cross-correlation on normal data.
During an alert, compare which signal changes first and which dependent
signals change later.

## Root-cause score
A practical hackathon score can combine:
1. normalized anomaly score
2. temporal lead score
3. graph centrality / dependency prior
4. number of downstream anomalies explained
5. persistence

## Safety
Risk is determined by the rule table plus severity of the incident. The
recommendation engine should produce:
- detected anomaly
- most likely source
- affected subsystems
- confidence
- risk level
- recommended safe action
- evidence signals

## Evaluation
Report at minimum:
- Precision
- Recall
- F1
- PR-AUC if feasible
- false alarms per 1,000 timestamps
- mean time to detect
- root-cause top-1 accuracy on injected faults
- affected-subsystem recall
