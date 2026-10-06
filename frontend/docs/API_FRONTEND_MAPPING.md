# Frontend to Backend API Mapping

This document maps every frontend feature and component to its exact backend REST endpoint and Socket.IO real-time event.

| Feature | Backend Endpoint / Event | Method / Protocol | Request Payload | Response / Event Data | Frontend Consumer |
|---------|--------------------------|-------------------|-----------------|----------------------|-------------------|
| **List Sessions** | `/api/v1/sessions` | `GET` | None | `{ data: Session[], meta: { count } }` | `TelemetryContext.jsx` (`setupBackendSession`) |
| **Create Session** | `/api/v1/sessions` | `POST` | `{ source: "simulator", speed: 4, seed: 42, mismatchLevel: "medium" }` | `Session` object | `TelemetryContext.jsx` (`setupBackendSession`) |
| **Get Session State** | `/api/v1/sessions/:id/state` | `GET` | None | `SessionState` object | `TelemetryContext.jsx` (`loadInitialData`) |
| **Control Session (Play/Pause/Speed/Reset)** | `/api/v1/sessions/:id/control` | `POST` | `{ action: "play" \| "pause" \| "speed" \| "reset", speed?: number }` | `SessionState` object | `TelemetryContext.jsx` (`play`, `pause`, `changeSpeed`, `reset`) |
| **Get Telemetry History** | `/api/v1/sessions/:id/telemetry` | `GET` | `?downsample=100` | `{ t: number[], channels: Record<string, number[]>, score: number[], threshold: number[] }` | `TelemetryContext.jsx` (`loadInitialData`) |
| **List Incidents** | `/api/v1/incidents` | `GET` | `?sessionId=:id` | `{ data: Incident[], meta: { count } }` | `TelemetryContext.jsx` (`loadInitialData`) |
| **Join Session Room** | `/live` namespace | `Socket.IO (session:join)` | `{ sessionId }` | Subscribes client to session room `session:${sessionId}` | `TelemetryContext.jsx` (`onConnect`) |
| **Live Telemetry Stream** | `/live` namespace | `Socket.IO (telemetry:frame)` | Streamed from backend stream bridge | `{ t: number[], channels: Record<string, number[]>, score: number[], threshold: number[], flag: number[] }` | `TelemetryContext.jsx` (`onTelemetryFrame`) → `BatteryTemperatureChart`, `SolarCurrentChart`, `AnomalyScoreChart` |
| **Live Session State Update** | `/live` namespace | `Socket.IO (session:state)` | Streamed from backend | `SessionState` object | `TelemetryContext.jsx` (`onSessionState`) → `Header`, `SubsystemHealth` |
| **Live Incident Broadcast** | `/live` namespace | `Socket.IO (incident:created)` | Streamed on anomaly detection | `Incident` object | `TelemetryContext.jsx` (`onIncidentCreated`) → `AlertsPanel`, `RecentEvents` |
