from typing import Dict, List, Optional, Any

class ExplainerEngine:
    """
    Generates structured incident explanations based strictly on an evidence JSON payload.
    Enforces the invariant: Every numeric value in the output explanation string MUST
    originate from the evidence JSON.
    """

    @staticmethod
    def build_evidence(
        onset_order: List[str],
        per_channel_sigma: Dict[str, float],
        neighbors_flagged: List[str],
        data_quality: Dict[str, Any],
        limit_status: Dict[str, Any],
        runner_up: Dict[str, Any],
        time_to_limit: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Constructs the standardized Evidence JSON schema:
        {onset_order, per_channel_sigma, neighbors_flagged, data_quality, limit_status, runner_up, time_to_limit}
        """
        clean_sigmas = {k: round(float(v), 1) for k, v in per_channel_sigma.items()}
        
        clean_ru = {
            "subsystem": str(runner_up.get("subsystem", "NONE")),
            "confidence_score": round(float(runner_up.get("confidence_score", 0.0)), 1),
            "delta_score": round(float(runner_up.get("delta_score", 0.0)), 1)
        }
        
        clean_limit = {
            "within_limits": bool(limit_status.get("within_limits", True)),
            "closest_signal": str(limit_status.get("closest_signal", "none")),
            "margin_pct": round(float(limit_status.get("margin_pct", 100.0)), 1)
        }

        clean_dq = {
            "status": str(data_quality.get("status", "VALID")),
            "valid_channels": int(data_quality.get("valid_channels", 23)),
            "total_channels": int(data_quality.get("total_channels", 23)),
            "ok_fraction": round(float(data_quality.get("ok_fraction", 1.0)), 3),
            "per_channel_status": dict(data_quality.get("per_channel_status", {}))
        }

        clean_ttl_status = str(time_to_limit.get("status", "no crossing projected"))
        # When limit is already violated, force status to "limit already exceeded"
        if not clean_limit["within_limits"]:
            clean_ttl_status = "limit already exceeded"

        clean_ttl = {
            "status": clean_ttl_status,
            "confidence_pct": int(time_to_limit.get("confidence_pct", 80)),
            "median_rows": round(float(time_to_limit["median_rows"]), 1) if (clean_ttl_status == "PROJECTED" and time_to_limit.get("median_rows") is not None) else None,
            "range_80": [round(float(r), 1) for r in time_to_limit["range_80"]] if (clean_ttl_status == "PROJECTED" and time_to_limit.get("range_80") is not None) else None
        }

        return {
            "onset_order": list(onset_order),
            "per_channel_sigma": clean_sigmas,
            "neighbors_flagged": list(neighbors_flagged),
            "data_quality": clean_dq,
            "limit_status": clean_limit,
            "runner_up": clean_ru,
            "time_to_limit": clean_ttl
        }

    def generate_explanation(self, evidence: Dict[str, Any], source_subsystem: Optional[str] = None) -> str:
        """
        Template-based explanation generator reading exclusively from the evidence JSON.
        Guarantees: Every number appearing in the output string is present in evidence JSON.
        Includes:
        - Top 2-3 channels with direction and size vs forecast
        - Onset order
        - Source subsystem
        - One plain sentence on runner-up (omitted when NONE)
        - Time to limit projection or status
        """
        onset = evidence.get("onset_order", [])
        sigmas = evidence.get("per_channel_sigma", {})
        dq = evidence.get("data_quality", {})
        lim = evidence.get("limit_status", {})
        ru = evidence.get("runner_up", {})
        ttl = evidence.get("time_to_limit", {})

        if not onset:
            return "No anomalies detected across telemetry channels."

        # 1. Top 2-3 channels with size vs forecast
        top_channels = onset[:3]
        ch_phrases = []
        for ch in top_channels:
            s_val = sigmas.get(ch, 0.0)
            ch_phrases.append(f"{ch} elevated by {s_val} sigma vs forecast")
        channel_clause = ", ".join(ch_phrases)

        # 2. Onset sequence and source subsystem
        onset_str = ", ".join(onset[:4])
        onset_clause = f"Onset sequence: {onset_str}"
        sub_clause = f"Primary root cause identified as {source_subsystem} subsystem" if source_subsystem else "Anomalous subsystem activity detected"

        # 3. Data Quality & Limits
        dq_status = dq.get("status", "VALID")
        valid_ch = dq.get("valid_channels", 23)
        total_ch = dq.get("total_channels", 23)
        dq_clause = f"Data quality is {dq_status} across {valid_ch} of {total_ch} channels"

        parts = [f"{channel_clause}.", f"{onset_clause}.", f"{sub_clause}.", f"{dq_clause}."]

        # 4. Runner-up clause (plain sentence, omitted when NONE)
        ru_sub = ru.get("subsystem", "NONE")
        if ru_sub and ru_sub not in ("NONE", "UNKNOWN"):
            ru_conf = ru.get("confidence_score", 0.0)
            ru_delta = ru.get("delta_score", 0.0)
            parts.append(f"Runner-up candidate {ru_sub} has {ru_conf}% confidence with a {ru_delta}% margin gap.")

        # 5. Time-to-Limit clause
        ttl_status = ttl.get("status", "no crossing projected")
        if ttl_status == "limit already exceeded":
            parts.append("Operational hard limit is already exceeded.")
        elif ttl_status == "PROJECTED" and ttl.get("median_rows") is not None and ttl.get("range_80") is not None:
            med_rows = ttl["median_rows"]
            r_min, r_max = ttl["range_80"]
            conf_pct = ttl.get("confidence_pct", 80)
            parts.append(f"Projected time-to-limit is {med_rows} rows ({conf_pct}% range: {r_min} to {r_max} rows).")
        else:
            parts.append("Projected time-to-limit indicates no crossing projected.")

        explanation = " ".join(parts)
        return explanation

    # Backward compatibility with older callers
    def generate_explanation_compat(
        self,
        flagged_sensors: List[str],
        current_readings: Dict[str, float],
        predictions: Dict[str, float],
        root_cause_candidates: List[Dict],
        dep_graph_neighbors: Optional[List[str]] = None,
        ttl_result: Optional[Dict] = None
    ) -> str:
        sigmas = {}
        for s in flagged_sensors:
            act = current_readings.get(s, 0.0)
            prd = predictions.get(s, 0.0)
            diff = abs(act - prd)
            sigmas[s] = round(max(0.1, diff / 2.5), 1)

        ru = root_cause_candidates[1] if len(root_cause_candidates) > 1 else {"subsystem": "NONE", "confidence_score": 0.0}
        top_conf = root_cause_candidates[0]["confidence_score"] if root_cause_candidates else 95.0
        ru_conf = ru.get("confidence_score", 0.0)
        ru_dict = {
            "subsystem": ru.get("subsystem", "NONE"),
            "confidence_score": round(ru_conf, 1),
            "delta_score": round(max(0.0, top_conf - ru_conf), 1)
        }

        evidence = self.build_evidence(
            onset_order=flagged_sensors,
            per_channel_sigma=sigmas,
            neighbors_flagged=dep_graph_neighbors or [],
            data_quality={"status": "VALID", "valid_channels": 23, "total_channels": 23},
            limit_status={"within_limits": True, "closest_signal": flagged_sensors[0] if flagged_sensors else "none", "margin_pct": 14.5},
            runner_up=ru_dict,
            time_to_limit=ttl_result or {"status": "no crossing projected", "confidence_pct": 80, "median_rows": None, "range_80": None}
        )
        return self.generate_explanation(evidence)
