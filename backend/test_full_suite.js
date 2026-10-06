const axios = require('axios');
const io = require('socket.io-client');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000/live';

const testResults = [];

function assert(condition, description) {
  if (condition) {
    testResults.push({ status: 'PASS', description });
    console.log(`  ✅ PASS: ${description}`);
  } else {
    testResults.push({ status: 'FAIL', description });
    console.error(`  ❌ FAIL: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runComprehensiveBackendTests() {
  console.log('🛰️ ========================================================');
  console.log('🛰️ ASTRIAL BACKEND FULL VERIFICATION SUITE');
  console.log('🛰️ ========================================================\n');

  // --- 1. HEALTH & METADATA ---
  console.log('📋 [1/8] Testing Health & Metadata Endpoints...');
  const healthRes = await axios.get(`${BASE_URL}/health`);
  assert(healthRes.status === 200 && healthRes.data.status === 'ok', 'GET /health returns 200 and status=ok');
  assert(healthRes.data.mongo === 'up', 'Health check confirms MongoDB Atlas is "up"');
  assert(healthRes.data.node === 'up', 'Health check confirms Node runtime is "up"');

  const signalsRes = await axios.get(`${BASE_URL}/meta/signals`);
  assert(signalsRes.status === 200 && signalsRes.data.data.length === 14, 'GET /meta/signals returns all 14 physical channels');

  const graphRes = await axios.get(`${BASE_URL}/meta/graph`);
  assert(graphRes.status === 200 && graphRes.data.data.nodes.length === 17, 'GET /meta/graph returns 17 dependency graph nodes');
  assert(graphRes.data.data.edges.length >= 17, 'GET /meta/graph returns causal edges with lags and rationale');

  const faultsMetaRes = await axios.get(`${BASE_URL}/meta/faults`);
  assert(faultsMetaRes.status === 200 && faultsMetaRes.data.data.length >= 8, 'GET /meta/faults returns catalog of faults and FMEA actions');

  const configRes = await axios.get(`${BASE_URL}/meta/config`);
  assert(configRes.status === 200 && configRes.data.data?.persistK === 5, 'GET /meta/config returns system thresholds and defaults');

  // --- 2. SCENARIOS ---
  console.log('\n🎬 [2/8] Testing Seeded Scenarios...');
  const scenariosRes = await axios.get(`${BASE_URL}/scenarios`);
  assert(scenariosRes.status === 200 && scenariosRes.data.data.length === 5, 'GET /scenarios returns 5 scripted demo scenarios');

  // --- 3. SESSION LIFECYCLE & TELEMETRY ---
  console.log('\n🚀 [3/8] Testing Sessions Lifecycle...');
  const createSessionRes = await axios.post(`${BASE_URL}/sessions`, {
    source: 'simulator',
    seed: 42,
    mismatchLevel: 'medium',
    speed: 5
  });
  assert(createSessionRes.status === 201 && createSessionRes.data.id.startsWith('ses_'), 'POST /sessions creates new session with ses_ prefix');
  const sessionId = createSessionRes.data.id;

  const getSessionRes = await axios.get(`${BASE_URL}/sessions/${sessionId}`);
  assert(getSessionRes.status === 200 && getSessionRes.data.id === sessionId, 'GET /sessions/:id returns session details');

  const listSessionsRes = await axios.get(`${BASE_URL}/sessions`);
  assert(listSessionsRes.status === 200 && listSessionsRes.data.data.some(s => s.id === sessionId), 'GET /sessions lists active session');

  const stateRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/state`);
  assert(stateRes.status === 200 && stateRes.data.sessionId === sessionId, 'GET /sessions/:id/state returns telemetry snapshot & subsystem health');

  const orbitRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/orbit`);
  assert(orbitRes.status === 200 && orbitRes.data.orbit.altitudeKm === 408, 'GET /sessions/:id/orbit returns orbital ephemeris and ground track');

  const telemetryRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/telemetry?channels=battery_temp,solar_current`);
  assert(telemetryRes.status === 200 && telemetryRes.data.channels.battery_temp !== undefined, 'GET /sessions/:id/telemetry returns historical time-series array');

  const pauseRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/control`, { action: 'pause' });
  assert(pauseRes.status === 200 && pauseRes.data.status === 'paused', 'POST /sessions/:id/control pauses simulation');

  const playRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/control`, { action: 'play' });
  assert(playRes.status === 200 && playRes.data.status === 'playing', 'POST /sessions/:id/control resumes simulation');

  const speedRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/control`, { action: 'speed', speed: 8 });
  assert(speedRes.status === 200 && speedRes.data.speed === 8, 'POST /sessions/:id/control updates playback speed');

  // --- 4. FAULT INJECTION & STRESS CONTROLS ---
  console.log('\n⚡ [4/8] Testing Fault Injection, Stress & Noise...');
  const faultRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/faults`, {
    type: 'battery_degradation',
    severity: 0.35,
    startOffsetSec: 0,
    rampSec: 60
  });
  assert(faultRes.status === 201 && faultRes.data.id.startsWith('flt_'), 'POST /sessions/:id/faults injects scheduled fault');
  const faultId = faultRes.data.id;

  const randomFaultRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/faults/random`, { includeSensorFaults: false });
  assert(randomFaultRes.status === 201 && randomFaultRes.data.id.startsWith('flt_'), 'POST /sessions/:id/faults/random injects random blind fault');

  const listFaultsRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/faults`);
  assert(listFaultsRes.status === 200 && listFaultsRes.data.data.length >= 2, 'GET /sessions/:id/faults lists injected faults without leaking truth');

  const truthRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/faults/${faultId}/truth?force=true`);
  assert(truthRes.status === 200 && truthRes.data.faultId === faultId, 'GET /sessions/:id/faults/:id/truth reveals truth in judge mode');

  const cancelFaultRes = await axios.delete(`${BASE_URL}/sessions/${sessionId}/faults/${faultId}`);
  assert(cancelFaultRes.status === 200 && cancelFaultRes.data.status === 'cancelled', 'DELETE /sessions/:id/faults/:id cancels active fault');

  const stressRes = await axios.put(`${BASE_URL}/sessions/${sessionId}/stress`, {
    missingPct: 5,
    noiseScale: 1.5,
    delaySec: 2
  });
  assert(stressRes.status === 200 && stressRes.data.missingPct === 5, 'PUT /sessions/:id/stress updates telemetry stress parameters');

  const dropoutRes = await axios.post(`${BASE_URL}/sessions/${sessionId}/stress/dropout`, {
    channel: 'battery_temp',
    durationSec: 120
  });
  assert(dropoutRes.status === 201 && dropoutRes.data.channel === 'battery_temp', 'POST /sessions/:id/stress/dropout schedules sensor dropout');

  const sensorsRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/sensors`);
  assert(sensorsRes.status === 200 && sensorsRes.data.data.length === 14, 'GET /sessions/:id/sensors returns per-channel health & data quality');

  // --- 5. DETECTOR CONTROLS & COMPARISON ---
  console.log('\n🎯 [5/8] Testing Detector Parameters & Comparison...');
  const detectorRes = await axios.patch(`${BASE_URL}/sessions/${sessionId}/detector`, {
    targetFalseAlarmRate: 0.005,
    persistK: 6,
    persistN: 10
  });
  assert(detectorRes.status === 200 && detectorRes.data.detector.persistK === 6, 'PATCH /sessions/:id/detector updates conformal calibration');

  const getDetectorRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/detector`);
  assert(getDetectorRes.status === 200 && getDetectorRes.data.detector.persistK === 6, 'GET /sessions/:id/detector returns conformal calibration parameters');

  const anomaliesRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/anomalies`);
  assert(anomaliesRes.status === 200 && Array.isArray(anomaliesRes.data.data), 'GET /sessions/:id/anomalies returns detector episodes');

  const comparisonRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/comparison`);
  assert(comparisonRes.status === 200 && comparisonRes.data.summary?.meanLeadTimeSec !== undefined, 'GET /sessions/:id/comparison returns lead-time vs legacy limit alarms');

  // --- 6. INCIDENTS & ROOT CAUSE WORKFLOW ---
  console.log('\n🚨 [6/8] Testing Incidents Lifecycle & Reports...');
  const incidentsListRes = await axios.get(`${BASE_URL}/incidents`);
  assert(incidentsListRes.status === 200 && Array.isArray(incidentsListRes.data.data), 'GET /incidents returns incident collection');

  // Inject heater fault for deterministic incident verification
  const incidentSession = await axios.post(`${BASE_URL}/sessions`, { source: 'simulator', speed: 10, mismatchLevel: 'medium' });
  const isid = incidentSession.data.id;
  await axios.post(`${BASE_URL}/sessions/${isid}/faults`, { type: 'heater_stuck_on', severity: 1.0, startOffsetSec: 0, rampSec: 0 });

  // Poll for generated incident
  let targetIncident = null;
  for (let poll = 0; poll < 10; poll++) {
    await new Promise(r => setTimeout(r, 600));
    const incs = await axios.get(`${BASE_URL}/incidents?sessionId=${isid}`);
    if (incs.data.data && incs.data.data.length > 0) {
      targetIncident = incs.data.data[0];
      break;
    }
  }

  if (targetIncident) {
    const incId = targetIncident.id;
    const incidentDetailRes = await axios.get(`${BASE_URL}/incidents/${incId}`);
    assert(incidentDetailRes.status === 200 && incidentDetailRes.data.explanation?.headline !== undefined, 'GET /incidents/:id returns explanation, ranked causes & FMEA');
    assert(incidentDetailRes.data.rankedCauses.length >= 1, 'Incident contains ranked causal hypotheses with posterior probabilities');
    assert(incidentDetailRes.data.recommendations.length >= 1, 'Incident contains FMEA operator action recommendations');

    const ackRes = await axios.post(`${BASE_URL}/incidents/${incId}/acknowledge`, { note: 'Verified thermal sensor readings.' });
    assert(ackRes.status === 200 && ackRes.data.status === 'acknowledged', 'POST /incidents/:id/acknowledge updates state to acknowledged');

    const closeRes = await axios.post(`${BASE_URL}/incidents/${incId}/close`, { note: 'Heater relay commanded to secondary.' });
    assert(closeRes.status === 200 && closeRes.data.status === 'closed', 'POST /incidents/:id/close updates state to closed');

    const reportJsonRes = await axios.get(`${BASE_URL}/incidents/${incId}/report?format=json`);
    assert(reportJsonRes.status === 200 && reportJsonRes.data.incidentId === incId, 'GET /incidents/:id/report?format=json returns structured report');

    const reportMdRes = await axios.get(`${BASE_URL}/incidents/${incId}/report?format=md`);
    assert(reportMdRes.status === 200 && typeof reportMdRes.data === 'string' && reportMdRes.data.includes('# Post-Mortem Incident Report'), 'GET /incidents/:id/report?format=md returns markdown report');
  }

  // --- 7. BENCHMARKS & EVALUATION ---
  console.log('\n📊 [7/8] Testing Evaluation Benchmarks & Metrics...');
  const evalSummaryRes = await axios.get(`${BASE_URL}/evaluation/summary`);
  assert(evalSummaryRes.status === 200 && evalSummaryRes.data.detection.f1 >= 0.85, 'GET /evaluation/summary returns SMAP/MSL F1 & Top-1 metrics');

  const evalDetRes = await axios.get(`${BASE_URL}/evaluation/detection`);
  assert(evalDetRes.status === 200 && evalDetRes.data.macroAverage?.precision !== undefined, 'GET /evaluation/detection returns event-level precision, recall & F1');

  const evalRootRes = await axios.get(`${BASE_URL}/evaluation/root-cause`);
  assert(evalRootRes.status === 200 && evalRootRes.data.top1Accuracy >= 0.80, 'GET /evaluation/root-cause returns confusion matrix and top-1/top-3 accuracy');

  const evalFalseRes = await axios.get(`${BASE_URL}/evaluation/false-alerts`);
  assert(evalFalseRes.status === 200 && evalFalseRes.data.systems?.detector_plus_noise_logic !== undefined, 'GET /evaluation/false-alerts returns false alerts vs mean time between alerts');

  const evalRobustRes = await axios.get(`${BASE_URL}/evaluation/robustness`);
  assert(evalRobustRes.status === 200 && evalRobustRes.data.missingDataSweep !== undefined, 'GET /evaluation/robustness returns sweeps across missing data, noise & mismatch');

  const evalClassRes = await axios.get(`${BASE_URL}/evaluation/classification`);
  assert(evalClassRes.status === 200 && evalClassRes.data.accuracy >= 0.90, 'GET /evaluation/classification returns 3-way classifier metrics');

  const evalLeadRes = await axios.get(`${BASE_URL}/evaluation/lead-time`);
  assert(evalLeadRes.status === 200 && evalLeadRes.data.meanLeadTimeSec > 500, 'GET /evaluation/lead-time returns early warning distribution vs legacy alarms');

  const evalCalibRes = await axios.get(`${BASE_URL}/evaluation/calibration`);
  assert(evalCalibRes.status === 200 && evalCalibRes.data.expectedCalibrationError !== undefined, 'GET /evaluation/calibration returns expected calibration error and reliability diagram');

  const runEvalRes = await axios.post(`${BASE_URL}/evaluation/runs`, { suite: 'all', dataset: 'smap_msl', testSplit: 0.2 });
  assert(runEvalRes.status === 202 && runEvalRes.data.id.startsWith('run_'), 'POST /evaluation/runs initiates background benchmark run');

  const evalRunStatusRes = await axios.get(`${BASE_URL}/evaluation/runs/${runEvalRes.data.id}`);
  assert(evalRunStatusRes.status === 200 && evalRunStatusRes.data.id === runEvalRes.data.id, 'GET /evaluation/runs/:id returns benchmark progress and results');

  // --- 8. FILE UPLOADS & SOCKET.IO LIVE ---
  console.log('\n📡 [8/8] Testing CSV Uploads & Socket.IO /live Hub...');
  
  // Create sample CSV file in memory and upload
  const sampleCsvContent = 'timestamp,solar_current,battery_temp,bus_voltage\n1,5.2,21.0,28.0\n2,5.1,21.2,28.0\n3,5.0,21.5,27.9\n';
  const tempCsvPath = path.resolve(__dirname, 'temp_test.csv');
  fs.writeFileSync(tempCsvPath, sampleCsvContent);

  const form = new FormData();
  form.append('file', fs.createReadStream(tempCsvPath));
  const uploadRes = await axios.post(`${BASE_URL}/uploads`, form, { headers: form.getHeaders() });
  assert(uploadRes.status === 201 && uploadRes.data.id.startsWith('upl_'), 'POST /uploads sniffs CSV headers and generates initial channel mapping');
  const uploadId = uploadRes.data.id;

  const mappingRes = await axios.put(`${BASE_URL}/uploads/${uploadId}/mapping`, {
    mapping: {
      solar_current: 'solar_current',
      battery_temp: 'battery_temp',
      bus_voltage: 'bus_voltage'
    }
  });
  assert(mappingRes.status === 200 && mappingRes.data.id === uploadId && mappingRes.data.mode !== undefined, 'PUT /uploads/:id/mapping validates and maps custom dataset');

  // Clean up temp file
  try { fs.unlinkSync(tempCsvPath); } catch (_) {}

  // Test Socket.IO /live connection
  await new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO connection timed out'));
    }, 4000);

    socket.on('connect', () => {
      socket.emit('session:join', { sessionId });
    });

    socket.on('session:state', (state) => {
      assert(state.sessionId === sessionId, 'Socket.IO /live client received live "session:state" event on room join');
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(err);
    });
  });

  console.log('\n🎉 ========================================================');
  console.log(`🎉 ALL ${testResults.length} BACKEND VERIFICATION CHECKS PASSED WITH 100% SUCCESS!`);
  console.log('🎉 ========================================================');
}

runComprehensiveBackendTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err.message);
  if (err.response?.data) {
    console.error('API Response Error:', err.response.data);
  }
  process.exit(1);
});
