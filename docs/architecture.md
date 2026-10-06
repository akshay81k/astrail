# Architecture: Initium Spacecraft Health Monitor

Companion documents: `prd.md` (what and why), `techstack.md` (libraries), `apiendpoints.md` (contracts).

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────────────────┐
                         │                     React client (Vite)                  │
                         │  Pages: MissionControl · IncidentDetail · Comparison ·   │
                         │         Evaluation · IncidentLog · OrbitView (P2)        │
                         │  State: Zustand · Data: React Query · Realtime: Socket.IO│
                         └───────────────┬──────────────────────▲───────────────────┘
                                REST     │                      │  Socket.IO (/live)
                                         ▼                      │
                         ┌──────────────────────────────────────┴───────────────────┐
                         │                Node + Express (API gateway)               │
                         │  Routes · Validation · Uploads · Stream bridge · Socket   │
                         │  hub · Incident service · Evaluation service              │
                         └───────┬──────────────────────┬───────────────────────────┘
                                 │ Mongoose             │ REST + WebSocket
                                 ▼                      ▼
                         ┌──────────────┐     ┌──────────────────────────────────────┐
                         │   MongoDB    │     │        Python FastAPI ML service      │
                         │ time-series  │     │ Simulator · Data quality · Detection  │
                         │ + documents  │     │ Classification · Root cause · Explain │
                         └──────────────┘     │ Evaluation · Generic mode             │
                                              └───────────────┬──────────────────────┘
                                                              │ files
                                                              ▼
                                              ┌──────────────────────────────────────┐
                                              │ models/ (GRU, IF, tree, conformal)    │
                                              │ data/ (SMAP/MSL, uploads, generated)  │
                                              └──────────────────────────────────────┘
```

### Responsibilities

| Component | Owns | Does not own |
|---|---|---|
| **React client** | Presentation, interaction, chart rendering, local ring buffers | Any analysis |
| **Node server** | Public API, validation, uploads, persistence, Socket.IO fan-out, incident lifecycle (ack, dismiss, close), evaluation storage | ML logic, simulation |
| **Python service** | Simulation clock, telemetry generation and replay, data-quality layer, detection, classification, root cause, explanation, recommendation, evaluation jobs | Persistence beyond files, user-facing API |
| **MongoDB** | Sessions, telemetry history, anomalies, incidents, faults, evaluation results, uploads | Business logic |

**Key decision: Python owns the session clock and the live pipeline.** Pipeline state (windows, conformal state, persistence counters, CUSUM sums, open episodes) lives in Python memory per session. Node relays and persists. This avoids a chatty tick-by-tick HTTP loop and keeps state in one place.

---

## 2. Runtime flows

### 2.1 Live loop (per session)

```
Python session loop (wall-clock paced, speed-multiplied)
  1. Source produces raw samples for the next simulated seconds
        simulator: plant.step()  | replay: next rows | upload: next rows
  2. Stress applied (missing, noise scale, delay, jitter, out-of-order, dropout)
  3. Data-quality layer: reorder buffer → align to 1 Hz grid → mask → status → impute-for-model
  4. Detector: GRU forecast → residual → score → conformal threshold → persistence
              IF score → CUSUM/EWMA (slow path) → limit-check baseline (parallel)
  5. Episode manager: opens, updates, closes episodes
  6. On episode open: classifier (noise / sensor / subsystem)
        noise          → suppress, count, no incident
        sensor / subs. → create incident (analyzing)
  7. RCA scheduler: after evidence window, run hypothesis fitting; repeat while open
  8. Explanation + risk + recommendations assembled
  9. Emit frames and events on WS → Node → Mongo + Socket.IO → client
```

Frame batching: simulated ticks are grouped so the browser receives at most about 5 frames per second regardless of speed.

### 2.2 Incident lifecycle

```
episode opened
   │
   ├─ class = noise ─────────────► suppressed (stored, counted, no alert)
   │
   └─ class = sensor / subsystem
        │
        ▼
   incident: analyzing   (headline from onset ordering + contributions, "diagnosing…")
        │  evidence window filled (default 60 to 120 s after onset)
        ▼
   incident: open        (ranked causes, confidence, explanation, actions)
        │  refit every 30 s while episode is active → confidence and ranks update
        ├─► acknowledged  (operator)
        ├─► dismissed     (operator, with note)
        └─► closed        (episode ended and operator closes, or auto-close after quiet period)
```

### 2.3 Fault injection

The fault is added to the plant's schedule as an event with onset, ramp and severity. Ground truth is stored immediately but hidden from the UI until the linked incident is acknowledged, dismissed or closed, or judge mode forces reveal.

---

## 3. ML architecture

### 3.1 Pipeline at a glance

```
raw telemetry
   │
   ▼
[0] Data-quality layer ──► aligned values + mask + sensor status + quality score
   │
   ▼
[1] Normal-behaviour model (GRU)  ─┐
    Isolation Forest (2nd opinion) ├─► anomaly score per tick
    CUSUM / EWMA on residuals     ─┘
   │
   ▼
[2] Conformal threshold + persistence ──► anomaly episode
   │
   ▼
[3] Noise / sensor fault / subsystem fault  (cross-sensor checks + decision tree)
   │
   ▼
[4] Root cause by hypothesis fitting on the twin (onset ordering as pre-filter)
   │
   ▼
[5] Confidence (honest, drops with missing data)
   │
   ▼
[6] Explanation (templates) + risk + FMEA recommendations + safety checks
```

### 3.2 Step 0: Data-quality layer

Purpose: make imperfect input safe for the models, and never hide the imperfection.

| Stage | Behaviour |
|---|---|
| Reorder buffer | Holds samples for a short window (default 15 s) so slightly late or out-of-order packets are placed correctly. Later arrivals are logged as late and dropped from the live path. |
| Grid alignment | Resample all channels to 1 Hz using last observation within a tolerance. Slower channels are marked with their native step. |
| Mask | `mask[c,t] = 1` if a real sample arrived for channel `c` at tick `t`, else 0. |
| Imputation (for model input only) | Hold the last value for short gaps (up to 10 s). For longer gaps, fill with the model's own prediction or the training mean and keep the mask at 0. Imputed values are never shown as real data. |
| Sensor status | `ok`, `delayed` (late but arriving), `missing` (gap under the unavailable threshold), `noisy` (rolling variance over the calibrated bound), `unavailable` (gap over the threshold, default 60 s). |
| Long-dropout policy | After the unavailable threshold: the channel is excluded from scoring and from hypothesis fitting, a gap record is stored, confidence is reduced, and the channel resumes cleanly after N consecutive good samples. |
| Quality score | `quality = 1 − w1·missing_frac − w2·stale_frac − w3·noisy_frac` over the last window, clipped to [0, 1]. Weights in config. |

### 3.3 Step 1: Learn what "normal" looks like

**GRU predictor**

| Item | Design |
|---|---|
| Input | The last `W` seconds of all channels (default `W = 60`, selectable 30 to 60), shaped `[W, 2C + E]`: normalized values, mask bits, and exogenous inputs `E` (eclipse flag, orbit phase as sin and cos, commanded mode). Exogenous inputs play the role command inputs play in SMAP/MSL. |
| Output | Next-step prediction for all `C` channels |
| Size | 1 to 2 GRU layers, hidden size 64 to 128, then a linear head. Small enough for CPU. |
| Training data | **Normal runs only** from the plant simulator: many seeds, randomized parameters, randomized load profiles |
| Augmentation | Random channel masking (dropout of 0 to 40% of channels over random spans), random delay, random noise scaling. Masked inputs are zeroed with mask bit 0, so the model learns to rely on what is present. |
| Loss | Masked MSE on observed targets only |
| Split | Train, validation, **calibration** (held out for conformal), test. Different seeds for each. |

**Residual and score**

```
r[c,t]   = (y[c,t] − ŷ[c,t]) / σ_c            # σ_c from calibration residuals, per channel and regime
z[c,t]   = r[c,t]                             # kept for contributions and onset
score[t] = mean over available channels of z[c,t]²      # mean, not sum, so missing channels do not change scale
```

Only channels with `mask = 1` contribute to `score`. This makes the score comparable under dropout, and is why conformal calibration also includes stressed data.

**Isolation Forest (second opinion)**

- Features: current normalized values, short-window residual statistics, and first differences.
- Trained on normal data only.
- Output: an anomaly flag with its own calibrated threshold. Agreement with the GRU raises confidence; disagreement lowers it.
- TreeSHAP (P1) gives a secondary feature-importance view.

**Slow-drift path (CUSUM and EWMA)**

One-step-ahead residuals are tiny for a very slow drift, so the fast path may not fire. A CUSUM (or EWMA) on the per-channel mean residual accumulates small consistent shifts. Its decision limit is tuned by simulation on fault-free runs to hit the same false-alarm target. A CUSUM flag opens an episode just like a GRU flag.

### 3.4 Step 2: Decide when to alert, with a calibrated rate

**Conformal threshold**

1. Collect scores on held-out normal calibration data (including stressed conditions).
2. For target false-alarm rate `α` (default 0.01), threshold = the conformal quantile: the `⌈(n+1)(1−α)⌉ / n` empirical quantile of calibration scores.
3. **Regime-conditional (Mondrian) calibration** (P1): compute separate thresholds for `sunlight` and `eclipse`, because normal behaviour differs.

**Persistence rule:** alert only when `k` of the last `n` samples exceed the threshold (default 5 of 8). Close the episode after `m` consecutive clear samples (hysteresis).

**Honest caveat (kept visible in the product):** the conformal guarantee assumes exchangeable calibration and test scores. Telemetry is autocorrelated, so the guarantee is approximate. We therefore:

- report the **sample-level** rate and the **episode-level** rate (episodes per simulated day) measured on **fresh** fault-free runs, not the calibration set;
- tune `α`, `k` and `n` on a validation sweep until the measured episode rate meets the target;
- display both the chosen target and the measured value side by side.

### 3.5 Step 3: Noise, sensor fault, or real fault

Runs when an episode opens, and again as the episode evolves.

**Episode features**

| Feature | Meaning |
|---|---|
| `n_exceeding` | Number of channels with `|z|` over a channel threshold |
| `duration` | Episode length so far |
| `max_abs_z`, `mean_abs_z` | Strength |
| `graph_connected` | Whether the exceeding channels form a connected set in the dependency graph |
| `onset_order_consistent` | Whether onset order respects graph direction and lag bounds |
| `cross_sensor_residual` | For each suspect channel, error when predicted from its linked channels (analytical redundancy) |
| `linked_disagree` | Whether linked channels fail to confirm the suspect channel |
| `stuck_signature` | Near-zero variance for the suspect channel over a window |
| `spike_signature` | Single-sample excursion that reverts |
| `drift_signature` | Single-channel ramp with linked channels nominal |
| `quality_context` | Data-quality score during the episode |

**Analytical redundancy examples** (small ridge regressions or physical relations fitted on normal data):

| Suspect channel | Predicted from |
|---|---|
| `battery_voltage` | `battery_soc`, `battery_current` |
| `battery_temp` | `battery_current`, `heater_state`, `avionics_temp`, `panel_temp` |
| `wheel_current` | `wheel_speed` change, `wheel_temp` |
| `bus_voltage` | `battery_voltage`, `load_power` |

**Classifier:** a shallow `DecisionTreeClassifier` (max depth 4 to 5), trained on labelled simulator episodes:

| Class | Training examples |
|---|---|
| `noise` | Noise bursts, single spikes, short glitches, transient deviations on one channel |
| `sensor_fault` | Drift, stuck-at, repeated spikes on one channel with linked channels nominal |
| `subsystem_fault` | The five subsystem faults at varied severity, onset and mismatch |

The tree's rules are exported as text, so the UI shows the rule path (for example `n_exceeding >= 3 → graph_connected → onset_order_consistent → subsystem_fault`). This is the explainable answer to "how do you separate noise from a real fault?".

Outcomes:

| Class | System action |
|---|---|
| `noise` | Suppress. No incident. Count in the suppressed total. |
| `sensor_fault` | Create incident: "Sensor X unreliable." Exclude that channel from scoring and fitting while flagged. Skip physics fitting except for the sensor hypotheses. |
| `subsystem_fault` | Create incident and run root-cause fitting. |

### 3.6 Step 4: Root cause by testing hypotheses

**Hypotheses:** `solar_degradation`, `heater_stuck_on`, `battery_degradation`, `wheel_friction`, `radiator_degradation`, `sensor_drift(channel)`, `sensor_stuck(channel)`, and a `nominal` reference.

**Procedure**

1. **Estimate onset.** Use the earliest channel whose residual or CUSUM crossed its threshold, refined by a change-point estimate. Produce the onset order list (this is also the explanation).
2. **Pre-filter candidates.** Use the dependency graph and onset order to keep the top `K` (default 4) candidates. A candidate is kept if its fault node can plausibly produce the observed first-mover and lag pattern. This keeps the number of fits small.
3. **Initialize the twin.** Set the twin's initial state from observed telemetry just before onset (state of charge, temperatures, wheel speed). Feed it the true exogenous inputs (eclipse, mode commands).
4. **Fit each hypothesis.** For hypothesis `h`, run the twin forward from onset to now with the fault active and fit severity `θ` in `[0, 1]` using a bounded 1-D optimizer (`scipy.optimize.minimize_scalar`, bounded). Sensor hypotheses fit a bias slope or stuck value on the named channel.
5. **Cost.** Masked, noise-normalized weighted sum of squared errors over available channels and the post-onset window:
   `cost_h = Σ_c Σ_t w_c · mask[c,t] · ((y[c,t] − ŷ_h[c,t]) / σ_c)² / N_obs`
6. **Residual floor.** Normalize by the twin-vs-plant mismatch floor measured on normal data, so costs are comparable across mismatch levels.
7. **Posterior.** `p(h) ∝ prior(h) · exp(−(cost_h − min_cost) / (T · floor))`. The prior comes from the onset pre-filter. `T` is a temperature, calibrated so confidence matches observed accuracy.
8. **Unexplained.** If `min_cost` is above a calibrated bound (from faulty runs), report `unexplained` as the top entry rather than forcing a label. The UI then shows onset order and contributions only.
9. **Severity.** The fitted `θ` for the top hypothesis, with a simple uncertainty range from the cost curvature.
10. **Time to limit.** Roll the fitted twin forward to estimate when the nearest limit will be crossed (P1).

**Progressive diagnosis:** re-run the fits every 30 s while the episode is open. As more post-onset data arrives, the posterior sharpens (or flattens if data degrades). The UI shows the evolution.

**Latency budget:** each fit simulates up to about 10 minutes at 1 Hz with a vectorized twin and a 1-D search of about 20 evaluations. Target well under 1 s per hypothesis, and under 3 s for the top 4.

**Why this is not circular:** the **plant** (truth) is deliberately messier than the **twin** (diagnosis model). See section 4.2.

### 3.7 Step 5: Honest confidence

Two mechanisms make confidence move for real:

1. **Training with dropout** makes the GRU residuals meaningful under missing data. Fitting uses a masked cost, so with fewer channels the hypotheses become harder to distinguish. The **posterior flattens by itself**.
2. **Explicit factors** for staleness and detector disagreement.

```
confidence = posterior_top1 × (1 − λ · stale_frac_of_relevant_channels) × agreement
agreement  = 1.0 if GRU and IF agree, else 0.9   (config)
```

`reason` is generated from the largest penalty, for example: *"Confidence dropped from 92% to 71% because battery_temp was missing for 40 s."*

**Check:** a reliability diagram (stated confidence vs observed top-1 accuracy) on the evaluation page (P1). If confidence is not calibrated, say so and adjust `T`.

### 3.8 Step 6: Explanation, risk, recommendation

**Contributions:** per-channel share of the anomaly score, `share_c = z_c² / Σ z²` over available channels, with observed and forecast values.

**Four-line card** (rendered from templates with Jinja2, hard length limits):

| Line | Template idea |
|---|---|
| Headline | `Probable {cause_label} ({subsystem}).` |
| Evidence | `{top_channel} is {pct}% {direction} forecast; {second_channel} changed {lag}s later and is {delta} {unit} {direction} forecast.` |
| Cause and confidence | `{cause_label}, about {severity_pct}% {severity_meaning}, confidence {conf}%.` |
| Action | `{first_action}.` |

Rules: no more than four lines, no jargon without a label, numbers always with units, and the confidence reason appended when confidence fell.

**Risk level** (Low, Medium, High, Critical):

```
risk_score = a·severity_est + b·n_affected_subsystems/3 + c·margin_to_limit_term + d·rate_term
```

Mapped to levels by thresholds in config. Rate and margin terms use time-to-limit when available.

**FMEA rule table (mini):**

| Cause | Effects seen | Ranked actions | Escalation |
|---|---|---|---|
| `solar_degradation` | Solar current down, charge rate down, battery temp up | 1. Reduce non-essential load. 2. Check heater status. 3. Review array pointing and telemetry. | Safe mode if state of charge trend is negative for more than 10 min |
| `heater_stuck_on` | Heater state high, battery and avionics temp up, load up | 1. Command heater off or cycle (if safe). 2. Reduce load. 3. Check thermostat telemetry. | Safe mode if temp within 5 °C of red limit |
| `battery_degradation` | Faster state-of-charge fall, voltage sag, temp up under load | 1. Reduce load. 2. Limit depth of discharge. 3. Plan reduced operations. | Safe mode if state of charge below floor |
| `wheel_friction` | Wheel current and temp up for same speed, pointing error up | 1. Reduce wheel speed demand. 2. Schedule wheel health check. 3. Prepare backup control mode. | Safe mode if pointing error exceeds bound |
| `radiator_degradation` | Panel and avionics temp up, slow | 1. Adjust attitude for thermal balance. 2. Reduce thermal load. 3. Monitor trend. | Safe mode if temp reaches yellow limit with positive trend |
| `sensor_drift` / `sensor_stuck` | One channel disagrees with linked channels | 1. Treat channel as unreliable. 2. Use redundant channels. 3. Schedule sensor check. | None (informational) |
| `unexplained` | Pattern fits no known fault | 1. Escalate to engineer. 2. Hold current configuration. 3. Collect more data. | Per operator |

**Safety checks (contraindications)** filter or annotate actions, for example: do not suggest heater-off if battery temp is near the low limit; do not suggest further load shedding if already at minimum load; flag actions that depend on a channel currently `unavailable`. Each check shows pass or fail in the UI.

All outputs are phrased as recommendations. The system never issues a command.

### 3.9 Generic mode (foreign streams)

The simulator-trained GRU only knows our channels. For a judge's CSV or a SMAP/MSL channel:

| Aspect | Behaviour |
|---|---|
| Warm-up | The first `N` samples (default 600, or 10 to 15% of the file) are assumed normal. A small per-session model is fitted on them. |
| Model | A compact GRU or an autoregressive ridge model per channel group, plus an Isolation Forest. Conformal calibration uses the tail of the warm-up. |
| Structure | A **correlation graph learned from the warm-up** replaces the physical dependency graph. |
| Classification | Same decision tree features, using the learned graph. |
| Root cause | Onset ordering and learned correlations only, labelled **heuristic only** in the UI. No physics fitting. |
| Full mode upgrade | If enough columns are mapped to catalog channels, the session runs in full mode. |

This keeps the live judge test safe without overclaiming.

### 3.10 SMAP/MSL benchmark adapter

- Each SMAP/MSL channel is a separate series with one telemetry feature and command features. We train a small per-channel model (same GRU family, command features as exogenous input), calibrate with conformal thresholding on the training portion, and run on the test portion.
- Metrics are **event-level** precision, recall and F1 against `labeled_anomalies.csv` sequences. We state the protocol on the page. We do not use point-adjusted F1, because it inflates results.
- Role: shows detection works on real data. It is **not** used for root cause.

---

## 4. Simulator architecture

### 4.1 Signals (about 14 channels)

| Subsystem | Channel | Unit |
|---|---|---|
| Power | `solar_current` | A |
| Power | `bus_voltage` | V |
| Power | `battery_soc` | % |
| Power | `battery_voltage` | V |
| Power | `battery_current` | A |
| Power | `load_power` | W |
| Thermal | `battery_temp` | °C |
| Thermal | `panel_temp` | °C |
| Thermal | `avionics_temp` | °C |
| Thermal | `heater_state` | 0 or 1 |
| Attitude | `wheel_speed` | rpm |
| Attitude | `wheel_current` | A |
| Attitude | `wheel_temp` | °C |
| Attitude | `pointing_error` | deg |

Exogenous inputs (not scored): `eclipse_flag`, `orbit_phase`, `mode_cmd` (nominal, imaging, downlink).

### 4.2 Plant vs twin

| Aspect | **Plant** (truth, generates data) | **Twin** (diagnosis model) |
|---|---|---|
| Parameters | Per-run random perturbation (about ±5 to 10%) | Nominal values |
| Thermal | Two-node model with unmodelled avionics-to-battery heat leak | Simplified first-order model |
| Orbit | Slightly varying beta angle and eclipse duration | Fixed nominal orbit |
| Load profile | Random duty cycles and mode changes | Uses the commanded mode as input |
| Noise | Correlated (AR(1)) plus white, per-channel scale | Not modelled (handled by cost weights) |
| Sensors | Bias, quantization, occasional glitches | Ideal |
| Mismatch level | `none` (plant equals twin structure), `medium`, `high` | n/a |

`mismatch_level` scales the differences. Root-cause accuracy is **reported at every level**, so a judge can see that accuracy degrades gracefully rather than being tuned to a matching model.

### 4.3 Faults

| Fault | Effect on plant | Severity meaning |
|---|---|---|
| `solar_degradation` | Solar output scaled by `1 − θ` after ramp | Fraction of output lost |
| `heater_stuck_on` | Heater forced on regardless of thermostat | Fraction of duty forced |
| `battery_degradation` | Capacity fade and internal resistance rise | Normalized degradation |
| `wheel_friction` | Added drag torque, more current and heat for same speed | Normalized friction |
| `radiator_degradation` | Reduced heat rejection | Fraction of radiator effectiveness lost |
| `sensor_drift` | Bias ramp on one channel | Normalized drift rate |
| `sensor_stuck` | Channel frozen at last value | n/a |
| `sensor_spike` | Isolated outliers on a channel | Amplitude |
| `noise_burst` (benign) | Increased noise on a channel for a short span | Noise multiplier |

Every injected fault writes a ground-truth record: type, target, severity, onset, ramp, and expected affected subsystems.

### 4.4 Dependency graph (data file `graph.json`)

Directed edges from cause-side node to effect-side node, with sign and lag bounds in seconds:

| From | To | Sign | Lag bounds |
|---|---|---|---|
| solar array | `solar_current` | + | 0 to 5 |
| `solar_current` | `battery_current` | + | 0 to 10 |
| `battery_current` | `battery_soc` | + | 5 to 60 |
| `battery_current` | `battery_temp` | + | 60 to 600 |
| `battery_soc` | `battery_voltage` | + | 0 to 30 |
| `battery_voltage` | `bus_voltage` | + | 0 to 10 |
| heater | `heater_state` | + | 0 to 5 |
| `heater_state` | `battery_temp` | + | 30 to 600 |
| `heater_state` | `load_power` | + | 0 to 10 |
| `load_power` | `battery_current` | − | 0 to 10 |
| `wheel_speed` | `wheel_current` | + | 0 to 10 |
| `wheel_current` | `wheel_temp` | + | 60 to 900 |
| `wheel_current` | `load_power` | + | 0 to 10 |
| `wheel_temp` | `avionics_temp` | + | 300 to 1800 |
| radiator | `panel_temp` | − | 60 to 900 |
| `panel_temp` | `avionics_temp` | + | 120 to 1200 |
| `avionics_temp` | `battery_temp` | + | 120 to 1200 |

These values are starting points. Tune them against the simulator. The file is the single source for the pre-filter, onset-order consistency check, the UI graph and the explanation text.

---

## 5. Data model (MongoDB)

| Collection | Key fields | Indexes |
|---|---|---|
| `sessions` | `_id`, `source`, `mode`, `status`, `seed`, `mismatchLevel`, `speed`, `config`, `sourceLabel`, `createdAt`, `simTime` | `createdAt` |
| `telemetry` (time-series) | `ts`, `meta: { sessionId }`, `simTime`, `v` (channel to value), `q` (channel to status), `score`, `threshold`, `flag`, `regime` | time-series default, plus `{ meta.sessionId, simTime }` |
| `faults` | `sessionId`, `type`, `target`, `severity`, `startSimTime`, `rampSec`, `truth` (hidden fields), `linkedIncidentId`, `status` | `{ sessionId }` |
| `anomalies` | `sessionId`, `episodeId`, `startSim`, `endSim`, `class`, `peakScore`, `suppressed`, `features` | `{ sessionId, startSim }` |
| `incidents` | Full incident document (see `apiendpoints.md`), `status`, `history[]` (ack, dismiss, notes), `updatedAt` | `{ sessionId, status }`, `{ openedAtSim }` |
| `eval_runs` | `suite`, `params`, `status`, `results`, `createdAt`, `finishedAt` | `{ suite, createdAt }` |
| `uploads` | `filename`, `path`, `columns`, `mapping`, `timeColumn`, `rows` | none |

Write policy: telemetry is inserted in batches (about once per second). Incident documents are updated in place as diagnosis refines. A `history` array records state changes for the audit trail.

Retention: delete a session's telemetry on session delete. Optional TTL for old sessions.

---

## 6. Backend architecture (Node)

```
server/src
  app.js                 Express app: middleware, routes, error handler
  server.js              HTTP server + Socket.IO bootstrap
  config/                env.js, db.js
  routes/                health, meta, sessions, faults, stress, incidents, comparison,
                         detector, uploads, evaluation, scenarios
  controllers/           thin: parse, call service, respond
  services/
    mlClient.js          axios wrapper to Python REST, timeouts, error mapping
    streamBridge.js      per-session upstream WS: receive, persist, emit, reconnect
    sessionService.js    session lifecycle and state cache
    incidentService.js   merge ML incident updates, ack/dismiss/close, audit history
    evalService.js       start jobs, store results, serve to routes
    uploadService.js     CSV sniffing, validation, handoff to Python inspect
  sockets/               live namespace, room management, frame throttling
  models/                Mongoose schemas
  middleware/            validate (zod), error, requestId, rateLimit, upload (multer)
  validators/            zod schemas per route
  utils/                 camel/snake mapping, logger, ids
```

Key behaviours:

- **Stream bridge:** one upstream WebSocket per active session. On drop, reconnect with backoff and resync from `GET /ml/v1/sessions/{id}/state`. Frames are persisted in batches and forwarded to the session room, throttled to the client's `maxFps`.
- **State cache:** the latest `state` per session is held in memory so `GET /sessions/:id/state` is instant.
- **Error mapping:** Python errors become `502 ML_UNAVAILABLE` or `504 ML_TIMEOUT` with a safe message.
- **Upload safety:** size limit, extension and MIME check, parse in a try block, never execute content, store under a generated filename.

---

## 7. Frontend architecture

### 7.1 Routes and pages

| Route | Page | Contents |
|---|---|---|
| `/` | **MissionControl** | Header (source badge, clock, controls), subsystem health, live charts, score and threshold, alert panel, sensor status strip, false-alert counter, fault and stress drawers |
| `/incident/:id` | **IncidentDetail** | Root-cause graph, ranked causes, confidence breakdown, propagation timeline, contribution chart, four-line card, actions, time to limit |
| `/compare` | **Comparison** | Limit-check vs detector lanes, lead-time bars |
| `/evaluation` | **Evaluation** | Headline numbers, false-alert curve, robustness curve, root-cause confusion matrix, classification matrix, lead-time distribution, calibration |
| `/incidents` | **IncidentLog** | Filterable table |
| `/orbit` | **OrbitView** (P2) | Cesium globe and ground track, eclipse shading, optional Three.js satellite panel |

Modals and drawers: **FaultDrawer** (offcanvas), **StressPanel**, **UploadModal** (with mapping), **JudgeModeToggle** (P2).

### 7.2 Component structure

```
src
  main.jsx · App.jsx · routes.jsx
  api/                http.js, endpoints.js (typed wrappers around apiendpoints.md)
  sockets/            liveSocket.js (connect, join, event routing to stores)
  store/              sessionStore · telemetryStore · incidentStore · uiStore · evalStore
  hooks/              useSession, useLiveFrames, useIncident, useEvaluation
  pages/              MissionControl, IncidentDetail, Comparison, Evaluation, IncidentLog, OrbitView
  components/
    layout/           AppShell, Header, Sidebar, SourceBadge, MissionClock
    controls/         PlaybackControls, SpeedSelect, FaultDrawer, StressPanel, DetectorSettings
    charts/
      echarts/        TelemetryChart, ScoreChart, CorrelationHeatmap, ComparisonChart
      recharts/       Sparkline, ContributionBars, ConfidenceHistory
      plotly/         RobustnessCurve, FalseAlertCurve, ConfusionMatrix, ReliabilityDiagram, LeadTimeDist
      chartjs/        RiskGauge, QualityDoughnut, HealthDoughnut
    graph/            RootCauseGraph (Cytoscape), DependencyGraphView
    incident/         IncidentCard, RankedCauses, ExplanationCard, ActionList, PropagationTimeline, ConfidenceBreakdown
    health/           SubsystemTile, SensorStrip, FalseAlertCounter
    upload/           UploadModal, ColumnMapper
    orbit/            GlobeView (Cesium) — lazy
    three/            SpacecraftModel (R3F) — lazy
    common/           Card, Badge, Skeleton, EmptyState, ErrorBoundary
  styles/             theme.scss (Bootstrap overrides, CSS variables), motion.js (shared variants)
```

### 7.3 State and data flow

```
Socket.IO event ──► liveSocket router ──► stores
   telemetry:frame    → telemetryStore.appendFrame()   (ring buffers, not React state)
   sensor:status      → sessionStore
   detector:episode   → incidentStore (episodes)
   incident:*         → incidentStore + React Query cache invalidation
   falsealerts:update → sessionStore

Charts read from telemetryStore on a 200 ms timer (about 5 Hz) → ECharts setOption / appendData
React components subscribe to small selectors, never to the raw buffers.
```

Rendering rules:

1. Per-channel ring buffers (typed arrays), default length 3600 samples.
2. Chart updates are timer-driven and throttled, not per message.
3. Hidden channels do not render. Maximum 6 channels visible by default.
4. Streaming series have animation off. Framer Motion is used for UI chrome only.
5. Heavy routes (Evaluation with Plotly, Orbit with Cesium and Three.js) are code-split and lazy-loaded.
6. Zoom, brush and pause are handled in the chart library. Pausing playback does not discard buffered data.

### 7.4 Library roles (summary)

| Library | Used for |
|---|---|
| ECharts | Live telemetry, score and threshold, heatmap, comparison lanes |
| Recharts | Sparklines, contribution bars, confidence history |
| Plotly | Evaluation curves, confusion matrices, reliability diagram |
| Chart.js | Gauges and doughnuts |
| Cytoscape | Root-cause and dependency graphs |
| Cesium | Globe, ground track, eclipse shading (P2) |
| Three.js (R3F) | Spacecraft model with health-coloured subsystems (P2) |
| Framer Motion | Alert list, card transitions, number counters, tile pulses, route transitions |
| Bootstrap | Layout grid, offcanvas, modals, tabs, badges, tooltips, theming |

### 7.5 Visual language

| Token | Use |
|---|---|
| Dark background, cyan accent | Matches the deck |
| Green, amber, red | Health: ok, warning, critical (never the only cue, always with an icon or label) |
| Purple | ML or model output (forecast, score) |
| Monospace for numbers | Readouts and timestamps |

### 7.6 Interaction details

- Clicking an alert or an anomaly marker opens the incident detail.
- The root-cause graph highlights the **source** node, colours **affected** nodes, and labels edges with typical lags. Nodes are clickable and filter the charts to that subsystem's channels.
- `Pause` freezes the display and stream, and keeps incident panels interactive.
- The fault drawer shows nothing about truth until the reveal rule is met.
- Every number that comes from evaluation shows its dataset and sample size in a tooltip.

---

## 8. Evaluation harness

Lives in `ml-service/app/eval`. All experiments are seeded and write JSON to `ml-service/results/`.

| Experiment | Method | Output |
|---|---|---|
| **Detection (SMAP/MSL)** | Per-channel model, conformal threshold, event-level metrics | Precision, recall, F1 per channel and macro |
| **Root cause** | `N` randomized runs with held-out severity and onset ranges, at mismatch `none`, `medium`, `high` | Top-1, top-3, severity MAE, confusion matrix |
| **False alerts** | Fault-free runs at several noise scales, three systems: limit checking, detector alone, detector plus noise logic | Alert episodes per simulated day per system |
| **Robustness** | Inject missing data 0 to 50%, plus delay and noise sweeps | F1 and top-1 vs stress level |
| **Classification** | Labelled episodes (noise, sensor, subsystem) | Confusion matrix |
| **Lead time** | Faults that eventually cross a limit | Detector alert time minus limit alarm time |
| **Calibration** | Bin stated confidence against observed top-1 | Reliability diagram and ECE |

Rules: training seeds, calibration seeds and evaluation seeds never overlap. Every plot states the dataset, the number of runs and the seed range.

---

## 9. Configuration

| Parameter | Default | Where |
|---|---|---|
| Sample rate | 1 Hz | Simulator |
| Window `W` | 60 s | GRU |
| Target false-alarm rate `α` | 0.01 (sample level) | Conformal |
| Persistence `k` of `n` | 5 of 8 | Detector |
| Close hysteresis `m` | 10 clear samples | Episode manager |
| Reorder buffer | 15 s | Data quality |
| Unavailable threshold | 60 s | Data quality |
| Evidence window before first RCA | 60 to 120 s | RCA scheduler |
| RCA refit interval | 30 s | RCA scheduler |
| Pre-filter `K` | 4 candidates | RCA |
| Warm-up samples (generic mode) | 600 | Generic |
| Max visible channels | 6 | Client |
| Frame rate to client | 5 fps | Node and client |

All values are in one `config` file per service and returned by `GET /meta/config`.

---

## 10. Repository layout

```
initium-shm/
├─ client/                      React app
├─ server/                      Node + Express
├─ ml-service/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ api/                   routers: sessions, stream, faults, analysis, datasets, eval, models
│  │  ├─ core/                  config, logging, registry (model loading), session manager
│  │  ├─ sim/                   catalog, orbit, plant, twin, faults, sensors, scenarios
│  │  ├─ dq/                    reorder_buffer, aligner, imputer, status, quality
│  │  ├─ detect/                gru, train_gru, iforest, conformal, persistence, cusum, limits, score
│  │  ├─ classify/              features, redundancy, tree, rules_export
│  │  ├─ rca/                   graph, onset, prefilter, fit, posterior, severity, time_to_limit
│  │  ├─ explain/               contributions, templates, fmea, risk, confidence, safety_checks
│  │  ├─ generic/               warmup, adaptive_model, corr_graph
│  │  ├─ eval/                  detection_smap, root_cause, false_alerts, robustness, classification, metrics, runner
│  │  └─ schemas/               pydantic models
│  ├─ scripts/                  generate_dataset.py, train_gru.py, calibrate.py, build_tree.py, run_eval.py
│  ├─ models/                   gru.pt, scaler.pkl, iforest.joblib, tree.joblib, conformal.json
│  ├─ data/                     smap_msl/, uploads/, generated/
│  ├─ results/                  evaluation JSON
│  └─ tests/
├─ data/graph.json              dependency graph (shared by ML and client via /meta/graph)
├─ docs/                        prd.md, techstack.md, apiendpoints.md, architecture.md
└─ package.json                 root scripts: dev (concurrently), lint, test
```

Offline workflow (run before the demo, in this order): `generate_dataset` → `train_gru` → `calibrate` → `build_tree` → `run_eval`. Each script writes its artifact and a small metadata JSON (seed, date, metrics).

---

## 11. Failure handling

| Failure | Behaviour |
|---|---|
| Python service down | Node returns `502 ML_UNAVAILABLE`. Client shows a banner and keeps showing last data. |
| Upstream WS drops | Node reconnects with backoff and resyncs state. Client shows a "reconnecting" indicator. |
| Socket drops in browser | Socket.IO auto-reconnects. Client rejoins the room and fetches `/state` and recent telemetry. |
| Malformed upload | `422 UNPARSEABLE_DATA` with a specific message. Nothing is stored. |
| Channel with no variance | Excluded from scoring, flagged, no division by zero. |
| NaN or inf in a stream | Treated as missing. |
| Model file missing | Service starts in degraded mode: simulator and limit checks work, ML endpoints return a clear error. |
| RCA exceeds time budget | Return partial ranking marked `partial: true`. |
| Evaluation results missing | Evaluation page shows "not run yet" with a run button, never fake numbers. |

---

## 12. Security and safety

| Topic | Approach |
|---|---|
| Scope | Local demo, no authentication |
| Inputs | Zod validation in Node, Pydantic in Python |
| Uploads | Size and type limits, generated filenames, never executed |
| CORS | Restricted to the client origin |
| Secrets | `.env` files, never committed |
| Spacecraft safety framing | The system only advises. No endpoint issues commands. The UI says so. |

---

## 13. Testing strategy

| Level | Examples |
|---|---|
| Simulator invariants | Energy balance roughly closes, no NaN, temperatures bounded, same seed gives same output |
| Data quality | Out-of-order input is reordered, a 10-minute gap becomes `unavailable`, resume works |
| Detector | Conformal threshold hits the target rate on fresh normal data within tolerance |
| Classifier | Known noise burst gives `noise`, known drift gives `sensor_fault`, solar fault gives `subsystem_fault` |
| RCA | Each of the five faults is top-1 at zero mismatch and low noise. Accuracy at higher mismatch is measured and recorded. |
| API | `supertest` for each route, including error codes |
| End to end | One scripted run: create session, inject fault, receive incident, read detail |
| Demo | Full rehearsal on the demo laptop with the network off |

---

## 14. Key design decisions and trade-offs

| Decision | Reason | Cost |
|---|---|---|
| Python owns the clock and pipeline state | Single source of truth, low chatter | Node depends on the WebSocket bridge |
| Plant and twin are separate | Avoids circular validation | More simulator code |
| Hypothesis fitting instead of a learned root-cause classifier | Gives severity, works on unseen severities, explainable | Needs a decent twin and a latency budget |
| Decision tree for noise vs fault | Readable rule path, graded by organizers | Limited by feature quality |
| Conformal thresholds with measured episode rate | Auditable false-alert story | Guarantee is approximate on autocorrelated data, so we measure |
| Generic mode for foreign data | Survives the live judge test | Heuristic root cause only, and labelled so |
| MongoDB time-series instead of a dedicated TSDB | Fewer moving parts | Fewer time-series features |
| Cesium and Three.js as P2 | Scope control | Less visual flash if skipped |
| No AWS or Docker for the app | Time | Demo runs only locally |

---

## 15. Build order (mapped to the ML plan)

1. Simulator (plant, twin, faults, scenarios): everyone depends on it
2. GRU and residuals
3. Conformal threshold and persistence
4. Isolation Forest (and CUSUM)
5. Noise, sensor, subsystem logic
6. Root-cause fitting
7. SMAP/MSL benchmark, then robustness and false-alert curves

In parallel: Node skeleton and stream bridge, React shell and live charts, then incident detail and evaluation pages as ML outputs become available. Reach a crude end-to-end path (inject fault, alert, incident card) by hour 12.
