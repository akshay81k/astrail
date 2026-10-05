# DATA CARD

## Intended use
Hackathon prototype for multivariate time-series anomaly detection,
root-cause analysis and safety recommendation.

## Synthetic generation
The synthetic telemetry is generated with deterministic random seed 20261005.
Normal signals contain periodic operational variation plus measurement noise.
Faults are injected as controlled temporal perturbations with known source
subsystem, affected signals and severity.

## Fault scenarios
F001 thermal runaway
F002 battery degradation
F003 reaction-wheel stiction
F004 communication degradation
F005 radiation upset
F006 payload overload
F007 sensor bias
F008 power-bus instability

## Imperfect measurement conditions
- ~0.8% random missing values per telemetry signal
- ~2% additional measurement-noise perturbations
- delayed packet indicators at a small controlled rate
- out-of-order indicator for larger delays

These are simulation conditions for evaluating the data-quality layer; they are
not claims about the exact statistics of NASA spacecraft operations.

## NASA benchmark
The NASA/JPL benchmark is kept as a separate reference layer because its
channels are anonymized and its telemetry values are pre-scaled. See
metadata/nasa_telemanom_labeled_anomalies.csv.
