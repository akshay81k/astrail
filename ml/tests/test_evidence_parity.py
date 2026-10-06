import re
from spacecraft_rca.models.explain import ExplainerEngine

def test_explanation_evidence_parity():
    ee = ExplainerEngine()
    
    # 1. Test Projected TTL
    evidence1 = ee.build_evidence(
        onset_order=['payload_power_W', 'power_bus_current_A'],
        per_channel_sigma={'payload_power_W': 4.8, 'power_bus_current_A': 3.2},
        neighbors_flagged=['power_bus_voltage_V'],
        data_quality={'status': 'VALID', 'valid_channels': 23, 'total_channels': 23},
        limit_status={'within_limits': True, 'closest_signal': 'payload_power_W', 'margin_pct': 11.2},
        runner_up={'subsystem': 'POWER', 'confidence_score': 18.5, 'delta_score': 76.5},
        time_to_limit={'status': 'PROJECTED', 'confidence_pct': 80, 'median_rows': 32.3, 'range_80': [28.0, 38.1]}
    )
    explanation1 = ee.generate_explanation(evidence1)
    
    def extract_numbers_from_obj(obj):
        nums = set()
        if isinstance(obj, (int, float)):
            nums.add(round(float(obj), 4))
        elif isinstance(obj, dict):
            for v in obj.values():
                nums.update(extract_numbers_from_obj(v))
        elif isinstance(obj, list):
            for v in obj:
                nums.update(extract_numbers_from_obj(v))
        return nums

    ev_nums1 = extract_numbers_from_obj(evidence1)
    extracted_nums1 = [float(x) for x in re.findall(r'\b\d+(?:\.\d+)?\b', explanation1)]
    assert len(extracted_nums1) > 0, "No numbers extracted from explanation1"
    for n in extracted_nums1:
        assert round(n, 4) in ev_nums1 or int(n) in ev_nums1, f"Number {n} in explanation1 was not in evidence JSON!"

    # 2. Test No Crossing Projected
    evidence2 = ee.build_evidence(
        onset_order=['eps_temperature_C'],
        per_channel_sigma={'eps_temperature_C': 2.4},
        neighbors_flagged=[],
        data_quality={'status': 'VALID', 'valid_channels': 23, 'total_channels': 23},
        limit_status={'within_limits': True, 'closest_signal': 'eps_temperature_C', 'margin_pct': 28.5},
        runner_up={'subsystem': 'NONE', 'confidence_score': 0.0, 'delta_score': 95.0},
        time_to_limit={'status': 'no crossing projected', 'confidence_pct': 80, 'median_rows': None, 'range_80': None}
    )
    explanation2 = ee.generate_explanation(evidence2)
    ev_nums2 = extract_numbers_from_obj(evidence2)
    extracted_nums2 = [float(x) for x in re.findall(r'\b\d+(?:\.\d+)?\b', explanation2)]
    assert len(extracted_nums2) > 0, "No numbers extracted from explanation2"
    for n in extracted_nums2:
        assert round(n, 4) in ev_nums2 or int(n) in ev_nums2, f"Number {n} in explanation2 was not in evidence JSON!"
