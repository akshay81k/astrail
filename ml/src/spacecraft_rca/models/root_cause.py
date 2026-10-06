import pandas as pd
import networkx as nx
from pathlib import Path
from typing import List, Dict

class RootCauseEngine:
    def __init__(self, data_root: Path):
        self.sig_cat = pd.read_csv(data_root / "metadata" / "signal_catalog.csv")
        self.dep_graph = pd.read_csv(data_root / "metadata" / "dependency_graph.csv")
        
        # Build subsystem to sensors mapping
        self.sub_to_sensors = {}
        self.sensor_to_sub = {}
        for _, row in self.sig_cat.iterrows():
            sub = row['subsystem']
            sig = row['signal']
            self.sub_to_sensors.setdefault(sub, []).append(sig)
            self.sensor_to_sub[sig] = sub
            
        # Build DAG
        self.G = nx.DiGraph()
        for _, row in self.dep_graph.iterrows():
            self.G.add_edge(row['source_subsystem'], row['target_subsystem'], 
                            mechanism=row.get('coupling_mechanism', 'unknown'))
            
    def analyze_incident(self, flagged_sensors: List[str]) -> Dict:
        """
        Given a list of anomalous sensors (e.g., from GRU), identify the likely root subsystem
        and trace downstream impacts.
        """
        if not flagged_sensors:
            return {"root_cause_candidates": [], "downstream_impact": [], "flagged_subsystems": []}
            
        # Map sensors to subsystems
        flagged_subs = set()
        for s in flagged_sensors:
            sub = self.sensor_to_sub.get(s)
            if sub:
                flagged_subs.add(sub)
                
        # Find the root among the flagged subsystems
        # A node is a strong root candidate if it has a path TO other flagged nodes,
        # but no path FROM other flagged nodes.
        scores = {sub: 0 for sub in flagged_subs}
        for u in flagged_subs:
            for v in flagged_subs:
                if u != v and nx.has_path(self.G, u, v):
                    scores[u] += 1 # u is upstream of v
                    scores[v] -= 1 # v is downstream of u
                    
        # Normalize scores to percentages
        if scores:
            min_score = min(scores.values())
            max_score = max(scores.values())
            range_score = max_score - min_score
            
            candidates = sorted(scores.items(), key=lambda x: x[1], reverse=True)
            top_candidates = []
            for sub, score in candidates:
                if range_score == 0:
                    conf = 95.0 if len(candidates) == 1 else round(100.0 / len(candidates), 1)
                else:
                    # Scale to 50-99% range based on relative depth
                    conf = 50.0 + (score - min_score) / range_score * 49.0
                top_candidates.append({"subsystem": sub, "confidence_score": round(conf, 1)})
        else:
            top_candidates = []
        
        # Determine all downstream systems affected by the primary root cause
        downstream = []
        if top_candidates:
            root = top_candidates[0]["subsystem"]
            downstream = list(nx.descendants(self.G, root))
            
        # Classify Fault Type: Noise/Sensor vs Subsystem Fault
        fault_type = "Subsystem Fault"
        if len(flagged_sensors) == 1 and not downstream:
            fault_type = "Transient Noise / Isolated Sensor Fault"
            
        # Deterministic Confidence Calculation
        detector_margin = 1.2
        data_quality_score = 1.0
        confidence_reasons = []
        
        if top_candidates:
            if len(top_candidates) > 1:
                gap = max(0.01, (top_candidates[0]["confidence_score"] - top_candidates[1]["confidence_score"]) / 100.0)
            else:
                gap = 1.0
            
            conf = min(100.0, max(0.0, detector_margin * data_quality_score * gap * 100))
            top_candidates[0]["confidence_score"] = round(conf, 1)
            confidence_reasons = [
                f"Detector Margin: {detector_margin:.2f}",
                f"Data Quality: {data_quality_score:.2f}",
                f"Rank Gap: {gap:.2f}"
            ]
            
        return {
            "root_cause_candidates": top_candidates,
            "downstream_impact": downstream,
            "flagged_subsystems": list(flagged_subs),
            "fault_classification": fault_type,
            "confidence_reasons": confidence_reasons
        }
