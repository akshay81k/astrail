import json

with open('nominal_payload.json') as f: 
    data = f.read()

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Spacecraft RCA - API Tester</title>
    <style>
        body {{ font-family: sans-serif; background-color: #121212; color: #e0e0e0; margin: 20px; }}
        .container {{ max-width: 800px; margin: 0 auto; background: #1e1e1e; padding: 20px; border-radius: 8px; }}
        h1 {{ color: #64b5f6; border-bottom: 1px solid #333; padding-bottom: 10px; }}
        button {{ background-color: #1976d2; color: white; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold; margin-right: 10px; }}
        .danger {{ background-color: #d32f2f; }}
        pre {{ background: #000; padding: 15px; overflow-x: auto; color: #a5d6a7; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Spacecraft RCA ML Tester</h1>
        <button onclick="sendTelemetry('nominal')">Send 32 Real Nominal Rows</button>
        <button onclick="sendTelemetry('anomaly')" class="danger">Inject POWER Surge</button>
        <div id="status" style="margin-top:10px;">Ready.</div>
        <pre id="output">{{ waiting for request... }}</pre>
    </div>

    <script>
        const API_URL = "http://127.0.0.1:8001/ingest";
        const API_KEY = "dev-key-123";
        
        const real_nominal = {data};

        async function sendTelemetry(type) {{
            const out = document.getElementById("output");
            const stat = document.getElementById("status");
            stat.innerText = "Sending request...";
            
            let data = [];
            if (type === 'nominal') {{
                data = real_nominal;
            }} else {{
                data = [JSON.parse(JSON.stringify(real_nominal[31]))];
                data[0].signals['power_bus_voltage_V'] += 15.0; // Huge surge
                data[0].timestamp += 60;
            }}

            const payload = {{
                "batch_id": "test_html_" + Math.floor(Math.random()*10000),
                "data": data
            }};

            try {{
                const response = await fetch(API_URL, {{
                    method: "POST",
                    headers: {{ "Content-Type": "application/json", "X-API-Key": API_KEY }},
                    body: JSON.stringify(payload)
                }});
                const json = await response.json();
                out.innerText = JSON.stringify(json, null, 2);
                stat.innerText = "Success (" + response.status + ")";
            }} catch (err) {{
                out.innerText = "Error: " + err.message;
                stat.innerText = "Failed!";
            }}
        }}
    </script>
</body>
</html>'''

with open('test_api.html', 'w', encoding='utf-8') as f:
    f.write(html)
