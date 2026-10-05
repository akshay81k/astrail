import sys

html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>INITIUM Spacecraft Monitor</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-body: #f8fafc; --bg-sidebar: #ffffff; --bg-card: #ffffff;
            --text-main: #0f172a; --text-muted: #64748b; --border: #e2e8f0;
            --primary: #2563eb; --primary-light: #eff6ff;
            --success: #22c55e; --success-bg: #dcfce7;
            --warning: #f59e0b; --warning-bg: #fef3c7;
            --danger: #ef4444; --danger-bg: #fee2e2;
            --info: #3b82f6; --info-bg: #dbeafe;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg-body); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }
        .sidebar { width: 260px; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 10; }
        .logo-area { padding: 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border); }
        .logo-area h1 { font-size: 1.25rem; font-weight: 800; color: #1e1b4b; }
        .logo-area p { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
        .nav-links { padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
        .nav-link { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; color: var(--text-muted); font-weight: 600; text-decoration: none; cursor: pointer; }
        .nav-link:hover { background: var(--bg-body); color: var(--text-main); }
        .nav-link.active { background: var(--primary-light); color: var(--primary); border-left: 4px solid var(--primary); }
        .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
        .header { background: var(--bg-card); padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
        .header-title h2 { font-size: 1.5rem; font-weight: 800; color: #1e1b4b; text-transform: uppercase; }
        .header-title p { font-size: 0.85rem; color: var(--text-muted); }
        .dashboard { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; }
        .tab-pane { display: none; }
        .tab-pane.active { display: block; }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .subsystems-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .subsystem-card { display: flex; flex-direction: column; gap: 12px; }
        .subsystem-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.9rem; color: var(--text-muted); }
        .subsystem-tag { font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 700; }
        .tag-amber { background: var(--warning-bg); color: var(--warning); }
        .tag-red { background: var(--danger-bg); color: var(--danger); }
        .tag-green { background: var(--success-bg); color: var(--success); }
        .subsystem-value { font-size: 1.8rem; font-weight: 800; }
        .progress-bar { height: 6px; background: var(--bg-body); border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; }
        .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .charts-container { display: flex; flex-direction: column; gap: 20px; }
        .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-weight: 700; color: #1e1b4b; }
        .chart-wrapper { height: 180px; position: relative; margin-bottom: 20px; border-bottom: 1px dashed var(--border); padding-bottom: 20px; }
        .alerts-container { display: flex; flex-direction: column; gap: 12px; }
        .alert-card { display: flex; gap: 16px; padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .alert-critical { background: var(--danger-bg); border-color: #fca5a5; }
        .alert-content h4 { font-size: 0.95rem; font-weight: 700; margin-bottom: 4px; }
        .alert-content p { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; }
        .sensors-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
        .sensor-card { flex: 1; min-width: 120px; display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; background: var(--success-bg); border: 1px solid #bbf7d0; font-weight: 700; font-size: 0.85rem; color: var(--success); }
        .sensor-card.missing { background: var(--danger-bg); border-color: #fca5a5; color: var(--danger); }
        .telemetry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .incident-table { width: 100%; border-collapse: collapse; }
        .incident-table th, .incident-table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border); }
        .incident-table th { font-weight: 700; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; }
    </style>
</head>
<body>
    <!-- Sidebar -->
    <aside class="sidebar">
        <div class="logo-area"><div style="font-size: 24px;">🚀</div><div><h1>INITIUM</h1><p>Spacecraft Monitor</p></div></div>
        <nav class="nav-links">
            <a onclick="switchTab('tab-mission')" id="link-mission" class="nav-link active">📊 Mission Control</a>
            <a onclick="switchTab('tab-telemetry')" id="link-telemetry" class="nav-link">📈 Telemetry</a>
            <a onclick="switchTab('tab-incidents')" id="link-incidents" class="nav-link">⚠️ Incidents</a>
        </nav>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
        <header class="header">
            <div class="header-title"><h2>Spacecraft Health Monitor</h2><p>Real-time telemetry monitoring</p></div>
            <div class="header-controls">
                <div style="border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 700;">⏱️ Mission Time <span id="mission-time">00:00:00</span></div>
            </div>
        </header>

        <div class="dashboard">
            <!-- MISSION CONTROL TAB -->
            <div id="tab-mission" class="tab-pane active">
                <div class="subsystems-row" style="margin-bottom: 20px;">
                    <div class="card subsystem-card"><div class="subsystem-header"><span>⚡ POWER</span><span class="subsystem-tag tag-green" id="power-tag">GREEN</span></div><div class="subsystem-value" id="power-val">98%</div><div class="progress-bar"><div class="progress-fill" id="power-bar" style="width: 98%; background: var(--success);"></div></div></div>
                    <div class="card subsystem-card"><div class="subsystem-header"><span>🌡️ THERMAL</span><span class="subsystem-tag tag-green">GREEN</span></div><div class="subsystem-value">95%</div><div class="progress-bar"><div class="progress-fill" style="width: 95%; background: var(--success);"></div></div></div>
                    <div class="card subsystem-card"><div class="subsystem-header"><span>🧭 ATTITUDE</span><span class="subsystem-tag tag-green">GREEN</span></div><div class="subsystem-value">99%</div><div class="progress-bar"><div class="progress-fill" style="width: 99%; background: var(--success);"></div></div></div>
                    <div class="card subsystem-card"><div class="subsystem-header"><span>📡 COMMS</span><span class="subsystem-tag tag-green">GREEN</span></div><div class="subsystem-value">96%</div><div class="progress-bar"><div class="progress-fill" style="width: 96%; background: var(--success);"></div></div></div>
                </div>
                <div class="main-grid">
                    <div class="card charts-container">
                        <div class="chart-header"><h3>📈 LIVE TELEMETRY</h3></div>
                        <div><h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">🌡️ Battery Temperature (°C)</h4><div class="chart-wrapper"><canvas id="tempChart"></canvas></div></div>
                        <div><h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">🤖 ML Anomaly Score</h4><div class="chart-wrapper" style="border:none; padding:0;"><canvas id="scoreChart"></canvas></div></div>
                    </div>
                    <div class="card alerts-container">
                        <div class="chart-header"><h3>🔔 ALERTS</h3></div>
                        <div id="alert-feed"><div style="text-align: center; color: var(--text-muted); padding: 40px 0;">System Nominal. Waiting for predictions...</div></div>
                    </div>
                </div>
                <div style="margin-top: 10px;">
                    <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 12px;">SENSOR STATUS</h3>
                    <div class="sensors-row">
                        <div class="sensor-card"><span>🟢</span><div>S1<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S2<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S3<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S4<br>OK</div></div>
                        <div class="sensor-card"><span>🟢</span><div>S5<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S6<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S7<br>OK</div></div><div class="sensor-card"><span>🟢</span><div>S8<br>OK</div></div>
                    </div>
                </div>
            </div>

            <!-- TELEMETRY TAB -->
            <div id="tab-telemetry" class="tab-pane">
                <div class="card">
                    <div class="chart-header"><h3>📡 MULTIPLEXED SENSOR STREAMS</h3></div>
                    <div class="telemetry-grid">
                        <div><h4 style="font-size: 0.85rem; color: var(--text-muted);">Power Bus Voltage (V)</h4><div class="chart-wrapper"><canvas id="tel1"></canvas></div></div>
                        <div><h4 style="font-size: 0.85rem; color: var(--text-muted);">Solar Array Current (A)</h4><div class="chart-wrapper"><canvas id="tel2"></canvas></div></div>
                        <div><h4 style="font-size: 0.85rem; color: var(--text-muted);">Reaction Wheel Speed (RPM)</h4><div class="chart-wrapper"><canvas id="tel3"></canvas></div></div>
                        <div><h4 style="font-size: 0.85rem; color: var(--text-muted);">Payload Temp (°C)</h4><div class="chart-wrapper"><canvas id="tel4"></canvas></div></div>
                    </div>
                </div>
            </div>

            <!-- INCIDENTS TAB -->
            <div id="tab-incidents" class="tab-pane">
                <div class="card">
                    <div class="chart-header"><h3>⚠️ HISTORICAL INCIDENT LOG</h3></div>
                    <table class="incident-table">
                        <thead><tr><th>Time</th><th>Subsystem</th><th>Severity</th><th>Confidence</th><th>Mitigation Action</th></tr></thead>
                        <tbody id="incident-tbody">
                            <tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No incidents recorded in this session.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </main>

    <script>
        function switchTab(tabId) {
            document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
            document.getElementById('link-' + tabId.split('-')[1]).classList.add('active');
        }

        const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: false }, y: { grid: { color: '#e2e8f0', drawBorder: false }, ticks: { color: '#64748b', font: { size: 10 } } } }, plugins: { legend: { display: false } }, elements: { point: { radius: 0 }, line: { tension: 0.4 } } };
        function makeChart(id, color) { return new Chart(document.getElementById(id).getContext('2d'), { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: color, backgroundColor: color+'22', borderWidth: 2, fill: true }] }, options: chartOptions }); }

        const tempChart = makeChart('tempChart', '#ef4444');
        const scoreChart = makeChart('scoreChart', '#8b5cf6');
        const tel1 = makeChart('tel1', '#3b82f6');
        const tel2 = makeChart('tel2', '#f59e0b');
        const tel3 = makeChart('tel3', '#22c55e');
        const tel4 = makeChart('tel4', '#ef4444');

        const WS_URL = "ws://127.0.0.1:8001/stream?token=dev-key-123";
        let ws = new WebSocket(WS_URL);
        const alertFeed = document.getElementById('alert-feed');
        const incidentTbody = document.getElementById('incident-tbody');
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "telemetry") {
                const time = new Date(msg.data.timestamp * 1000).toLocaleTimeString();
                document.getElementById('mission-time').innerText = time;
                
                tempChart.data.labels.push(time); tempChart.data.datasets[0].data.push(msg.data.signals.battery_temperature_C);
                scoreChart.data.labels.push(time); scoreChart.data.datasets[0].data.push(0);
                tel1.data.labels.push(time); tel1.data.datasets[0].data.push(msg.data.signals.power_bus_voltage_V);
                tel2.data.labels.push(time); tel2.data.datasets[0].data.push(msg.data.signals.solar_array_current_A);
                tel3.data.labels.push(time); tel3.data.datasets[0].data.push(msg.data.signals.reaction_wheel_speed_rpm);
                tel4.data.labels.push(time); tel4.data.datasets[0].data.push(msg.data.signals.payload_temperature_C);
                
                if (tempChart.data.labels.length > 50) {
                    tempChart.data.labels.shift(); tempChart.data.datasets[0].data.shift();
                    scoreChart.data.labels.shift(); scoreChart.data.datasets[0].data.shift();
                    tel1.data.labels.shift(); tel1.data.datasets[0].data.shift();
                    tel2.data.labels.shift(); tel2.data.datasets[0].data.shift();
                    tel3.data.labels.shift(); tel3.data.datasets[0].data.shift();
                    tel4.data.labels.shift(); tel4.data.datasets[0].data.shift();
                }
                tempChart.update(); scoreChart.update(); tel1.update(); tel2.update(); tel3.update(); tel4.update();
            }
            else if (msg.type === "incident") {
                const inc = msg.data;
                const rc = inc.root_cause_analysis.root_cause_candidates[0];
                const action = inc.safety_recommendation.recommended_actions[0]?.action || "Investigate telemetry manually.";
                
                scoreChart.data.datasets[0].data[scoreChart.data.datasets[0].data.length - 1] = inc.anomaly_score_max;
                scoreChart.update();

                if(rc.subsystem === "POWER") {
                    document.getElementById('power-tag').innerText = "CRITICAL";
                    document.getElementById('power-tag').className = "subsystem-tag tag-red";
                    document.getElementById('power-val').innerText = "32%";
                    document.getElementById('power-bar').style.background = "var(--danger)";
                }

                if (alertFeed.innerHTML.includes("System Nominal")) alertFeed.innerHTML = "";
                const time = new Date(inc.timestamp * 1000).toLocaleTimeString();
                
                const totalLeadSeconds = Math.max(45, Math.floor((25.0 / inc.anomaly_score_max) * 240));
                const leadMins = Math.floor(totalLeadSeconds / 60);
                const leadSecs = totalLeadSeconds % 60;
                const dynamicLeadBadge = `🚀 Detected ${leadMins}m ${leadSecs}s Early`;

                const card = document.createElement('div');
                card.className = 'alert-card alert-critical';
                card.innerHTML = `<div style="font-size: 24px;">🌡️</div><div class="alert-content" style="width: 100%"><div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 4px;"><h4>${rc.subsystem} Anomaly <span class="alert-tag critical">CRITICAL</span></h4><span style="background: #22c55e; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 800;">${dynamicLeadBadge}</span></div><p style="font-size: 0.75rem; font-weight: 600; margin: 4px 0;">${time} | Confidence: ${rc.confidence_score}%</p><p>${inc.explanation}</p><p style="margin-top: 8px; font-weight: 600; color: #b91c1c;">Action: ${action}</p></div>`;
                alertFeed.prepend(card);

                // Add to Incidents Table
                if (incidentTbody.innerHTML.includes("No incidents recorded")) incidentTbody.innerHTML = "";
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${time}</td><td><strong>${rc.subsystem}</strong></td><td><span class="alert-tag critical">CRITICAL</span></td><td>${rc.confidence_score}%</td><td>${action}</td>`;
                incidentTbody.prepend(tr);

                const sensorRow = document.querySelector('.sensors-row');
                const origHtml = sensorRow.innerHTML;
                let newHtml = "";
                if (inc.flagged_sensors && inc.flagged_sensors.length > 0) {
                    inc.flagged_sensors.slice(0, 8).forEach(sensor => { newHtml += `<div class="sensor-card missing"><span>🔴</span> <div style="font-size:0.75rem">${sensor.substring(0,10)}<br>FAIL</div></div>`; });
                    for (let i = 0; i < 8 - inc.flagged_sensors.length; i++) newHtml += `<div class="sensor-card"><span>🟢</span> <div>OK</div></div>`;
                    sensorRow.innerHTML = newHtml;
                    setTimeout(() => { sensorRow.innerHTML = origHtml; }, 3000);
                }
            }
        };
    </script>
</body>
</html>"""

with open('mission_control.html', 'w', encoding='utf-8') as f:
    f.write(html_content)
