# Tech Stack: Initium Spacecraft Health Monitor

Stack: **MERN (MongoDB, Express, React, Node) + Python ML service**. Styling with **Bootstrap** and animation with **Framer Motion**.

> Pin exact versions on day one (`package-lock.json`, `requirements.txt` with hashes or a lock file) and use `npm ci` and `pip install -r` on every machine. Versions below are major lines, not guarantees. Check peer dependencies when you install, especially for Cesium, React Three Fiber and Plotly.

---

## 1. Overview

```
┌─────────────────────────┐   REST + Socket.IO   ┌────────────────────────┐   REST + WebSocket   ┌─────────────────────────┐
│ React client (Vite)     │ ◄──────────────────► │ Node + Express         │ ◄──────────────────► │ Python FastAPI service  │
│ Bootstrap, Framer       │                      │ Socket.IO, Mongoose    │                      │ Simulator, ML, RCA      │
│ ECharts, Cytoscape, ... │                      │ API gateway + storage  │                      │ PyTorch, scikit-learn   │
└─────────────────────────┘                      └───────────┬────────────┘                      └─────────────────────────┘
                                                             │
                                                      ┌──────▼──────┐
                                                      │  MongoDB    │
                                                      └─────────────┘
```

| Layer | Technology | Role |
|---|---|---|
| Frontend | React, Vite, React Router | Single-page dashboard |
| UI and styling | Bootstrap 5.3 (react-bootstrap), SCSS, Framer Motion | Layout, dark mission-control theme, animation |
| Charts | ECharts (primary), Recharts, Plotly, Chart.js | See section 2.3 for each library's role |
| Graph | Cytoscape.js | Root-cause and dependency graph |
| 3D and orbit | CesiumJS, Three.js | Orbit view and spacecraft view (both P2) |
| Realtime | Socket.IO | Live frames and events to the browser |
| API gateway | Node.js, Express | REST API, orchestration, persistence, uploads |
| Database | MongoDB (time-series collections) | Sessions, telemetry, incidents, evaluation results |
| ML service | Python, FastAPI | Simulator, data quality, detection, classification, root cause, explanation, evaluation |
| ML libraries | PyTorch (CPU), scikit-learn, NumPy, SciPy, pandas | Models and numerics |

---

## 2. Frontend

### 2.1 Core

| Package | Purpose | Notes |
|---|---|---|
| `react`, `react-dom` | UI | Functional components and hooks |
| `vite`, `@vitejs/plugin-react` | Build and dev server | Fast HMR; supports code-splitting for heavy libraries |
| `react-router-dom` | Routing | Routes listed in `architecture.md` |
| `zustand` | State management | Small stores; telemetry kept in ring buffers outside React state where possible |
| `@tanstack/react-query` | REST data fetching and cache | For incidents, evaluation, metadata |
| `socket.io-client` | Realtime | Subscribes to the live namespace |
| `axios` | HTTP client | Shared instance with error normalization |
| `zod` | Runtime validation (optional) | Validate socket and API payloads in development |
| `dayjs` | Time formatting | Mission time and wall-clock |
| `papaparse` | CSV preview on upload | Parse the first rows in the browser before sending |
| `react-hot-toast` | Notifications | Alerts, upload results |

### 2.2 UI, styling and animation

| Package | Purpose | Notes |
|---|---|---|
| `bootstrap` (5.3) | Grid, components, utilities | Use `data-bs-theme="dark"` plus SCSS variable overrides for the mission-control look |
| `react-bootstrap` | React bindings for Bootstrap components | Modals, offcanvas (fault drawer), tabs, badges, tooltips |
| `sass` | SCSS theming | One `theme.scss` for colours, fonts, spacing; avoid scattered inline styles |
| `framer-motion` | Animation | See below |
| `bootstrap-icons` or `lucide-react` | Icons | Pick one |
| Fonts (self-hosted) | Typography | For example IBM Plex Mono for readouts and Roboto Condensed for headings. Self-host with `@fontsource/*` so nothing loads from the internet |

**Framer Motion usage (keep it purposeful):**

| Use | Where |
|---|---|
| `AnimatePresence` slide-in and fade-out | Alert list, incident cards, toasts |
| Layout animation | Reordering ranked causes when the posterior changes |
| Animated number transitions | Confidence, false-alert counter, lead time |
| Staggered entrance | Incident detail panels, evaluation cards |
| Pulse and glow variants | Subsystem health tiles on state change |
| Page transitions | Route changes |

Performance rule: do **not** animate chart canvases or per-tick updates with Framer Motion. Use it for UI chrome only.

### 2.3 Charts: who does what

Four chart libraries (plus Cytoscape, Cesium and Three.js below) is heavy, so each gets a narrow job. If the schedule slips, cut Chart.js and Recharts first and do their jobs with ECharts.

| Library | Role | Where it is used | Priority |
|---|---|---|---|
| **Apache ECharts** (`echarts`, `echarts-for-react`) | **Primary** real-time engine | Multi-channel live telemetry, anomaly score with threshold line, anomaly markers and shaded regions, correlation heatmap, limit vs detector comparison | P0 |
| **Recharts** (`recharts`) | Small declarative widgets | KPI sparklines, per-channel contribution bars, confidence history | P0 |
| **Plotly** (`plotly.js-cartesian-dist-min`, `react-plotly.js`) | Evaluation and analysis plots | Robustness curves, false-alert vs noise curves, confusion matrices, reliability diagram, distribution of lead times | P0 for evaluation page |
| **Chart.js** (`chart.js`, `react-chartjs-2`) | Gauges and doughnuts | Risk gauge, data-quality score, subsystem health doughnut | P1 |

Notes:

- **ECharts**: import only the modules you use (`echarts/core`, `LineChart`, `HeatmapChart`, `MarkLineComponent`, `MarkAreaComponent`, `DataZoomComponent`, `CanvasRenderer`). Feed it ring-buffer slices and use `appendData` or throttled `setOption` with `notMerge: false`. Disable animation on streaming series.
- **Plotly**: use a partial bundle (`plotly.js-cartesian-dist-min`) and **lazy-load** the Evaluation route. The full bundle is very large.
- **Chart.js**: register only the controllers you need.

### 2.4 Graph visualization

| Package | Purpose |
|---|---|
| `cytoscape` | Graph engine |
| `react-cytoscapejs` | React wrapper |
| `cytoscape-dagre` | Layered layout for cause-to-effect direction (alternative: `cytoscape-fcose`) |

Used for the root-cause graph (source highlighted, affected nodes coloured, edge labels for lags) and the static dependency graph in a metadata view.

### 2.5 3D and orbit (P2)

| Package | Purpose | Notes |
|---|---|---|
| `cesium` | Globe, orbit path, ground track, eclipse shading | Large. Lazy-load the route. Copy Cesium's static assets with `vite-plugin-cesium` or equivalent. Use the **bundled offline imagery** so the demo needs no Cesium ion token or network. Verify that setup works in your build before relying on it. |
| `resium` (optional) | React components for Cesium | Check React version compatibility. Raw Cesium in a `useEffect` is an acceptable fallback. |
| `three` | 3D engine | |
| `@react-three/fiber`, `@react-three/drei` | React renderer and helpers for Three.js | Simple spacecraft model (primitive meshes are fine) with subsystem parts coloured by health |

If time is short, drop both and keep a 2D ground-track chart in ECharts.

### 2.6 Frontend dev tooling

| Tool | Purpose |
|---|---|
| ESLint, Prettier | Lint and format |
| Vitest, React Testing Library | Unit tests for utilities and key components |
| Playwright (optional) | One smoke test of the demo flow |

---

## 3. Backend (Node.js)

| Package | Purpose |
|---|---|
| `node` 20 or 22 LTS | Runtime |
| `express` | HTTP server and routing |
| `socket.io` | Realtime fan-out to browsers |
| `ws` | WebSocket client to the Python stream |
| `mongoose` | MongoDB ODM |
| `axios` | HTTP client to the Python service |
| `zod` | Request validation |
| `multer` | CSV upload (memory or disk, with size limit) |
| `csv-parse` | Server-side CSV sniffing for column detection |
| `cors`, `helmet` | CORS and basic security headers |
| `express-rate-limit` | Basic rate limiting on upload and control routes |
| `pino`, `pino-http` | Structured logging |
| `dotenv` | Configuration |
| `uuid` or `nanoid` | IDs |
| `nodemon` | Dev reload |
| `jest` + `supertest` (or Vitest) | API tests |

Responsibilities in one line: **Node is the gateway.** It exposes the public API, relays the live stream, stores everything and serves results. It contains no ML logic.

---

## 4. Database

| Item | Choice |
|---|---|
| Database | MongoDB 7 (local install or Docker; Atlas free tier is also fine) |
| Telemetry storage | **Time-series collection** (`timeField: ts`, `metaField: meta`) |
| Other collections | `sessions`, `faults`, `anomalies`, `incidents`, `eval_runs`, `uploads` |
| Tools | MongoDB Compass for inspection |

Fallback if time-series collections cause trouble: a normal collection with an index on `{sessionId, ts}`. Data volume in a 24-hour hackathon is small.

The organizers list a time-series DB as a suggestion only. MongoDB time-series collections are an acceptable answer. InfluxDB or TimescaleDB are not needed.

---

## 5. ML service (Python)

### 5.1 Runtime and API

| Package | Purpose |
|---|---|
| Python 3.11 | Runtime |
| `fastapi` | Service framework (matches the organizers' suggestion) |
| `uvicorn[standard]` | ASGI server with WebSocket support |
| `pydantic` v2 | Schemas and validation |
| `python-multipart` | Form handling if needed |
| `websockets` | WebSocket support |
| `orjson` | Fast JSON serialization for frames |

### 5.2 Scientific and ML

| Package | Purpose |
|---|---|
| `numpy`, `scipy` | Numerics, simulation integration, optimization (`scipy.optimize` for severity fitting) |
| `pandas` | Data handling, CSV ingestion, resampling |
| `torch` (CPU build) | GRU predictor. Install the CPU wheel to keep the install small. |
| `scikit-learn` | Isolation Forest, decision tree, scalers, ridge regression for cross-sensor checks |
| `statsmodels` (optional) | Granger tests if used as a secondary lag check |
| `networkx` | Dependency graph operations and path queries |
| `shap` (P1) | TreeSHAP for Isolation Forest |
| `joblib` | Persisting scikit-learn artifacts |
| `jinja2` | Explanation templates |
| `matplotlib` (offline only) | Quick plots during development, not served |

Conformal calibration, CUSUM and persistence are small custom modules (NumPy only). No extra package is needed.

### 5.3 Python dev tooling

| Tool | Purpose |
|---|---|
| `pytest` | Tests, especially simulator invariants and metric functions |
| `ruff`, `black` | Lint and format |
| `python-dotenv` | Configuration |
| `tqdm` | Progress during dataset generation and training |

---

## 6. DevOps and workflow

| Item | Decision |
|---|---|
| Repo | Monorepo: `client/`, `server/`, `ml-service/`, `docs/` |
| Version control | Git and GitHub, short-lived feature branches, merge to `main` often |
| Local run | `concurrently` (root `package.json`) starts client, server and ML service together |
| Containers | **Optional.** A `docker-compose.yml` for MongoDB only is fine. Do not spend time containerizing the app. |
| Cloud | None. Demo runs locally. |
| CI | None needed for 24 h |
| Backup | Pre-recorded demo video, exported evaluation results as JSON, trained model artifacts committed to a release or shared drive |

### Ports and environment

| Service | Port | Key env vars |
|---|---|---|
| Client (Vite) | 5173 | `VITE_API_URL`, `VITE_SOCKET_URL` |
| Node server | 5000 | `PORT`, `MONGO_URI`, `ML_BASE_URL`, `ML_WS_URL`, `CLIENT_ORIGIN`, `UPLOAD_MAX_MB` |
| Python ML | 8000 | `MODEL_DIR`, `DATA_DIR`, `DEFAULT_SEED`, `LOG_LEVEL` |
| MongoDB | 27017 | none |

---

## 7. Datasets and data tools

| Source | Format | Loader |
|---|---|---|
| Simulator output | Generated in memory, exportable to CSV or Parquet | `ml-service/app/sim` |
| NASA SMAP/MSL | `.npy` per channel plus `labeled_anomalies.csv` | `ml-service/app/eval/detection_smap.py` |
| OPSSAT-AD (optional) | `segments.csv`, `dataset.csv` | Same adapter pattern |
| ESA-ADB (optional) | Large mission files | Load a slice only |
| User CSV | Any columns | Node sniffs columns, Python normalizes |

Optional: `pyarrow` for Parquet when exporting generated datasets.

---

## 8. What we are deliberately not using

| Not used | Why |
|---|---|
| AWS, Kubernetes | Time sink, not judged |
| InfluxDB or TimescaleDB | MongoDB time-series is enough, and a new database costs setup time |
| A separate message broker (Kafka, RabbitMQ, Redis) | Python-to-Node WebSocket is enough at this scale |
| Auth and user accounts | Single-user demo |
| TypeScript | Optional. JavaScript is acceptable. Use JSDoc types or Zod at boundaries if you want safety. |
| K-Means, DBSCAN, Bayesian Networks | Not in the final pipeline. Remove them from the deck. |
| Heavy MLOps (MLflow, DVC) | Save model files and a short `README` with the training command |

---

## 9. Install cheat sheet

```bash
# Client
cd client
npm i react react-dom react-router-dom zustand @tanstack/react-query socket.io-client axios dayjs papaparse react-hot-toast zod
npm i bootstrap react-bootstrap sass framer-motion bootstrap-icons @fontsource/ibm-plex-mono @fontsource/roboto-condensed
npm i echarts echarts-for-react recharts chart.js react-chartjs-2
npm i plotly.js-cartesian-dist-min react-plotly.js
npm i cytoscape react-cytoscapejs cytoscape-dagre
# P2 only
npm i cesium resium vite-plugin-cesium three @react-three/fiber @react-three/drei
npm i -D vite @vitejs/plugin-react eslint prettier vitest @testing-library/react

# Server
cd ../server
npm i express socket.io ws mongoose axios zod multer csv-parse cors helmet express-rate-limit pino pino-http dotenv nanoid
npm i -D nodemon jest supertest

# ML service
cd ../ml-service
python -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" pydantic orjson websockets python-multipart
pip install numpy scipy pandas scikit-learn networkx joblib jinja2 shap statsmodels pyarrow
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install pytest ruff black tqdm python-dotenv
```

If a package name or index URL has changed, check its official install page. These commands are a starting point.

---

## 10. Compatibility and performance notes

- **React Three Fiber and Resium** depend on the React major version. Check peer dependency warnings before committing to them.
- **Cesium with Vite** needs its static assets copied and a base URL set. If this takes more than about 30 minutes, drop the orbit view.
- **Plotly** partial bundle supports the chart types we need (scatter, line, heatmap, bar). It does not include 3D or maps.
- **Streaming charts**: keep per-channel ring buffers (typed arrays) outside React state, update charts on a throttled timer (about 5 Hz), and render only visible channels.
- **PyTorch CPU** inference on a 14-channel by 60-step window is fast enough for one-step prediction at 60 samples per second of playback. Batch ticks when playing at high speed.
- **Socket.IO** payloads use columnar arrays (one array per channel) to cut JSON overhead.
- **Windows laptops**: use a Python venv, keep paths free of spaces, and test the `concurrently` script on the demo machine early.
