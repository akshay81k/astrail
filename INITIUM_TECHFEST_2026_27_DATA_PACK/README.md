# INITIUM — TECHFEST 2026–27 Space Technology Hackathon Data Pack

## What this package is for
This package is designed around the uploaded TECHFEST Round-1 problem:
**Explainable On-Board Spacecraft Anomaly & Root-Cause Engine**.

The prompt explicitly calls for:
- NASA SMAP and NASA MSL real telemetry
- simulated/fault-injected telemetry
- missing data, noise, delay and out-of-order handling
- anomaly detection
- cross-signal correlation
- dependency-graph/root-cause analysis
- risk/safety assessment
- response recommendations.

## IMPORTANT DATA-PROVENANCE RULE
There are two intentionally separate layers:

### A. NASA benchmark reference
`metadata/nasa_telemanom_labeled_anomalies.csv`
contains the public anomaly metadata from the NASA/JPL Telemanom release.
The benchmark has 82 anonymized telemetry channels (55 SMAP + 27 MSL), with
105 labeled anomaly sequences. Its telemetry values are pre-scaled and channel
IDs are anonymized.

The package does NOT rename those anonymized NASA channels into invented
engineering names. This prevents us from falsely presenting synthetic
engineering signals as raw NASA measurements.

Use `scripts/download_nasa_telemanom.py` to retrieve the public raw benchmark
when network access is available.

### B. Engineering-friendly fault-injection dataset
`data/synthetic_telemetry_clean.csv`
and
`data/synthetic_telemetry_imperfect.csv`
are ORIGINAL SYNTHETIC DATA generated for the hackathon prototype.

They are NOT NASA telemetry.

They are deliberately structured to support the hackathon's proposed:
POWER, THERMAL, ATTITUDE, COMMUNICATIONS, COMPUTE, RADIATION and PAYLOAD
dependency graph and to demonstrate controlled propagation/root-cause
experiments.

## Dataset size
- 80,000 timestamped telemetry rows
- 23 engineering telemetry signals + mission metadata + labels
- 8 controlled fault events
- Clean and imperfect versions
- Missing values, measurement noise, delay and out-of-order indicators
- Event-level ground truth for root-cause evaluation

## Files

data/
- synthetic_telemetry_clean.csv
- synthetic_telemetry_imperfect.csv
- fault_events_ground_truth.csv

metadata/
- signal_catalog.csv
- dependency_graph.csv
- risk_action_rules.csv
- nasa_telemanom_labeled_anomalies.csv

scripts/
- download_nasa_telemanom.py

docs/
- DATA_CARD.md
- MODELING_GUIDE.md

## Recommended ML use
1. Train anomaly detector on NORMAL rows from the synthetic clean data.
2. Evaluate on fault-injected rows.
3. Repeat using the imperfect dataset to demonstrate robustness.
4. Use Pearson/cross-correlation for signal relationships.
5. Use dependency_graph.csv as the prior graph for root-cause scoring.
6. Rank candidate causes using anomaly score + graph proximity + temporal lead.
7. Map the winning cause to risk_action_rules.csv.
8. For the NASA benchmark, train/evaluate separately because its channel
   semantics and preprocessing are different.

## Avoid a common hackathon mistake
Do not claim that `power_bus_voltage_V`, `battery_temperature_C`, etc. are
NASA SMAP/MSL raw channels. They are synthetic engineering signals.

A defensible presentation statement is:
> "We benchmark anomaly detection against the public NASA SMAP/MSL telemetry
> dataset and use a controlled fault-injection simulator to expose subsystem
> dependencies, root-cause propagation and safety recommendations."

## Source links
NASA/JPL Telemanom:
https://github.com/khundman/telemanom

NASA SMAP mission repository:
https://podaac.jpl.nasa.gov/SMAP

NASA MSL Planetary Data System:
https://pds.nasa.gov/

NASA/JPL Telemanom data archive:
https://s3-us-west-2.amazonaws.com/telemanom/data.zip

NASA/JPL Telemanom anomaly labels:
https://raw.githubusercontent.com/khundman/telemanom/master/labeled_anomalies.csv
