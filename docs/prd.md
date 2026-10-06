# PRD: Initium Spacecraft Health Monitor

| Field | Value |
|---|---|
| Product | Initium Spacecraft Health Monitor (explainable anomaly and root-cause engine) |
| Event | TechFest 2026-27, Space Technology Hackathon (24 h) |
| Problem statement | ST-01: Explainable On-Board Spacecraft Anomaly & Root-Cause Engine |
| Team | Initium (Akshay Kokate, Vinanti Mhatre, Yukta Chaudhari, Hitakshi Javia) |
| Document version | 1.0 (2026-10-05) |
| Status | Pre-build. Nothing is implemented yet. |

> **Reading note.** Every number in the "target" columns is a goal to be *measured and then reported honestly*. None of them is a result. If a measured number misses its target, we report the measured number.

---

## 1. Summary

Spacecraft send hundreds of housekeeping signals (voltages, temperatures, wheel speeds). Today most monitoring is limit checking: an alarm fires when one value crosses a red/yellow threshold. That is late, blind to patterns across sensors, and gives the operator an alarm, not a diagnosis.

We build a decision-support platform that **spots a problem early, decides whether it is real, finds the cause, and says how sure it is**. It then explains itself in plain language and recommends a ranked, safety-checked response to the human operator. It never commands the spacecraft.

### One-line pitch

> We tell sensor noise from sensor faults from real subsystem faults, we prove it with a measured false-alert rate, we diagnose by fitting physics hypotheses, and our confidence honestly drops when data goes missing.

---

## 2. Problem and context

| Weakness of today's approach | Consequence |
|---|---|
| Limit checking only fires after a threshold is crossed | Slow drifts and early signs are missed |
| Each signal is checked alone | Faults that show up only as a *pattern across sensors* are missed |
| ML detectors say "abnormal" and stop | No cause, no explanation, no action |
| Benchmarks assume clean, synchronized data | Real telemetry is noisy, late and has gaps |
| False-alert rate often unreported | Operators stop trusting the system |

The organizers' brief names the trap explicitly: **a system that flags anomalies but gives no root cause and no false-alert rate**. It also sets one hard constraint: **separate sensor noise from correlated subsystem faults and measure the false-alert rate**.

### How this is judged (organizer criteria)

Detection quality, explainability, root-cause reasoning, robustness. Judges are expected to feed a noisy or missing-value stream live and ask where the telemetry came from.

---

## 3. Goals and non-goals

### Goals

1. Detect faults earlier than limit checking, with a **calibrated** false-alert rate.
2. Classify each deviation as **noise**, **sensor fault** or **subsystem fault**.
3. Produce a **ranked list of root causes** with a severity estimate, validated against known injected faults.
4. Stay **robust** to noisy, missing and delayed data, with confidence that drops honestly.
5. Give an operator an explanation they can act on in **30 seconds**.
6. Back every claim with a **measured number** on screen.

### Non-goals

- Running on real spacecraft hardware or meeting flight-software standards. (The word "on-board" is in the title but is not a judged criterion. We design the algorithms to be lightweight, and we do not build embedded deployment.)
- Sending commands to a spacecraft. The system advises a human only.
- AWS or cloud deployment. The demo runs locally.
- Replacing flight-proven FDIR. We position as decision support that complements limit checking.
- COMMS, payload or propulsion subsystems in v1.

---

## 4. Users and scenarios

| User | Need | How we serve them |
|---|---|---|
| **Mission operator** (primary persona) | Know what is wrong, why, and what to do, quickly | Incident card: headline, evidence, cause with confidence, first action |
| **Judge** | See it work live on data they trust, and probe it | Fault injection panel, CSV upload, stress sliders, source label, evaluation page |
| **Spacecraft engineer** | Trust and audit the reasoning | Contribution charts, root-cause graph, propagation timeline, incident log |

### Core scenarios

1. **Early detection.** Operator watches normal telemetry. A solar-array degradation begins. The system alerts before any hard limit is crossed, while the limit checker stays silent.
2. **Diagnosis.** The incident view highlights the solar array as the source, marks affected downstream subsystems, shows the severity estimate ("solar output down about 22%") and a recommended action.
3. **Noise rejection.** A single sensor spikes briefly. The system classifies it as noise and raises no alert. The false-alert counter does not move.
4. **Sensor fault.** One channel drifts while its linked channels disagree. The system reports "Sensor X unreliable", not a spacecraft fault.
5. **Degraded data.** A 10-minute dropout on one sensor. The sensor is marked unavailable, confidence drops with a stated reason, and the diagnosis continues on the remaining channels.
6. **Live judge test.** A judge uploads their own CSV or moves the stress sliders. The pipeline must not crash.

---

## 5. Product principles

1. **Decision support, not autonomy.** Outputs are recommendations. Acknowledge and dismiss controls keep a human in the loop.
2. **Every claim has a number.** Metrics are visible in the product, not only in slides.
3. **Honest uncertainty.** Confidence is shown everywhere and explains why it changed. Unknown faults are reported as "unexplained", not forced into the nearest label.
4. **Never hide data problems.** Missing, stale and imputed data are visible per sensor.
5. **Source always visible.** The dashboard header always states where the data came from.
6. **Non-circular validation.** The simulator used as ground truth is deliberately messier than the simplified model used for diagnosis.

---

## 6. Scope and priorities

Priority key: **P0** must ship for the demo. **P1** adds clear judging value, build after P0. **P2** only if time remains.

### 6.1 Telemetry source and simulator

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| SIM-01 | Plant simulator with coupled power, thermal and attitude subsystems (about 14 channels) | P0 | Produces a normal orbit with eclipse cycle, plausible values, reproducible by seed |
| SIM-02 | Twin model (simplified) used only for hypothesis fitting | P0 | Runs a 10-minute window in under 100 ms |
| SIM-03 | Model mismatch between plant and twin (configurable level) | P0 | Mismatch levels 0, medium, high selectable for evaluation |
| SIM-04 | Fault library: solar degradation, heater stuck on, battery degradation, wheel friction, radiator degradation | P0 | Each fault has severity, onset, ramp time and a stored ground-truth record |
| SIM-05 | Sensor faults: drift, stuck, spike; plus benign noise bursts | P0 | Each is injectable on any channel |
| SIM-06 | Slow-drift fault scenario | P1 | Limit checker stays silent for at least the first part of the drift while the detector flags it |
| SIM-07 | Random scenario generator with held-out severity and onset ranges | P0 | Generates N labelled runs for evaluation |
| SIM-08 | Scripted demo scenarios with fixed seeds | P0 | One click replays a deterministic demo |
| SIM-09 | Orbit propagator (circular LEO, ground track, eclipse intervals) | P1 | Drives eclipse flag and the orbit view |
| DATA-01 | Replay of NASA SMAP/MSL channels | P0 | Streams a channel through the same dashboard |
| DATA-02 | CSV upload with column mapping | P0 | Accepts unseen column names, NaNs and irregular timestamps without crashing |
| DATA-03 | OPSSAT-AD import | P2 | Segments loadable for a real-data check |
| DATA-04 | ESA-ADB slice import | P2 | Only if downloaded in advance |

### 6.2 Data-quality layer

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| DQ-01 | Time alignment onto a fixed grid | P0 | Irregular and multi-rate inputs are resampled |
| DQ-02 | Missing-value handling with explicit mask | P0 | Gaps are flagged, not silently filled |
| DQ-03 | Out-of-order and late packet handling (reorder buffer) | P0 | Late packets inside the buffer window are placed correctly |
| DQ-04 | Per-sensor status: OK, DELAYED, MISSING, NOISY, UNAVAILABLE | P0 | Visible per sensor in the UI |
| DQ-05 | Long-dropout policy (a 10-minute gap) | P0 | Sensor becomes UNAVAILABLE after N seconds, excluded or estimated, confidence reduced, gap logged, clean resume |
| DQ-06 | Data-quality score feeding confidence | P0 | Score shown and used in the confidence breakdown |
| DQ-07 | Stress controls: missing %, noise scale, delay, jitter, out-of-order %, channel dropout | P0 | Applied live to any source |

### 6.3 Detection

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| DET-01 | GRU next-step predictor trained on normal data only, using sensor dropout and delay augmentation | P0 | Residuals computed per channel |
| DET-02 | Anomaly score from normalized residuals | P0 | Score streamed with the telemetry |
| DET-03 | Conformal threshold for a chosen false-alarm rate | P0 | Chosen rate set in the UI; measured rate reported next to it |
| DET-04 | Persistence rule (k of n flagged samples) | P0 | Single-sample blips do not raise an alert |
| DET-05 | Isolation Forest as a second opinion | P1 | Agreement shown in the incident and used in confidence |
| DET-06 | CUSUM or EWMA on residuals for slow drifts | P1 | Flags the slow-drift scenario |
| DET-07 | Regime-conditional calibration (sunlight vs eclipse) | P1 | Separate thresholds per regime |
| DET-08 | Limit-checking baseline running in parallel | P0 | Same data, same time axis, for lead-time comparison |
| DET-09 | Generic mode for foreign streams (warm-up fit) | P0 | Uploaded data gets detection without simulator-trained weights |

### 6.4 Noise vs sensor fault vs subsystem fault

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| CLS-01 | Cross-sensor consistency checks (analytical redundancy between linked signals) | P0 | Linked sensors can contradict a suspect sensor |
| CLS-02 | Shallow decision tree over episode features | P0 | Outputs one of three classes with a readable rule path |
| CLS-03 | Classification confusion matrix on the evaluation page | P0 | Measured on labelled simulator episodes |

### 6.5 Root cause

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| RCA-01 | Dependency graph of subsystems and signals with lag bounds | P0 | Editable data file, visualized in the UI |
| RCA-02 | Onset ordering (which signal moved first) as fast pre-filter and as part of the explanation | P0 | Ordered list with timestamps |
| RCA-03 | Hypothesis fitting: run the twin per candidate cause, fit severity, rank by fit | P0 | Ranked causes with posterior and severity estimate |
| RCA-04 | "Unexplained" outcome when no hypothesis fits | P0 | Honest fallback shown, not a forced guess |
| RCA-05 | Progressive diagnosis (re-fit as more post-onset data arrives) | P1 | Confidence evolves while the incident is open |
| RCA-06 | Projected time-to-limit from the fitted twin | P1 | "Battery temp reaches limit in about N min" |
| RCA-07 | Propagation timeline | P0 | Ordered events per affected signal |

### 6.6 Explainability and response

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| EXP-01 | Per-channel contribution to the anomaly | P0 | Bar chart per incident |
| EXP-02 | Four-line explanation card: headline, evidence, cause with confidence, first action | P0 | Readable aloud in under 30 seconds |
| EXP-03 | Confidence with a breakdown and a reason string | P0 | For example "92% to 71% because sensor 3 was missing for 40 s" |
| EXP-04 | TreeSHAP for the Isolation Forest | P1 | Secondary feature-importance view |
| EXP-05 | "Why not the runner-up cause?" comparison | P2 | Side-by-side fit residuals |
| REC-01 | FMEA rule table: cause to ranked actions | P0 | Every injectable fault maps to at least one action |
| REC-02 | Risk level: Low, Medium, High, Critical | P0 | Computed from severity, propagation and margin to limit |
| REC-03 | Safety checks on recommendations (contraindication rules) | P1 | Unsafe suggestions are filtered, with the reason shown |
| REC-04 | Escalation rule ("safe mode if it persists for N minutes") | P1 | Visible in the action list |
| REC-05 | Acknowledge and dismiss with a note | P0 | State persisted in the incident log |

### 6.7 Dashboard and visualization

| ID | Feature | Pri | Acceptance criterion |
|---|---|---|---|
| UI-01 | Mission control view: live charts, anomaly markers, score with threshold, alert panel | P0 | Stays smooth at x60 playback |
| UI-02 | Playback controls: play, pause, speed (x1 to x60), reset; mission clock | P0 | Always visible |
| UI-03 | Subsystem health overview (green, amber, red) | P0 | Updates with incidents |
| UI-04 | Sensor status strip | P0 | Reflects DQ-04 |
| UI-05 | Fault injection drawer | P0 | Type, target, severity, start, ramp; inject and random |
| UI-06 | Stress panel (DQ-07) | P0 | Applies live |
| UI-07 | Incident detail: root-cause graph, ranked causes, timeline, explanation, actions | P0 | Reached from any alert |
| UI-08 | Limit-check vs detector comparison with lead time | P0 | Shows the gap in seconds |
| UI-09 | False-alert counter on the main screen | P0 | Reads "n alerts on fault-free time, over d simulated days" |
| UI-10 | Evaluation page with the four headline experiments | P0 | Reads stored results |
| UI-11 | Incident log with filters | P1 | Filter by severity and status |
| UI-12 | Data source badge in the header | P0 | Always visible |
| UI-13 | CSV upload and mapping modal | P0 | Works end to end |
| UI-14 | Correlation heatmap | P1 | Live or per incident |
| UI-15 | Orbit view with ground track and eclipse shading | P2 | Cesium |
| UI-16 | 3D spacecraft view with subsystem health colouring | P2 | Three.js |
| UI-17 | Judge mode (larger text, dev panels hidden) | P2 | One toggle |
| UI-18 | Downloadable incident report | P2 | Markdown or PDF |

### 6.8 Evaluation

| ID | Experiment | Pri | Output |
|---|---|---|---|
| EVAL-01 | Detection on SMAP/MSL, event-level precision, recall, F1 | P0 | Table and per-channel chart |
| EVAL-02 | Root-cause top-1 and top-3 accuracy on randomized simulator faults, across mismatch levels | P0 | Table and confusion matrix |
| EVAL-03 | False-alert rate vs noise level for three systems: limit checking, detector alone, detector plus noise logic | P0 | Line chart |
| EVAL-04 | F1 vs percentage of missing data | P0 | Line chart |
| EVAL-05 | Noise vs sensor vs subsystem classification accuracy | P0 | Confusion matrix |
| EVAL-06 | Detection lead time vs limit checking | P0 | Distribution plot |
| EVAL-07 | Severity estimate error | P1 | MAE in percent |
| EVAL-08 | Confidence calibration (reliability diagram) | P1 | Confidence vs observed accuracy |
| EVAL-09 | F1 vs delay and vs noise | P1 | Line charts |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Responsiveness | Telemetry frames reach the browser within 200 ms of generation at x1 to x60 |
| Rendering | Charts stay interactive at 5 frame updates per second with 14 channels |
| Diagnosis latency | First ranked causes within 3 s of the post-onset evidence window being available |
| Robustness | Never crash on NaN, missing columns, irregular timestamps, empty files or very short files |
| Reproducibility | Every simulator run, scenario and evaluation result is seeded and re-runnable |
| Offline operation | Demo runs with no internet: bundled fonts, bundled map imagery, local database |
| Honesty | Unknown or low-confidence outcomes are shown as such |
| Privacy and safety | No secrets in the repository. Upload size and type validated. |
| Browser | Latest Chrome or Edge on a laptop. Mobile is not a target. |

---

## 8. ML requirements

| Requirement | Detail |
|---|---|
| Detector training data | Normal simulator runs only, with randomized parameters, sensor dropout and delay augmentation |
| Calibration | Held-out normal runs, including stressed conditions, kept separate from training |
| False-alarm control | Target rate chosen by the user. Measured sample-level and episode-level rates reported. The conformal guarantee is exact only for exchangeable data. Telemetry is autocorrelated, so the rate is verified empirically on fresh runs and reported as measured. |
| Root cause | Physics-hypothesis fitting on the twin, with onset ordering as the fast pre-filter |
| Non-circularity | Plant is messier than the twin. Accuracy is reported at several mismatch levels. |
| Generic mode | For foreign streams, models are fitted on a warm-up segment. Root cause falls back to onset ordering and learned correlations, and the UI labels it "heuristic only". |
| Explainability | Residual-based contributions, rule path from the decision tree, fit residuals per hypothesis, template-based text |

### Targets (goals to measure, not results)

| Metric | Target |
|---|---|
| Simulator root-cause top-1 | 80% or better at medium mismatch |
| Simulator root-cause top-3 | 95% or better at medium mismatch |
| False alerts on fault-free runs | At or below the chosen target rate (default: 1 per simulated day) |
| Lead time vs limit checking | Positive on the slow-drift and solar scenarios |
| F1 at 30% missing data | Within 15% (relative) of F1 at 0% missing |
| Noise vs sensor vs subsystem accuracy | 90% or better on simulator episodes |

If a target is missed, the evaluation page shows the real number and we explain why in the pitch.

---

## 9. Data

| Source | Use | Notes |
|---|---|---|
| **Our simulator** | Training, calibration, root-cause validation, live demo, fault scenarios | Only source with ground-truth fault origin |
| **NASA SMAP/MSL** | Detection benchmark on real data | Channels are anonymized, so it cannot validate root cause. Described in the deck as "real spacecraft telemetry used to benchmark detection". |
| **OPSSAT-AD** (optional) | Small real-data check | Segment-based |
| **ESA-ADB** (optional) | Stronger real-data claim | Files are several GB each, so download before the event or skip |
| **User CSV upload** | Judge test | Handled by generic mode |

Licenses and citations are recorded in the repository `README` and the deck.

---

## 10. Demo plan

### Script (about 3 minutes)

1. Header shows "Source: Simulator". Normal telemetry streams. The false-alert counter is visible.
2. Switch to x4 and inject a solar degradation fault.
3. The detector alerts early. The limit-check lane stays silent. The lead-time bar appears.
4. Open the incident. The graph shows the source and affected subsystems. Read the four-line card aloud.
5. Apply a 10-minute dropout to one sensor. Confidence drops and the reason string names the sensor.
6. Inject a single-sensor spike. It is classified as noise and raises no alert.
7. Let a judge upload or choose a fault. Show that it handles it.
8. Close on the evaluation page: root-cause accuracy, false-alert curve, robustness curve.

A pre-recorded backup video is mandatory.

### Judge questions and where the answer lives

| Question | Answer location |
|---|---|
| False-alert rate, measured on what data? | UI-09 counter and EVAL-03 chart, with the data described |
| One noisy sensor vs a real multi-subsystem fault? | CLS decision tree and rule path, shown live |
| Read one alert aloud. Can an operator act in 30 seconds? | EXP-02 four-line card |
| Late packets or a 10-minute dropout? | DQ-05 policy shown live |
| Where did the telemetry come from? | UI-12 source badge and the data table above |
| Is root-cause accuracy circular? | Plant vs twin mismatch (SIM-03) and EVAL-02 across levels |

---

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Too much scope for 24 h | High | P0 first. Cut P2 without discussion. End-to-end crude pipeline by hour 12. |
| Hypothesis fitting too slow | Medium | Onset-order pre-filter limits candidates. Twin is vectorized. 1-D severity fit only. |
| Root-cause accuracy looks circular | Medium | Plant/twin mismatch, multiple mismatch levels, "unexplained" outcome |
| GRU does not catch slow drift | Medium | CUSUM on residuals (DET-06) |
| Conformal guarantee not met on autocorrelated data | Medium | Verify on fresh runs, report measured rate, tune persistence |
| Judge supplies unseen data | High | Generic mode, tolerant parser, tested with unseen SMAP/MSL channels |
| Too many chart libraries inflate bundle and effort | Medium | Assign each a narrow role, lazy-load heavy ones, P2 for Cesium and Three.js |
| Live demo failure | Medium | Scripted seeded scenarios, backup video, local-only stack |
| Python/Node integration friction | Medium | Python owns the stream and Node relays. Contracts fixed up front in `apiendpoints.md`. |
| Venue network fails | Medium | Everything local, assets bundled, datasets downloaded in advance |

---

## 12. 24-hour plan

Suggested roles (reassign to fit skills):

| Role | Owns |
|---|---|
| A: Simulation and root cause | Simulator, twin, fault library, hypothesis fitting, FMEA table |
| B: Detection ML | Data-quality layer, GRU, conformal, Isolation Forest, CUSUM, classification tree, SMAP/MSL benchmark |
| C: Backend | Node API, MongoDB, Socket.IO bridge, uploads, evaluation endpoints, Python integration |
| D: Frontend and pitch | React app, charts, graph, incident view, deck and demo |

| Hours | Milestone |
|---|---|
| 0-2 | Repo, contracts, signal catalog, dependency graph file, seeded run scaffold |
| 2-6 | Plant and twin simulator producing normal data. Node and React skeleton talking to Python. |
| 6-10 | GRU trained, residuals, conformal threshold, persistence. Live chart with anomaly score. |
| 10-12 | **End-to-end crude pipeline** (inject fault, alert, incident card) |
| 12-16 | Classification tree, onset ordering, hypothesis fitting, explanation and FMEA |
| 16-19 | Isolation Forest, CUSUM, stress controls, CSV upload and generic mode |
| 19-22 | Evaluation experiments, evaluation page, comparison view, polish |
| 22-23 | P2 items only if everything above is stable. Demo rehearsal. |
| 23-24 | Freeze code. Record backup video. Final pitch rehearsal. |

Rules: no AWS or Docker deployment work. Freeze features at hour 22. Do not perfect one module while others do not exist.

---

## 13. Open questions and assumptions

- Assumed sampling rate: 1 Hz in the simulator, with orbit period about 95 minutes.
- Assumed a laptop demo with no internet.
- The team should confirm dataset licenses and the exact download links before the event.
- Whether a time-series database is used is optional. MongoDB time-series collections satisfy the "time-series store" suggestion.
- The `Cesium` and `Three.js` views are P2. If skipped, the deck should not promise them.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| Telemetry | Stream of health readings a spacecraft sends down |
| Limit checking | Classic red/yellow threshold alert |
| FDIR | Fault Detection, Isolation and Recovery |
| Safe mode | Minimal, sun-pointed, do-no-harm configuration |
| FMEA | Failure Modes and Effects Analysis, here a table mapping cause to action |
| Conformal prediction | Method to set a threshold from calibration data to hit a chosen error rate |
| Persistence rule | Require k of the last n samples flagged before alerting |
| CUSUM | Cumulative-sum test that accumulates small shifts to catch slow drifts |
| Plant | The "true" simulator used to generate data and ground truth |
| Twin | The simplified model used for hypothesis fitting |
| False-alert rate | Alert episodes raised on fault-free data per simulated day |
| Lead time | Time between our alert and the limit-check alarm |
