import requests
import os
import json

def run_smoke():
    url = "http://localhost:8001/ingest"
    api_key = os.getenv("RCA_API_KEY", "smoke-test-key-123")
    
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }
    
    payload = {
        "batch_id": "smoke-test-001",
        "data": [
            {
                "timestamp": 123456789.0,
                "mode": "NOMINAL",
                "signals": {
                    "power_bus_voltage_V": 28.1,
                    "battery_temperature_C": 5.2
                }
            }
        ]
    }
    
    print(f"Sending POST to {url}")
    print(f"Headers: {headers}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    run_smoke()
