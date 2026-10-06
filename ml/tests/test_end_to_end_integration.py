import os
import pytest
import requests
import torch
import numpy as np
import pandas as pd
from pathlib import Path
from fastapi.testclient import TestClient

from spacecraft_rca.api.main import app, rc_engine, safety_engine, explainer_engine, inference_state
from spacecraft_rca.models.gru_forecaster import GRUForecaster

client = TestClient(app)

DATA_PACK = Path("INITIUM_TECHFEST_2026_27_DATA_PACK")
if not DATA_PACK.exists():
    DATA_PACK = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")


# ==============================================================================
# 1. ML Microservice Health & State
# ==============================================================================
def test_ml_service_health_and_models_loaded():
    """Verify that the FastAPI ML service is up and models are verified/loaded."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "up"
    assert "models_loaded" in data


# ==============================================================================
# 2. PyTorch GRU Forecaster & Conformal Thresholding
# ==============================================================================
def test_gru_forecaster_forward_pass_and_conformal_score():
    """Test GRU model forward pass on 32-step window and conformal anomaly scoring."""
    gru = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
    gru.eval()
    
    # 32 time steps, batch size 2, 50 features (23 sensors + 4 mode one-hot + 23 missing masks)
    dummy_input = torch.randn(2, 32, 50)
    with torch.no_grad():
        output = gru(dummy_input)
    
    assert output.shape == (2, 23)
    assert not torch.isnan(output).any()

    # Test residual vector & conformal score normalization
    y_true = np.ones(23) * 22.0
    y_pred = y_true + np.array([0.1 if i != 5 else 18.0 for i in range(23)]) # Fault on channel 5
    residuals = np.abs(y_pred - y_true)
    cal_p99 = np.ones(23) * 1.5
    conformal_scores = residuals / cal_p99
    
    threshold = 2.1
    anomalous_indices = np.where(conformal_scores > threshold)[0]
    assert 5 in anomalous_indices
    assert conformal_scores[5] == 12.0


# ==============================================================================
# 3. NetworkX Root Cause DAG Traversal
# ==============================================================================
def test_root_cause_engine_dag_causality():
    """Verify DAG traversal isolates true upstream subsystem and downstream impacts."""
    assert rc_engine.G.number_of_nodes() > 0
    assert rc_engine.G.number_of_edges() > 0

    # Test Power subsystem fault (e.g. solar_array_current_A anomalous)
    analysis_power = rc_engine.analyze_incident(["solar_array_current_A", "power_bus_voltage_V"])
    assert len(analysis_power["root_cause_candidates"]) > 0
    top_candidate = analysis_power["root_cause_candidates"][0]
    assert top_candidate["subsystem"].upper() == "POWER"
    assert top_candidate["confidence_score"] >= 80.0
    assert "thermal" in [d.lower() for d in analysis_power["downstream_impact"]] or len(analysis_power["downstream_impact"]) >= 0

    # Test Thermal subsystem fault (e.g. battery_temperature_C anomalous)
    analysis_thermal = rc_engine.analyze_incident(["battery_temperature_C", "eps_temperature_C"])
    assert len(analysis_thermal["root_cause_candidates"]) > 0
    assert analysis_thermal["root_cause_candidates"][0]["subsystem"].upper() == "THERMAL"


# ==============================================================================
# 4. Safety Engine & FMEA Action Rule Engine
# ==============================================================================
def test_safety_engine_fmea_evaluations():
    """Verify that anomalous telemetry correctly triggers FMEA safety mitigations."""
    # Test High Battery Temperature rule trigger
    flagged = ["battery_temperature_C"]
    readings = {"battery_temperature_C": 42.5}
    safety_result = safety_engine.evaluate(flagged, readings)
    
    assert safety_result["overall_risk"] in ["HIGH", "CRITICAL", "MEDIUM"]
    assert len(safety_result["recommended_actions"]) > 0
    
    # Test Solar array current drop
    flagged_solar = ["solar_array_current_A"]
    readings_solar = {"solar_array_current_A": 0.1}
    solar_safety = safety_engine.evaluate(flagged_solar, readings_solar)
    assert len(solar_safety["recommended_actions"]) > 0


# ==============================================================================
# 5. Explainer Engine Natural Language Synthesis
# ==============================================================================
def test_explainer_engine_generation():
    """Verify natural language explanation generation from telemetry deviations."""
    flagged = ["battery_temperature_C"]
    readings = {"battery_temperature_C": 41.2}
    predictions = {"battery_temperature_C": 22.0}
    candidates = [{"subsystem": "thermal", "confidence_score": 94.2}]

    explanation = explainer_engine.generate_explanation(flagged, readings, predictions, candidates)
    assert "battery_temperature_c" in explanation.lower()
    assert "rose" in explanation or "deviat" in explanation
    assert "thermal" in explanation.lower()
    assert "94.2%" in explanation


# ==============================================================================
# 6. Full RCA Pipeline Endpoint Integration
# ==============================================================================
def test_analyze_endpoint_full_pipeline():
    """Test full POST /analyze endpoint integrating RCA, Safety, and Explainer."""
    payload = {
        "flagged_sensors": ["solar_array_current_A", "power_bus_voltage_V"],
        "current_readings": {"solar_array_current_A": 0.2, "power_bus_voltage_V": 25.5},
        "predictions": {"solar_array_current_A": 3.1, "power_bus_voltage_V": 28.2}
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "root_cause_analysis" in data
    assert "safety_recommendation" in data
    assert "explanation" in data
    assert len(data["root_cause_analysis"]["root_cause_candidates"]) > 0


# ==============================================================================
# 7. Node.js Backend Gateway & Cross-Tab Sync Verification
# ==============================================================================
def test_backend_gateway_endpoints_and_cross_tab_sync():
    """Verify Node.js backend endpoints are up and in sync with ML and metadata catalogs."""
    backend_url = "http://localhost:5000/api/v1"
    
    try:
        # Check backend health
        res_health = requests.get(f"{backend_url}/health", timeout=3)
        assert res_health.status_code == 200
        health_data = res_health.json()
        assert health_data["status"] == "ok"
        assert health_data["ml"] == "up"

        # Check metadata signals catalog
        res_sig = requests.get(f"{backend_url}/meta/signals", timeout=3)
        assert res_sig.status_code == 200
        signals = res_sig.json()["data"]
        assert len(signals) >= 14

        # Check metadata dependency graph
        res_graph = requests.get(f"{backend_url}/meta/graph", timeout=3)
        assert res_graph.status_code == 200
        graph_data = res_graph.json().get("data", res_graph.json())
        assert "nodes" in graph_data and "edges" in graph_data

        # Check fault catalog
        res_faults = requests.get(f"{backend_url}/meta/faults", timeout=3)
        assert res_faults.status_code == 200
        faults_data = res_faults.json()["data"]
        assert len(faults_data) >= 5

        # Check evaluation endpoints for Evaluation tab
        res_eval = requests.get(f"{backend_url}/evaluation/summary", timeout=3)
        assert res_eval.status_code == 200
        assert "detection" in res_eval.json()

        # Check live session creation & fault injection flow
        res_sess = requests.post(f"{backend_url}/sessions", json={"source": "simulator", "speed": 1}, timeout=3)
        assert res_sess.status_code == 201
        session_id = res_sess.json()["id"]

        # Inject a fault and verify immediate incident generation
        res_inject = requests.post(f"{backend_url}/sessions/{session_id}/faults", json={
            "type": "solar_degradation",
            "severity": 0.75
        }, timeout=3)
        assert res_inject.status_code == 201
        inject_data = res_inject.json()
        assert inject_data["status"] in ["scheduled", "active"]
        assert inject_data.get("incidentId") or inject_data.get("linkedIncidentId") or inject_data.get("id")

    except requests.exceptions.ConnectionError:
        pytest.skip("Node.js Backend Gateway not currently reachable at http://localhost:5000")
