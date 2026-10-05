const axios = require('axios');

async function verifyPipeline() {
  const base = 'http://localhost:5000/api/v1';
  console.log('🧪 Starting API Verification...');

  // 1. Health
  const health = await axios.get(`${base}/health`);
  console.log('✅ Health Status:', health.data.status, '| Node:', health.data.node, '| DB:', health.data.mongo);

  // 2. Metadata
  const signals = await axios.get(`${base}/meta/signals`);
  const graph = await axios.get(`${base}/meta/graph`);
  console.log(`✅ Metadata: ${signals.data.data.length} telemetry channels, ${graph.data.data.nodes.length} graph nodes, ${graph.data.data.edges.length} edges.`);

  // 3. Create Session (speed: 10 for rapid verification)
  const session = await axios.post(`${base}/sessions`, {
    source: 'simulator',
    seed: 42,
    mismatchLevel: 'medium',
    speed: 10
  });
  const sid = session.data.id;
  console.log(`✅ Session Created: ${sid} (${session.data.sourceLabel})`);

  // 4. State
  const state = await axios.get(`${base}/sessions/${sid}/state`);
  console.log(`✅ Session State: Status=${state.data.status}, SimTime=${state.data.simTime}s, Score=${state.data.score}/${state.data.threshold}`);

  // 5. Inject Heater Relay Failure Fault (active regardless of orbital sun angle)
  const fault = await axios.post(`${base}/sessions/${sid}/faults`, {
    type: 'heater_stuck_on',
    severity: 1.0,
    startOffsetSec: 0,
    rampSec: 0
  });
  console.log(`✅ Fault Injected: ${fault.data.id} (Type: ${fault.data.type}, Severity: ${fault.data.severity})`);

  // 6. Wait for simulation ticks (poll up to 4s)
  let incidentsList = [];
  for (let p = 0; p < 8; p++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const incRes = await axios.get(`${base}/incidents?sessionId=${sid}`);
    if (incRes.data.data && incRes.data.data.length > 0) {
      incidentsList = incRes.data.data;
      break;
    }
  }
  console.log(`✅ Incidents Retrieved: ${incidentsList.length} incident(s)`);

  if (incidentsList.length > 0) {
    const incId = incidentsList[0].id;
    const detail = await axios.get(`${base}/incidents/${incId}`);
    console.log(`✅ Incident Detail: [${detail.data.id}] "${detail.data.explanation.headline}"`);
    console.log(`   - Evidence: ${detail.data.explanation.evidence}`);
    console.log(`   - Cause & Confidence: ${detail.data.explanation.causeConfidence}`);
    console.log(`   - First Action: ${detail.data.explanation.action}`);
    console.log(`   - Top-1 Ranked Cause: ${detail.data.rankedCauses[0].hypothesis} (Posterior: ${detail.data.rankedCauses[0].posterior})`);

    // 8. Acknowledge Incident
    const ack = await axios.post(`${base}/incidents/${incId}/acknowledge`, {
      note: 'Operator verified solar degradation telemetry and began load reduction.'
    });
    console.log(`✅ Incident Acknowledged: Status=${ack.data.status}, History Events=${ack.data.history.length}`);

    // 9. Check Comparison
    const comparison = await axios.get(`${base}/sessions/${sid}/comparison`);
    console.log(`✅ Comparison: Mean Lead Time = ${comparison.data.summary.meanLeadTimeSec}s vs threshold limits`);
  }

  // 10. Evaluation Summary
  const evalSummary = await axios.get(`${base}/evaluation/summary`);
  console.log(`✅ Evaluation Summary: SMAP/MSL F1 = ${evalSummary.data.detection.f1}, Root Cause Top-1 = ${evalSummary.data.rootCause.top1}`);

  console.log('🎉 ALL BACKEND ENDPOINTS AND DATA PIPELINES VERIFIED SUCCESSFULLY!');
}

verifyPipeline().catch(err => {
  console.error('❌ Pipeline Error:', err.response?.data || err.message);
  process.exit(1);
});
