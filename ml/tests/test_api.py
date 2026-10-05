import os

import pytest
from fastapi.testclient import TestClient

from spacecraft_rca.api.main import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_env():
    os.environ["RCA_API_KEY"] = "test_secure_key_123"
    yield
    del os.environ["RCA_API_KEY"]

def test_ingest_missing_auth():
    response = client.post("/ingest", json={"batch_id": "1", "data": []})
    assert response.status_code == 403

def test_ingest_valid():
    payload = {
        "batch_id": "batch_001",
        "data": [
            {
                "timestamp": 123456789.0,
                "mode": "NOMINAL",
                "signals": {"power_bus_voltage_V": 28.1}
            }
        ]
    }
    response = client.post("/ingest", json=payload, headers={"X-API-Key": "test_secure_key_123"})
    assert response.status_code == 200
    assert response.json()["status"] == "accepted"

def test_ingest_nan_inf():
    payload = {
        "batch_id": "batch_nan",
        "data": [
            {
                "timestamp": 123456789.0,
                "mode": "NOMINAL",
                "signals": {"power_bus_voltage_V": "invalid_float"}
            }
        ]
    }
    response = client.post("/ingest", json=payload, headers={"X-API-Key": "test_secure_key_123"})
    assert response.status_code == 422 # Pydantic validation error

def test_ingest_oversized_batch():
    # Max rows is 500
    data = [
        {
            "timestamp": float(i),
            "mode": "NOMINAL",
            "signals": {"sensor": 1.0}
        } for i in range(505)
    ]
    payload = {"batch_id": "huge", "data": data}
    response = client.post("/ingest", json=payload, headers={"X-API-Key": "test_secure_key_123"})
    assert response.status_code == 422
    assert "List should have at most 500 items" in response.text

def test_missing_key():
    payload = {
        "batch_id": "missing_keys",
        "data": [
            {
                "mode": "NOMINAL",
                "signals": {"sensor": 1.0}
                # Missing timestamp
            }
        ]
    }
    response = client.post("/ingest", json=payload, headers={"X-API-Key": "test_secure_key_123"})
    assert response.status_code == 422

def test_ws_auth_failure():
    # Fastapi TestClient supports websocket testing
    with pytest.raises(Exception): # The client throws exception on 403 closure
        with client.websocket_connect("/stream?token=wrong_key"):
            pass

def test_tampered_artifact(monkeypatch):
    """
    Simulates loading a tampered artifact where SHA256 doesn't match manifest.
    """
    
    # We patch load_artifact to throw the exact error utils.py would throw on tampering
    def mock_load(filename, artifact_type):
        raise ValueError("SHA256 hash mismatch for gru_state_dict.safetensors. Tampering detected!")
        
    monkeypatch.setattr("spacecraft_rca.api.main.load_artifact", mock_load)
    
    # We explicitly trigger the startup event handler
    import asyncio
    
    try:
        from spacecraft_rca.api.main import load_models
        # It logs the error and catches it, no crash for the server process, but models dict remains empty
        asyncio.run(load_models())
    except Exception as e:
        pytest.fail(f"load_models failed to handle tampered exception: {e}")
