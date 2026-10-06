# ASTRIAL — Spacecraft Telemetry Root-Cause Analysis & Health Monitor

## 1. What this is
ASTRIAL is an operator decision-support platform built for the ST-01 spacecraft telemetry monitoring and root-cause analysis challenge. It processes multi-channel satellite telemetry streams, computes forecasting residuals to detect anomalies, traverses a subsystem causal dependency graph to identify root causes, and recommends Failure Mode and Effects Analysis (FMEA) mitigation actions in real time. The platform is designed specifically for satellite subsystem engineers, mission controllers, and flight operators. ASTRIAL operates strictly as an advisory monitoring tool for human operators and **never commands, actuates, or modifies spacecraft configuration directly**.

---

## 2. Platform flow

### A. Real data flow

```text
[ synthetic_telemetry_clean.csv / Raw Telemetry Batch ]
                       │
                       ▼
         [ Telemetry Quality Processor ]
     (MinMax Scaling, NaN Masking, Forward Fill)
                       │
                       ▼
          [ PyTorch GRU Forecaster ]
        (32-step window, 23 sensor channels)
                       │
                       ▼
             [ Residual Vector ]
             e(t) = |y(t) - ŷ(t)|
                       │
                       ▼
     [ Conformal Calibration Threshold ]
           (P99 score normalization)
                       │
                       ▼
           [ Persistence Filter ]
             (k-of-n window rule)
                       │
                       ▼
     [ NetworkX Root Cause DAG Engine ]
     (Topological traversal on dependency graph)
                       │
                       ▼
     [ Safety Engine & Explainer Engine ]
  (FMEA rule matching & natural language synthesis)
                       │
                       ▼
      [ Node.js Gateway & Stream Bridge ]
     (Express REST API + Socket.IO live broadcast)
                       │
                       ▼
     [ React 18 Mission Control Dashboard ]
  (Live charts, Dynamic DAG, Incident Details, Alerts)
```

### B. User flow
1. **Open Dashboard**: Navigate to `/` ([`frontend/src/pages/MissionControl.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/MissionControl.jsx)). Loads active session state, signal catalog, and initial telemetry buffer.
2. **Play / Start Simulation**: Click the **Play** button in the header ([`MissionControl.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/MissionControl.jsx)). Triggers `POST /api/v1/sessions/:id/control` with `{ action: "play" }` to start the 1 Hz telemetry stream.
3. **Inject a Fault**: Navigate to `/fault-injection` ([`frontend/src/pages/FaultInjection.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/FaultInjection.jsx)). Select a fault type (e.g., `solar_degradation`, `heater_stuck_on`) and severity, then submit. Triggers `POST /api/v1/sessions/:id/faults`.
4. **Receive / View Alert**: Real-time Socket.IO event `incident:new` / `incident:created` is received by [`TelemetryContext.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/context/TelemetryContext.jsx) and rendered immediately in [`AlertsPanel.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/AlertsPanel.jsx) with subsystem severity.
5. **Open Incident Details**: Click the alert card or navigate to `/incidents/:id` ([`frontend/src/pages/IncidentDetail.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/IncidentDetail.jsx)). Fetches `GET /api/v1/incidents/:id`, rendering the dynamic DAG ([`RootCauseGraph.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/RootCauseGraph.jsx)), downstream impacts ([`DownstreamImpact.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/DownstreamImpact.jsx)), and FMEA actions ([`FmeaRecommendations.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/FmeaRecommendations.jsx)).
6. **Acknowledge Incident**: Click **Acknowledge** in [`IncidentDetail.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/IncidentDetail.jsx). Calls `POST /api/v1/incidents/:id/acknowledge`, updating incident status to `acknowledged`.
7. **Open Evaluation Page**: Navigate to `/evaluation` ([`frontend/src/pages/EvaluationReport.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/EvaluationReport.jsx)). Fetches summary and benchmark data from `GET /api/v1/evaluation/*`.

### C. Service responsibilities

| Service | Port / Protocol | Implementation | Core Responsibilities |
|---|---|---|---|
| **Client / Frontend** | `5173` (HTTP) | React 18, Vite, TailwindCSS | Connects to Socket.IO `/live`, buffers incoming telemetry frames, renders real-time Recharts, dynamic SVG DAG graphs, fault controls, and incident triage views. |
| **Node.js Gateway** | `5000` (REST & Socket.IO) | Express, Socket.IO | Manages session lifecycle, streams CSV rows at selected multipliers (1x–60x), bridges telemetry frames to live clients, manages in-memory/MongoDB incident stores, and proxies ML requests. |
| **Python ML Service** | `8000` (REST & WebSocket) | FastAPI, PyTorch, NetworkX | Loads model weights via SHA256 manifest check, executes GRU forecasting inference, computes conformal anomaly scores, evaluates graph topology for root causes, and generates FMEA explanations. |
| **Database** | `27017` / Atlas | MongoDB (Mongoose) | Persists sessions, incident history, fault logs, and evaluation runs. (Backed by in-memory fallback stores when offline). |

---

## 3. Currently implemented features

| Feature Name | Current Implementation | Relevant Path | Status |
|---|---|---|---|
| **CSV Telemetry Playback** | Steps through `synthetic_telemetry_clean.csv` rows at calibrated 1 Hz (1x speed) without synthetic distortion. | [`backend/src/services/mockSimulator.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js) | **REAL** |
| **Real-Time Stream Bridge** | Dispatches synchronized telemetry frames, channel values, orbital phase, and alerts via Socket.IO `/live`. | [`backend/src/services/streamBridge.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/streamBridge.js) | **REAL** |
| **GRU PyTorch Forecaster** | 2-layer GRU (input: 50, hidden: 64, output: 23) performing forward passes on 32-step telemetry windows. | [`ml/src/spacecraft_rca/models/gru_forecaster.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/gru_forecaster.py) | **REAL** |
| **Conformal Calibration** | Computes sensor residual vectors against calibrated $P_{99}$ error percentiles from validation splits. | [`ml/src/spacecraft_rca/api/main.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/api/main.py#L126-L159) | **REAL** |
| **DAG Root-Cause Isolation** | Constructs directed graphs from `dependency_graph.csv` and traverses upstream/downstream relations using NetworkX. | [`ml/src/spacecraft_rca/models/root_cause.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/root_cause.py) | **REAL** |
| **FMEA Safety Rule Engine** | Evaluates anomalous signals against `risk_action_rules.csv` triggers to output categorized risk levels and actions. | [`ml/src/spacecraft_rca/models/safety_engine.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/safety_engine.py) | **REAL** |
| **Dynamic DAG Visualization** | React SVG rendering of connected subsystem nodes, coupling labels, live residuals, and causal edge animations. | [`frontend/src/components/RootCauseGraph.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/RootCauseGraph.jsx) | **REAL** |
| **Fault Injection Workflow** | Triggers physical deviations (e.g. thermal surges, solar dropoffs) and immediately registers incident records. | [`backend/src/services/sessionService.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/sessionService.js#L274-L351) | **REAL** |
| **Live Telemetry Charts** | Battery Temperature, Solar Current, and Anomaly Score charts with nominal shading and real-time updates. | [`frontend/src/components/BatteryTemperatureChart.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/BatteryTemperatureChart.jsx) | **REAL** |
| **Incident Lifecycle Management** | Acknowledge, dismiss, close, and inspect incidents with persisted state. | [`backend/src/services/incidentStore.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/incidentStore.js) | **REAL** |
| **Evaluation Dashboard** | Displays detection, false-alert, and root-cause benchmark tables and matrices. | [`frontend/src/pages/EvaluationReport.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/EvaluationReport.jsx) | **STATIC** |

---

## 4. Status

| Subsystem | Feature | Status | Evidence File / Path |
|---|---|---|---|
| **Simulator** | CSV Data Streaming | **REAL** | [`backend/src/services/mockSimulator.js:168`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js#L168) |
| **Simulator** | Fault Impact Synthesis (Thermal/Solar) | **REAL** | [`backend/src/services/mockSimulator.js:133-163`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js#L133-L163) |
| **Simulator** | Orbital Phase & Eclipse Calculation | **REAL** | [`backend/src/services/sessionService.js:222-247`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/sessionService.js#L222-L247) |
| **Data Quality** | Scaler Transform & Missing Data Mask | **REAL** | [`ml/src/spacecraft_rca/data/quality.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/data/quality.py) |
| **Data Quality** | Live Stress & Channel Dropout Injection | **PARTIAL** | [`backend/src/controllers/stressController.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/controllers/stressController.js) |
| **Detection** | PyTorch GRU Telemetry Forecaster | **REAL** | [`ml/src/spacecraft_rca/models/gru_forecaster.py`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/gru_forecaster.py) |
| **Detection** | Conformal Score Thresholding ($P_{99}$) | **REAL** | [`ml/src/spacecraft_rca/api/main.py:278-285`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/api/main.py#L278-L285) |
| **Detection** | Persistence Filter ($k$-of-$n$) | **REAL** | [`backend/src/services/mockSimulator.js:333-340`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js#L333-L340) |
| **Classification** | Noise vs Sensor vs Subsystem Decision Tree | **PARTIAL** | Hardcoded rule branches in [`mockSimulator.js:417-425`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js#L417-L425) |
| **Root Cause** | NetworkX Dependency DAG Traversal | **REAL** | [`ml/src/spacecraft_rca/models/root_cause.py:41-68`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/root_cause.py#L41-L68) |
| **Root Cause** | Downstream Subsystem Reachability | **REAL** | [`ml/src/spacecraft_rca/models/root_cause.py:70-75`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/root_cause.py#L70-L75) |
| **Explanation & Actions** | FMEA Risk Rule Lookup | **REAL** | [`ml/src/spacecraft_rca/models/safety_engine.py:9-55`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/safety_engine.py#L9-L55) |
| **Explanation & Actions** | Forecast Deviation Explanation String | **REAL** | [`ml/src/spacecraft_rca/models/explain.py:4-40`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/ml/src/spacecraft_rca/models/explain.py#L4-L40) |
| **Dashboard** | Real-Time Telemetry & Anomaly Charts | **REAL** | [`frontend/src/pages/MissionControl.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/pages/MissionControl.jsx) |
| **Dashboard** | Dynamic Incident DAG View | **REAL** | [`frontend/src/components/RootCauseGraph.jsx`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/frontend/src/components/RootCauseGraph.jsx) |
| **Evaluation** | Precomputed Benchmark Metric Endpoints | **STATIC** | Served from static fixtures in [`backend/src/data/evaluationData.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/data/evaluationData.js) |
| **Evaluation** | Real-Time On-Demand Eval Execution Run | **MOCKED** | Simulated timer increment in [`backend/src/services/evalService.js:79-102`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/evalService.js#L79-L102) |

---

## 5. Measured results

Not yet measured.

*(Note: While the GRU forecaster model weights are trained and loaded via `gru_state_dict.safetensors`, end-to-end SMAP/MSL benchmark sweeps and offline evaluation numbers displayed on `/evaluation` are served from precomputed baseline reference datasets in [`backend/src/data/evaluationData.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/data/evaluationData.js) and have not yet been generated dynamically by an automated multi-seed benchmark runner script).*

---

## 6. How to run

### Prerequisites
- **Node.js**: v18.0.0 or later
- **Python**: v3.10 to v3.12 (with PyTorch and FastAPI)
- **Git** & **npm**

### Required Ports
- **Frontend**: `5173`
- **Backend Gateway**: `5000`
- **Python ML Service**: `8000`

---

### Step 1: Start the Python ML Service

```powershell
# Open Terminal 1
cd ml

# 1. Activate virtual environment
.\venv\Scripts\Activate.ps1    # (Linux/macOS: source venv/bin/activate)

# 2. Install dependencies (verified)
pip install -r requirements.txt

# 3. Start FastAPI server on port 8000 (verified)
python -m uvicorn spacecraft_rca.api.main:app --host 127.0.0.1 --port 8000
```

> **Verification**: Run `curl.exe -s http://127.0.0.1:8000/health`. Expected response: `{"status":"up","service":"Spacecraft RCA API","models_loaded":true}`.

---

### Step 2: Start the Node.js Gateway Backend

```powershell
# Open Terminal 2
cd backend

# 1. Install dependencies (verified)
npm install

# 2. Start server in development mode (verified)
npm run dev
```

> **Verification**: Run `curl.exe -s http://localhost:5000/api/v1/health`. Expected response: `{"status":"ok","node":"up","mongo":"up","ml":"up","modelsLoaded":true,"version":"1.0.0"}`.

---

### Step 3: Start the React Frontend

```powershell
# Open Terminal 3
cd frontend

# 1. Install dependencies (verified)
npm install

# 2. Start Vite development server (verified)
npm run dev
```

> **Verification**: Open `http://localhost:5173` in your browser. The Mission Control dashboard will load.

---

## 7. Demo script

### Verified 5-Minute Live Demo Procedure

1. **Dashboard Initialization**:
   - Open `http://localhost:5173` in Google Chrome or Edge.
   - Verify the connection status shows **LIVE** and the mission clock starts at nominal offset (`02:14:36`).
   - Notice the nominal telemetry baseline: Battery Temperature is stable at ~21.8°C (within the 18°C–26°C green band), Solar Current is at ~3.07A, and Anomaly Score is below the 2.1 threshold.

2. **Playback Speed Controls**:
   - The stream runs at **1x** (1 simulated second per real second).
   - Use the speed dropdown to switch to **2x** or **4x** to observe accelerated data flow. Return to **1x** for clear observation.

3. **Fault Injection**:
   - Click **Fault Injection** in the left sidebar (`/fault-injection`).
   - Select **Solar Array Degradation** or **Heater Stuck On**.
   - Leave severity at default (`0.65`) and click **Inject Fault**.
   - A success notification will confirm fault activation.

4. **Real-Time Telemetry & Alert Triage**:
   - Return to **Mission Control** (`/`).
   - Observe the live telemetry chart: Battery Temperature immediately begins surging toward ~40.5°C and Solar Current deviates.
   - The Anomaly Score spikes above the threshold line (Score: ~15.0).
   - A **CRITICAL** alert appears immediately in the right-side Alerts panel: *"solar array degradation active - Root cause analysis generated"*.

5. **Deep-Dive Root Cause & FMEA Inspection**:
   - Click the alert card or navigate to **Incidents** (`/incidents`) and select the incident.
   - Inspect the dynamic **Causal Dependency Graph (DAG)**:
     - Nodes reflect live spacecraft subsystems (POWER, THERMAL, ATTITUDE, COMMS, PROPULSION).
     - Upstream root causes and downstream affected paths are highlighted with coupling labels.
   - Inspect the **Ranked Hypotheses** and **FMEA Recommended Actions** (e.g. shed non-critical payload loads).
   - Click **Acknowledge** to update incident status.

6. **What to AVOID during the live demo**:
   - **Do NOT** rely on the `/evaluation` page live benchmark trigger (`POST /api/v1/evaluation/runs`) as a live real-time benchmark run; it triggers a simulated timer progress bar rather than running a fresh multi-hour test sweep.

---

## 8. Known limitations

1. **Static Benchmark Metrics on Evaluation Tab**: Benchmark figures (precision, recall, F1, and false-alarm rates) displayed on `/evaluation` are served from precomputed static JSON objects in [`backend/src/data/evaluationData.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/data/evaluationData.js) rather than computed on-the-fly.
2. **Ground-Truth Leakage in Standalone Simulation Mode**: In [`backend/src/services/mockSimulator.js`](file:///c:/Users/Akshay%20Kokate/Desktop/astrial/backend/src/services/mockSimulator.js), the standalone mock simulator passes the known injected `fault.type` and `fault.severity` to initialize the fallback incident structure when the Python ML microservice is bypassed.
3. **Classification Tree Simplification**: The decision tree separating noise bursts, sensor faults, and subsystem faults relies on hardcoded probabilistic rules rather than an independently trained scikit-learn decision tree classifier.
4. **NASA SMAP/MSL Direct Ingestion**: While channel metadata matches NASA telemetry conventions, dynamic file ingestion of raw binary `.pkl` files from SMAP/MSL requires manual conversion to CSV.

---

## 9. What we can add next

### Priority 0 (High Impact / Demo Essential)
- **Dynamic Benchmark Runner** *(8 hours)*: Implement a background execution script (`ml/scripts/eval_smap.py`) that executes the GRU model against all 24 SMAP/MSL channels and dynamically pipes real $F_1$, precision, recall, and detection delay to `/evaluation`.
- **Eliminate Simulation Leakage** *(4 hours)*: Refactor `mockSimulator.js` so that incident creation and hypothesis ranking are strictly derived from Python ML residual vectors without checking active fault metadata.

### Priority 1 (Judging Criteria Boost)
- **Digital Twin Sync View** *(6 hours)*: Add a side-by-side comparative visualizer contrasting real telemetry ($y_t$) against physics-informed twin forecasts ($\hat{y}_t$) with live residual error bands.
- **Battery Remaining Useful Life (RUL) Estimator** *(5 hours)*: Incorporate an electrochemical degradation curve predicting remaining operational cycles during thermal surges.

### Priority 2 (Advanced Capabilities)
- **Operator Advisory Verification Simulator** *(8 hours)*: Allow operators to "dry run" recommended FMEA recovery actions in a sandbox simulator to verify recovery before applying changes.
- **Historical Incident Vector Search** *(6 hours)*: Embed past telemetry anomalies into a vector database (e.g., ChromaDB) for instant retrieval of similar historical anomalies.

---

## 10. Project structure

```text
astrial/
├── backend/                       # Node.js Gateway & Real-Time Server (:5000)
│   ├── src/
│   │   ├── controllers/           # REST endpoint controllers (sessions, faults, incidents, eval)
│   │   ├── data/                  # Signal catalogs, fault rules, static evaluation datasets
│   │   ├── models/                # Mongoose schemas (Session, Incident, Fault, Telemetry)
│   │   ├── routes/                # Express API routes (/api/v1/*)
│   │   ├── services/              # Simulator engine, stream bridge, session service, ML proxy
│   │   └── sockets/               # Socket.IO live stream hub (/live)
│   └── package.json
├── frontend/                      # React 18 + Vite Mission Control Dashboard (:5173)
│   ├── src/
│   │   ├── components/            # Real-time charts, dynamic DAG graph, alerts, telemetry widgets
│   │   ├── context/               # TelemetryContext (Socket.IO client, stream buffer)
│   │   ├── pages/                 # Mission Control, Incidents, Fault Injection, Evaluation
│   │   └── utils/                 # Unit normalizers, formatters, graph layout helpers
│   └── package.json
├── ml/                            # Python PyTorch & FastAPI ML Microservice (:8000)
│   ├── artifacts/                 # Serialized weights (gru_state_dict.safetensors, splits.json)
│   ├── src/spacecraft_rca/
│   │   ├── api/                   # FastAPI application, REST endpoints, WebSocket manager
│   │   ├── data/                  # Quality processing, normalizers, missing value masks
│   │   ├── models/                # GRUForecaster, RootCauseEngine (NetworkX), SafetyEngine
│   │   └── utils/                 # SHA256 artifact verification, loggers
│   ├── requirements.txt
│   └── setup.py
├── INITIUM_TECHFEST_2026_27_DATA_PACK/
│   ├── data/                      # synthetic_telemetry_clean.csv (80,000+ rows)
│   └── metadata/                  # signal_catalog.csv, dependency_graph.csv, risk_action_rules.csv
├── docs/                          # Architecture specs, PRD, and API endpoint references
└── README.md                      # System documentation & verification audit
```

---

## 11. Honest summary

ASTRIAL features a fully working, real-time end-to-end telemetry monitoring and root-cause analysis pipeline. The React frontend, Node.js gateway, and Python PyTorch/NetworkX ML services run concurrently and communicate via HTTP and Socket.IO. Ingesting raw CSV telemetry, injecting physical faults, computing GRU forecasting deviations, isolating root-cause subsystems via causal DAG traversal, generating natural language explanations, and rendering interactive mission control charts work seamlessly. The primary areas currently relying on static or mocked components are the offline benchmark metrics and simulated progress bar on the Evaluation page, which serve reference data rather than running an on-demand live evaluation sweep.
