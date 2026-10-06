# API Endpoints: Initium Spacecraft Health Monitor

Three interfaces:

| Interface | Consumer | Provider | Base |
|---|---|---|---|
| **Public REST API** | React client | Node + Express | `http://localhost:5000/api/v1` |
| **Live events (Socket.IO)** | React client | Node + Express | `http://localhost:5000`, namespace `/live` |
| **Internal ML API (REST + WebSocket)** | Node server only | Python FastAPI | `http://localhost:8000/ml/v1` |

The browser never talks to Python directly.

---

## 0. Conventions

### Format

- JSON in and out (`Content-Type: application/json`), except file upload (`multipart/form-data`).
- Field names are `camelCase` in the public API. The internal ML API uses `snake_case`, and Node maps between them.
- IDs are opaque strings with prefixes: `ses_`, `flt_`, `inc_`, `ano_`, `upl_`, `run_`.

### Time

| Name | Meaning | Type |
|---|---|---|
| `simTime` | Seconds since session start, in simulated time | number |
| `ts` | Wall-clock time, ISO 8601 UTC | string |
| `speed` | Playback multiplier. 1 means one simulated second per real second. | number (1 to 60) |

Telemetry is sampled at 1 Hz in simulated time.

### Success and error envelopes

Success returns the resource directly, or `{ "data": ..., "meta": {...} }` for lists.

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "severity must be between 0 and 1",
    "details": [{ "path": "severity", "issue": "max" }],
    "requestId": "req_8f3a"
  }
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad body or query |
| 404 | `NOT_FOUND` | Unknown session, incident, fault, upload |
| 409 | `INVALID_STATE` | For example injecting a fault into a reset session |
| 413 | `UPLOAD_TOO_LARGE` | File over limit |
| 415 | `UNSUPPORTED_FILE` | Not CSV |
| 422 | `UNPARSEABLE_DATA` | CSV has no usable numeric columns |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `ML_UNAVAILABLE` | Python service down or errored |
| 504 | `ML_TIMEOUT` | Python call timed out |
| 500 | `INTERNAL_ERROR` | Anything else |

### Pagination

List endpoints accept `?limit=50&cursor=<opaque>` and return `meta.nextCursor` when more data exists.

### Enums

| Enum | Values |
|---|---|
| `source` | `simulator`, `smap_msl`, `opssat`, `upload` |
| `sessionStatus` | `created`, `playing`, `paused`, `ended` |
| `mode` | `full` (signals match the catalog) or `generic` (warm-up fit on foreign data) |
| `subsystem` | `power`, `thermal`, `attitude` |
| `faultType` (subsystem) | `solar_degradation`, `heater_stuck_on`, `battery_degradation`, `wheel_friction`, `radiator_degradation` |
| `faultType` (sensor) | `sensor_drift`, `sensor_stuck`, `sensor_spike` |
| `faultType` (benign) | `noise_burst` |
| `episodeClass` | `noise`, `sensor_fault`, `subsystem_fault` |
| `severity` | `info`, `warning`, `critical` |
| `risk` | `low`, `medium`, `high`, `critical` |
| `incidentStatus` | `analyzing`, `open`, `acknowledged`, `dismissed`, `closed` |
| `sensorStatus` | `ok`, `delayed`, `missing`, `noisy`, `unavailable` |
| `hypothesis` | the five subsystem fault types, plus `sensor_drift`, `sensor_stuck`, and the special values `unexplained` and `nominal` |

---

## 1. Public REST API (Node)

### 1.1 Health and metadata

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Node, MongoDB and Python status |
| GET | `/meta/signals` | Signal catalog: id, label, unit, subsystem, nominal range, limits |
| GET | `/meta/graph` | Dependency graph: nodes, edges, lag bounds |
| GET | `/meta/faults` | Fault catalog with parameters and the FMEA action mapping |
| GET | `/meta/config` | Defaults: target false-alarm rate, persistence k and n, buffer window |

`GET /health` response:

```json
{ "status": "ok", "node": "up", "mongo": "up", "ml": "up", "modelsLoaded": true, "version": "1.0.0" }
```

`GET /meta/signals` response (excerpt):

```json
{
  "data": [
    { "id": "solar_current", "label": "Solar current", "unit": "A", "subsystem": "power",
      "nominal": { "min": 0, "max": 6.0 }, "limits": { "yellowHigh": 6.5, "redHigh": 7.0 } },
    { "id": "battery_temp", "label": "Battery temperature", "unit": "°C", "subsystem": "thermal",
      "nominal": { "min": 10, "max": 30 }, "limits": { "yellowHigh": 38, "redHigh": 45, "yellowLow": 2, "redLow": -5 } }
  ]
}
```

### 1.2 Scenarios

| Method | Path | Purpose |
|---|---|---|
| GET | `/scenarios` | Scripted, seeded demo scenarios |
| POST | `/sessions/:id/scenarios/:scenarioId/run` | Start a scripted scenario in a session |

Scenario object:

```json
{ "id": "solar_early_detection", "name": "Solar array degradation (early detection)", "seed": 42,
  "durationSec": 14400, "steps": [{ "atSimTime": 3600, "fault": { "type": "solar_degradation", "severity": 0.22, "rampSec": 600 } }] }
```

### 1.3 Sessions and playback

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions` | Create a session |
| GET | `/sessions` | List sessions |
| GET | `/sessions/:id` | Session details and current state |
| DELETE | `/sessions/:id` | Stop and delete a session |
| POST | `/sessions/:id/control` | Play, pause, reset, change speed |
| GET | `/sessions/:id/state` | Current snapshot: health, sensor status, score, confidence, false-alert counters |
| GET | `/sessions/:id/telemetry` | Historical telemetry |
| GET | `/sessions/:id/orbit` | Orbit data for the globe and ground track (P2) |

**POST `/sessions`**

```json
{
  "source": "simulator",
  "seed": 42,
  "mismatchLevel": "medium",
  "speed": 4,
  "detector": { "targetFalseAlarmRate": 0.01, "persistK": 5, "persistN": 8 },
  "smap": { "channelId": "T-1" },
  "uploadId": null
}
```

Rules: `smap` is required when `source` is `smap_msl`. `uploadId` is required when `source` is `upload`. `mismatchLevel` is `none`, `medium` or `high` and applies to the simulator only.

Response `201`:

```json
{
  "id": "ses_01", "source": "simulator", "mode": "full", "status": "created",
  "simTime": 0, "speed": 4, "seed": 42,
  "channels": ["solar_current", "bus_voltage", "battery_soc", "battery_voltage", "battery_current", "load_power",
               "battery_temp", "panel_temp", "avionics_temp", "heater_state", "wheel_speed", "wheel_current",
               "wheel_temp", "pointing_error"],
  "sourceLabel": "Physics-based simulator (seed 42, medium mismatch)",
  "createdAt": "2026-10-05T10:00:00Z"
}
```

For `upload` or non-catalog sources, `mode` is `generic` and includes `warmup: { "samples": 600, "status": "fitting" }`.

**POST `/sessions/:id/control`**

```json
{ "action": "play" }
{ "action": "pause" }
{ "action": "speed", "speed": 8 }
{ "action": "reset", "seed": 42 }
{ "action": "seek", "simTime": 3600 }
```

`seek` is supported for replayed datasets (SMAP/MSL, upload) and for simulator sessions that have recorded history. Response `200` returns the updated session state.

**GET `/sessions/:id/state`**

```json
{
  "sessionId": "ses_01", "status": "playing", "simTime": 7822, "speed": 4,
  "subsystemHealth": { "power": "amber", "thermal": "red", "attitude": "green" },
  "sensors": [{ "id": "battery_temp", "status": "ok", "ageSec": 0, "imputed": false },
              { "id": "wheel_temp", "status": "missing", "ageSec": 40, "imputed": true }],
  "score": 3.8, "threshold": 2.1, "persistence": { "k": 5, "n": 8, "count": 6 },
  "dataQuality": { "score": 0.86, "missingPct": 7.1, "delaySec": 1.2 },
  "falseAlerts": { "episodes": 0, "faultFreeSimDays": 2.4, "perDay": 0.0, "targetPerDay": 1.0 },
  "activeIncidentIds": ["inc_014"],
  "sourceLabel": "Physics-based simulator (seed 42, medium mismatch)"
}
```

**GET `/sessions/:id/telemetry`**

Query: `from`, `to` (simTime), `channels` (comma list), `downsample` (target points per channel, default 1000).

```json
{
  "t": [7000, 7001, 7002],
  "channels": { "battery_temp": [24.1, 24.2, 24.2], "solar_current": [4.8, 4.8, 4.7] },
  "status": { "battery_temp": ["ok", "ok", "ok"] },
  "score": [1.1, 1.0, 1.2],
  "threshold": [2.1, 2.1, 2.1]
}
```

### 1.4 Fault injection

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions/:id/faults` | Inject a fault |
| POST | `/sessions/:id/faults/random` | Inject a random fault from a held-out range |
| GET | `/sessions/:id/faults` | List injected faults (truth hidden by default) |
| DELETE | `/sessions/:id/faults/:faultId` | Cancel a scheduled or active fault |
| GET | `/sessions/:id/faults/:faultId/truth` | Reveal ground truth |

Fault injection applies to simulator sessions only. Other sources return `409 INVALID_STATE`.

**POST `/sessions/:id/faults`**

```json
{ "type": "solar_degradation", "severity": 0.22, "startOffsetSec": 30, "rampSec": 600, "durationSec": null }
```

Sensor fault example:

```json
{ "type": "sensor_drift", "target": "battery_temp", "severity": 0.5, "startOffsetSec": 10, "rampSec": 900 }
```

`severity` is 0 to 1 and its meaning is per type (for example the fraction of solar output lost, or the normalized drift rate). `target` is required for sensor faults and `noise_burst`. `startOffsetSec` is relative to the current `simTime`.

Response `201`:

```json
{ "id": "flt_07", "type": "solar_degradation", "severity": 0.22, "startSimTime": 7852, "rampSec": 600, "status": "scheduled", "truthHidden": true }
```

**POST `/sessions/:id/faults/random`**

```json
{ "includeSensorFaults": true, "heldOut": true, "seed": 1234 }
```

Response is the same as injection, but the type, severity and onset are hidden (`truthHidden: true`) for a judge-picks-one demo.

**GET `/sessions/:id/faults/:faultId/truth`**

Returns `403 TRUTH_LOCKED` until the linked incident is acknowledged, dismissed or closed, or the request carries `?force=true` (judge mode).

```json
{
  "faultId": "flt_07", "type": "solar_degradation", "target": "solar_array", "severity": 0.22,
  "onsetSimTime": 7852, "trueAffected": ["power", "thermal"],
  "linkedIncidentId": "inc_014",
  "outcome": { "top1Correct": true, "inTop3": true, "severityErrorPct": 3.1, "detectionDelaySec": 41 }
}
```

### 1.5 Stress (data quality)

| Method | Path | Purpose |
|---|---|---|
| PUT | `/sessions/:id/stress` | Set live stress parameters |
| GET | `/sessions/:id/stress` | Read them |
| POST | `/sessions/:id/stress/dropout` | Schedule a channel dropout |
| GET | `/sessions/:id/sensors` | Per-sensor status |

**PUT `/sessions/:id/stress`**

```json
{ "missingPct": 20, "noiseScale": 1.5, "delaySec": 10, "jitterSec": 2, "outOfOrderPct": 5 }
```

All fields optional. A value of zero clears that stress. Applies to any source.

**POST `/sessions/:id/stress/dropout`**

```json
{ "channel": "battery_temp", "startOffsetSec": 5, "durationSec": 600 }
```

### 1.6 Anomalies and incidents

An **anomaly episode** is a detector event after the persistence rule fires. An **incident** is the analyzed object operators see. One episode normally produces one incident, unless it is classified as `noise`, in which case no incident is created and the episode is stored as suppressed.

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions/:id/anomalies` | Detector episodes, including suppressed noise episodes |
| GET | `/incidents` | List incidents (filters below) |
| GET | `/incidents/:id` | Full incident detail |
| POST | `/incidents/:id/acknowledge` | Mark acknowledged |
| POST | `/incidents/:id/dismiss` | Dismiss with a note |
| POST | `/incidents/:id/close` | Close (cause resolved) |
| GET | `/incidents/:id/report` | Export (`?format=json`, `md`, or `pdf`). `pdf` is P2. |

`GET /incidents` query: `sessionId`, `status`, `severity`, `from`, `to`, `limit`, `cursor`.

**GET `/incidents/:id` response:**

```json
{
  "id": "inc_014", "sessionId": "ses_01", "status": "open",
  "severity": "critical", "risk": "high",
  "openedAtSim": 7880, "openedAtTs": "2026-10-05T10:07:12Z",
  "classification": {
    "label": "subsystem_fault",
    "probs": { "noise": 0.02, "sensor_fault": 0.06, "subsystem_fault": 0.92 },
    "rulePath": ["channelsExceeding >= 3", "exceedingSetGraphConnected = true", "onsetOrderConsistent = true"]
  },
  "onset": {
    "simTime": 7852,
    "order": [
      { "channel": "solar_current", "t": 7852, "z": -4.1 },
      { "channel": "battery_soc", "t": 7889, "z": -3.2 },
      { "channel": "battery_temp", "t": 7960, "z": 3.4 }
    ]
  },
  "rankedCauses": [
    { "hypothesis": "solar_degradation", "target": "solar_array", "posterior": 0.87, "severityEstimate": 0.22, "fitCost": 1.3 },
    { "hypothesis": "battery_degradation", "target": "battery", "posterior": 0.08, "severityEstimate": 0.31, "fitCost": 3.9 },
    { "hypothesis": "heater_stuck_on", "target": "heater", "posterior": 0.05, "severityEstimate": 1.0, "fitCost": 4.4 }
  ],
  "confidence": {
    "value": 0.82, "previous": 0.92,
    "components": { "posteriorTop1": 0.87, "dataQualityFactor": 0.95, "detectorAgreement": 1.0 },
    "reason": "Confidence dropped from 92% to 82% because battery_temp was missing for 40 s."
  },
  "affectedSubsystems": [
    { "subsystem": "power", "role": "source" },
    { "subsystem": "thermal", "role": "affected" },
    { "subsystem": "attitude", "role": "not_affected" }
  ],
  "propagation": [
    { "t": 7852, "channel": "solar_current", "event": "Output fell below forecast" },
    { "t": 7889, "channel": "battery_soc", "event": "Charge rate dropped" },
    { "t": 7960, "channel": "battery_temp", "event": "Temperature rose above forecast" }
  ],
  "contributions": [
    { "channel": "solar_current", "share": 0.62, "zScore": -4.1, "observed": 3.9, "forecast": 4.8, "unit": "A" },
    { "channel": "battery_temp", "share": 0.28, "zScore": 3.4, "observed": 29.8, "forecast": 23.6, "unit": "°C" }
  ],
  "explanation": {
    "headline": "Probable solar array degradation (power subsystem).",
    "evidence": "Solar current is 18% below forecast; battery charge dropped 37 s later and battery temperature is 6.2 °C above forecast.",
    "causeConfidence": "Solar array degradation, about 22% output loss, confidence 82%.",
    "action": "Reduce non-essential load, then verify heater status."
  },
  "recommendations": [
    { "rank": 1, "action": "Reduce non-essential load", "rationale": "Restores power margin while the array is degraded.",
      "safetyChecks": [{ "rule": "battery_soc > 20%", "passed": true }] },
    { "rank": 2, "action": "Check heater status", "rationale": "Rule out heater contribution to temperature rise.", "safetyChecks": [] },
    { "rank": 3, "action": "Enter safe mode if persists more than 10 min", "rationale": "Escalation rule.", "safetyChecks": [] }
  ],
  "timeToLimit": { "channel": "battery_temp", "limit": 45, "etaSec": 2280, "basis": "twin_forecast" },
  "detection": {
    "gruFlag": true, "iforestFlag": true, "cusumFlag": false,
    "limitAlarmAtSim": null, "leadTimeSec": null
  },
  "mode": "full",
  "diagnosisState": { "stage": "refined", "fitsCompleted": 3, "evidenceWindowSec": 120 },
  "groundTruth": null,
  "notes": []
}
```

Notes on fields:

- `rankedCauses` may contain `unexplained` as the top entry when no hypothesis fits. Then `explanation` states that the cause could not be isolated and shows only onset order.
- In `generic` mode, `rankedCauses` is replaced by `candidateSources` (from onset ordering and learned correlations) and `diagnosisState.heuristicOnly` is `true`. The UI shows a "heuristic only" badge.
- `leadTimeSec` is filled when the limit checker later fires, or if the incident closes without a limit alarm it stays `null` and `limitAlarmAtSim` stays `null` (meaning the limit checker never fired).
- `groundTruth` is `null` unless revealed.

**POST `/incidents/:id/acknowledge`** and **`/dismiss`**

```json
{ "note": "Load shed commanded per procedure." }
```

Returns the updated incident.

### 1.7 Comparison

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions/:id/comparison` | Detector alerts vs limit-check alarms per incident |

```json
{
  "sessionId": "ses_01",
  "items": [
    { "incidentId": "inc_014", "channel": "battery_temp",
      "detectorAlertSim": 7880, "limitAlarmSim": 8735, "leadTimeSec": 855,
      "limitThreshold": { "type": "redHigh", "value": 45 } }
  ],
  "summary": { "meanLeadTimeSec": 855, "incidentsWithoutLimitAlarm": 0 }
}
```

### 1.8 Detector settings

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions/:id/detector` | Current settings and measured rates |
| PATCH | `/sessions/:id/detector` | Change false-alarm target and persistence |

```json
{ "targetFalseAlarmRate": 0.005, "persistK": 6, "persistN": 10 }
```

Response includes `calibration`: `{ "thresholds": { "sunlight": 2.1, "eclipse": 2.6 }, "calibratedAt": "...", "measuredSampleRate": 0.0092, "measuredEpisodesPerDay": 0.8 }`.

### 1.9 Uploads (judge test)

| Method | Path | Purpose |
|---|---|---|
| POST | `/uploads` | Upload a CSV (multipart field `file`) |
| GET | `/uploads/:id` | Details and detected columns |
| PUT | `/uploads/:id/mapping` | Confirm or edit the column mapping |
| DELETE | `/uploads/:id` | Remove |

**POST `/uploads`** response `201`:

```json
{
  "id": "upl_03", "filename": "judge_stream.csv", "rows": 5400, "sizeBytes": 412331,
  "timeColumn": { "name": "timestamp", "format": "iso8601", "irregular": true, "medianStepSec": 1.0 },
  "columns": [
    { "name": "bat_t", "numeric": true, "missingPct": 6.2, "suggestedChannel": "battery_temp", "matchScore": 0.71 },
    { "name": "x7", "numeric": true, "missingPct": 0.0, "suggestedChannel": null, "matchScore": 0.0 }
  ],
  "mode": "generic",
  "warnings": ["Timestamps are irregular and will be resampled to 1 Hz."]
}
```

**PUT `/uploads/:id/mapping`**

```json
{ "timeColumn": "timestamp", "mapping": { "bat_t": "battery_temp", "x7": null }, "warmupSamples": 600 }
```

`mapping` values that match catalog ids can enable `full` mode if enough catalog channels are mapped (the response states the resulting `mode`). Unmapped columns are used in `generic` mode.

Limits: `UPLOAD_MAX_MB` (default 50), CSV only, at least one numeric column and at least 100 rows after parsing.

### 1.10 Evaluation

Results are produced by offline or background jobs and stored. The dashboard reads them.

| Method | Path | Purpose |
|---|---|---|
| GET | `/evaluation/summary` | Headline numbers for the four main experiments |
| GET | `/evaluation/detection` | SMAP/MSL results per channel and overall |
| GET | `/evaluation/root-cause` | Top-1 and top-3, confusion matrix, by mismatch level and by fault type |
| GET | `/evaluation/false-alerts` | False-alert rate vs noise level for the three systems |
| GET | `/evaluation/robustness` | F1 vs missing %, delay and noise |
| GET | `/evaluation/classification` | Noise vs sensor vs subsystem confusion matrix |
| GET | `/evaluation/lead-time` | Lead-time distribution vs limit checking |
| GET | `/evaluation/calibration` | Confidence reliability data (P1) |
| POST | `/evaluation/runs` | Start a (re)run of one suite |
| GET | `/evaluation/runs/:runId` | Status and results |

**GET `/evaluation/summary`** (example shape. Numbers are placeholders, not results):

```json
{
  "generatedAt": "2026-10-05T18:00:00Z", "seed": 7, "datasets": ["simulator", "SMAP/MSL"],
  "detection": { "dataset": "SMAP/MSL", "level": "event", "precision": null, "recall": null, "f1": null, "channels": 0 },
  "rootCause": { "runs": 0, "top1": null, "top3": null, "mismatch": "medium", "severityMaePct": null },
  "falseAlerts": { "faultFreeSimDays": 0, "targetPerDay": 1.0, "measuredPerDay": null },
  "robustness": { "f1At0Missing": null, "f1At30Missing": null },
  "classification": { "accuracy": null },
  "leadTime": { "meanSec": null, "medianSec": null }
}
```

**GET `/evaluation/false-alerts`**

```json
{
  "noiseLevels": [1.0, 1.5, 2.0, 3.0],
  "unit": "alert episodes per simulated day on fault-free runs",
  "systems": {
    "limit_checking": [0.0, 0.0, 0.4, 2.1],
    "detector_alone": [0.7, 1.4, 3.2, 9.8],
    "detector_plus_noise_logic": [0.6, 0.8, 1.1, 2.0]
  },
  "faultFreeSimDaysPerPoint": 30,
  "note": "Illustrative shape only. Real values come from stored runs."
}
```

**POST `/evaluation/runs`**

```json
{ "suite": "root_cause", "params": { "runs": 200, "mismatch": ["none", "medium", "high"], "seed": 7 } }
```

`suite` is one of `detection_smap`, `root_cause`, `false_alerts`, `robustness`, `classification`, `lead_time`, `calibration`, `all`. Response `202` with `{ "runId": "run_21", "status": "queued" }`.

---

## 2. Live events (Socket.IO, namespace `/live`)

Commands go through REST. Sockets carry **streams and notifications** only.

### 2.1 Client to server

| Event | Payload | Purpose |
|---|---|---|
| `session:join` | `{ "sessionId": "ses_01" }` | Subscribe to a session room. Server replies with `session:state`. |
| `session:leave` | `{ "sessionId": "ses_01" }` | Unsubscribe |
| `frames:config` | `{ "sessionId": "ses_01", "maxFps": 5, "channels": ["battery_temp", "solar_current"] }` | Optional: limit rate and channels |

### 2.2 Server to client

| Event | When | Payload (summary) |
|---|---|---|
| `session:state` | On join and on status or speed change | Same shape as `GET /sessions/:id/state` |
| `telemetry:frame` | Up to `maxFps` times per second | Columnar batch of ticks (below) |
| `sensor:status` | When any sensor status changes | `{ sessionId, simTime, changes: [{ id, status, ageSec, imputed }] }` |
| `quality:update` | About once per second | `{ sessionId, score, missingPct, delaySec }` |
| `detector:episode` | Episode opens, updates or closes | `{ sessionId, episodeId, state: "opened" \| "updated" \| "closed" \| "suppressed", startSim, endSim, class, peakScore }` |
| `incident:created` | An episode is classified as sensor or subsystem fault | `{ incidentId, sessionId, severity, status: "analyzing", openedAtSim, headline }` |
| `incident:updated` | Diagnosis refines, confidence changes, or status changes | `{ incidentId, status, rankedCauses, confidence, explanation, risk }` |
| `fault:injected` | A fault is scheduled or becomes active | `{ faultId, sessionId, type, status, truthHidden }` (truth omitted when hidden) |
| `limit:alarm` | The baseline limit checker fires | `{ sessionId, channel, level: "yellow" \| "red", simTime, value, limit }` |
| `falsealerts:update` | Counters change | `{ sessionId, episodes, faultFreeSimDays, perDay, targetPerDay }` |
| `eval:progress` | An evaluation run advances | `{ runId, suite, progress, status }` |
| `error` | Stream or pipeline error | `{ code, message, sessionId? }` |

### 2.3 `telemetry:frame` payload

Columnar to reduce JSON size. One frame holds all ticks since the last frame.

```json
{
  "sessionId": "ses_01",
  "t": [7822, 7823, 7824, 7825],
  "channels": {
    "battery_temp": [24.3, 24.3, 24.4, 24.4],
    "solar_current": [4.7, 4.7, 4.6, 4.6]
  },
  "status": { "wheel_temp": ["missing", "missing", "missing", "missing"] },
  "forecast": { "battery_temp": [23.9, 23.9, 24.0, 24.0] },
  "score": [3.1, 3.4, 3.8, 3.9],
  "threshold": [2.1, 2.1, 2.1, 2.1],
  "flag": [1, 1, 1, 1],
  "regime": ["sunlight", "sunlight", "sunlight", "sunlight"],
  "limitState": { "battery_temp": ["ok", "ok", "ok", "ok"] }
}
```

`forecast` and `status` are sent only for channels the client subscribed to, and `status` is sent only when not all `ok`. Missing values are `null` in `channels`.

---

## 3. Internal ML API (Python FastAPI)

Called only by Node. Base `/ml/v1`.

### 3.1 Service

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service and model status |
| GET | `/models` | Loaded artifacts, versions, training metadata, calibration info |
| POST | `/models/reload` | Reload artifacts from disk |

### 3.2 Sessions and streaming

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions` | Create a pipeline session (simulator, replay or generic) |
| DELETE | `/sessions/{id}` | Destroy |
| POST | `/sessions/{id}/control` | `play`, `pause`, `reset`, `speed`, `seek` |
| PUT | `/sessions/{id}/stress` | Apply stress parameters |
| POST | `/sessions/{id}/dropout` | Schedule a channel dropout |
| POST | `/sessions/{id}/faults` | Inject a fault |
| POST | `/sessions/{id}/faults/random` | Random held-out fault |
| DELETE | `/sessions/{id}/faults/{fault_id}` | Cancel a fault |
| GET | `/sessions/{id}/faults/{fault_id}/truth` | Ground truth |
| PATCH | `/sessions/{id}/detector` | Update false-alarm target and persistence |
| GET | `/sessions/{id}/state` | Snapshot |
| WS | `/ws/stream/{id}` | Per-tick outputs from the pipeline |

**Create session (internal):**

```json
{
  "source": "simulator", "seed": 42, "mismatch_level": "medium", "speed": 4,
  "detector": { "target_false_alarm_rate": 0.01, "persist_k": 5, "persist_n": 8 },
  "dataset": null
}
```

For `smap_msl`: `"dataset": { "name": "smap_msl", "channel_id": "T-1" }`. For `upload`: `"dataset": { "name": "upload", "path": "/data/uploads/upl_03.csv", "mapping": {...}, "warmup_samples": 600 }`.

**WS `/ws/stream/{id}`** messages, server to Node (JSON, one object per message):

| `type` | Content |
|---|---|
| `frame` | Batch of ticks with values, status, forecast, score, threshold, flag, regime, limit state (same columnar layout as `telemetry:frame`) |
| `sensor_status` | Status changes |
| `quality` | Data-quality summary |
| `episode` | Episode state change (opened, updated, closed, suppressed) with classification |
| `incident` | New or updated incident payload (same shape as the public incident, in `snake_case`) |
| `limit_alarm` | Baseline limit alarm |
| `false_alerts` | Counter update |
| `state` | Session status change |
| `error` | Pipeline error |

Node forwards these to the browser as the corresponding Socket.IO events and persists them to MongoDB. If the WebSocket drops, Node reconnects and requests `GET /sessions/{id}/state` to resynchronize.

**Fallback** if the upstream WebSocket proves troublesome: Node calls `POST /sessions/{id}/step` with `{ "ticks": 20 }` on a timer and receives the same `frame` batch plus any events in the response body.

### 3.3 Analysis endpoints (stateless, also used by evaluation)

| Method | Path | Purpose |
|---|---|---|
| POST | `/detect/batch` | Run the detector over a supplied array and return scores and episodes |
| POST | `/classify` | Classify one episode from its features |
| POST | `/rca/analyze` | Rank causes for a window |
| POST | `/explain` | Build explanation text, contributions and recommendations |
| POST | `/dq/process` | Apply the data-quality layer to a raw array |
| POST | `/datasets/inspect` | Inspect a CSV and propose a column mapping |
| POST | `/simulate` | Generate a labelled batch run for dataset building |

**POST `/rca/analyze`** request:

```json
{
  "session_id": "ses_01",
  "window": { "t0": 7752, "t1": 7972 },
  "onset": { "sim_time": 7852, "order": [{ "channel": "solar_current", "t": 7852, "z": -4.1 }] },
  "candidates": ["solar_degradation", "battery_degradation", "heater_stuck_on", "wheel_friction", "radiator_degradation"],
  "available_channels": ["solar_current", "battery_soc", "battery_temp"],
  "max_candidates": 4
}
```

Response:

```json
{
  "ranked": [
    { "hypothesis": "solar_degradation", "posterior": 0.87, "severity_estimate": 0.22, "fit_cost": 1.3, "residual_floor": 1.0 }
  ],
  "unexplained": false,
  "unexplained_threshold": 9.5,
  "fits_completed": 4,
  "elapsed_ms": 640
}
```

**POST `/simulate`** request:

```json
{
  "runs": 200,
  "seed": 7,
  "mismatch_level": "medium",
  "duration_sec": 14400,
  "fault_policy": { "types": ["solar_degradation", "heater_stuck_on", "battery_degradation", "wheel_friction", "radiator_degradation", "sensor_drift", "sensor_stuck"], "severity_range": [0.1, 0.6], "held_out": true },
  "stress": { "missing_pct": 0, "noise_scale": 1.0 },
  "output": "parquet",
  "path": "/data/generated/eval_run_a.parquet"
}
```

### 3.4 Evaluation jobs

| Method | Path | Purpose |
|---|---|---|
| POST | `/eval/run` | Start a suite (same `suite` names as the public API) |
| GET | `/eval/{run_id}` | Status and results |

Results are written to disk as JSON and returned to Node, which stores them in `eval_runs`.

---

## 4. Request flow examples

### 4.1 Start and play

```
Client  POST /api/v1/sessions                     → Node
Node    POST /ml/v1/sessions                      → Python
Client  socket connect /live, session:join
Client  POST /api/v1/sessions/ses_01/control {play}
Node    POST /ml/v1/sessions/ses_01/control
Python  WS /ml/v1/ws/stream/ses_01   frames →  Node  → telemetry:frame → Client
```

### 4.2 Inject a fault and get an incident

```
Client  POST /sessions/ses_01/faults {solar_degradation}
Node    POST /ml/v1/sessions/ses_01/faults
Python  (stream continues) … persistence fires → episode opened
Python  classify → subsystem_fault → incident (analyzing)
Node    incident:created → Client
Python  RCA evidence window fills → fits → incident (open) 
Node    incident:updated → Client      (repeated as confidence refines)
Client  GET /incidents/inc_014          (detail view)
```

### 4.3 Judge upload

```
Client  POST /uploads (file)       → Node → Python /datasets/inspect → columns + mapping
Client  PUT  /uploads/upl_03/mapping
Client  POST /sessions {source: "upload", uploadId}
        → mode generic, warm-up fit, then normal streaming
```

---

## 5. Status codes summary

| Code | Used for |
|---|---|
| 200 | Successful read or action |
| 201 | Created (session, fault, upload) |
| 202 | Accepted (evaluation run queued) |
| 204 | Deleted with no body |
| 400, 404, 409, 413, 415, 422, 429 | Client errors per the table in section 0 |
| 403 | `TRUTH_LOCKED` for ground-truth requests |
| 500, 502, 504 | Server and upstream errors |
