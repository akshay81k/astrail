"""
Rule-based fault classifier with neighbor_flagged_fraction feature.
classify_event(flagged_sensors, signal_catalog, dep_graph, alerts_window, score_window)
  -> label in {'noise', 'sensor_fault', 'subsystem_fault'}
"""
import numpy as np
import pandas as pd


def neighbor_flagged_fraction(
    flagged_sensors: list,
    signal_catalog: pd.DataFrame,
    dep_graph: pd.DataFrame,
    all_flagged_sensors: list,
    window: int = 10,
) -> float:
    """
    Fraction of dependency-graph neighbors of flagged signals that are also flagged
    within +/-window rows (approximated here as: fraction of neighbor subsystems
    that have at least one flagged sensor).
    """
    if not flagged_sensors:
        return 0.0

    # Get subsystems of flagged signals
    flagged_subs = set(
        signal_catalog.loc[signal_catalog['signal'].isin(flagged_sensors), 'subsystem']
        .tolist()
    )
    # Neighbor subsystems via dep graph
    neighbor_subs = set()
    for sub in flagged_subs:
        nbrs = dep_graph.loc[
            (dep_graph['source_subsystem'] == sub) |
            (dep_graph['target_subsystem'] == sub),
            ['source_subsystem', 'target_subsystem']
        ].values.flatten()
        neighbor_subs.update(nbrs)
    neighbor_subs -= flagged_subs  # exclude self

    if not neighbor_subs:
        return 0.0

    # Which neighbor subs also have flagged signals?
    all_flagged_subs = set(
        signal_catalog.loc[signal_catalog['signal'].isin(all_flagged_sensors), 'subsystem']
        .tolist()
    )
    hit = neighbor_subs & all_flagged_subs
    return len(hit) / len(neighbor_subs)


def classify_event(
    flagged_sensors: list,
    all_flagged_sensors: list,
    signal_catalog: pd.DataFrame,
    dep_graph: pd.DataFrame,
    score_window: np.ndarray,
) -> dict:
    """
    Returns dict with:
      label: 'noise' | 'sensor_fault' | 'subsystem_fault'
      neighbor_flagged_fraction: float
      reason: str
    """
    nff = neighbor_flagged_fraction(
        flagged_sensors, signal_catalog, dep_graph, all_flagged_sensors
    )
    n_flagged = len(flagged_sensors)

    # Rule 1: noise — very few flagged, low max score, no neighbor propagation
    score_max = float(np.max(score_window)) if len(score_window) > 0 else 0.0
    score_mean = float(np.mean(score_window)) if len(score_window) > 0 else 0.0

    if n_flagged == 0 or (n_flagged <= 2 and nff < 0.1 and score_max < score_mean * 1.5):
        return {
            'label': 'noise',
            'neighbor_flagged_fraction': nff,
            'reason': f'n_flagged={n_flagged}, nff={nff:.3f}, score_max={score_max:.3f}'
        }

    # Rule 2: sensor_fault — single sensor flagged, no neighbor propagation
    if n_flagged == 1 and nff < 0.2:
        return {
            'label': 'sensor_fault',
            'neighbor_flagged_fraction': nff,
            'reason': f'single channel flagged={flagged_sensors[0]}, nff={nff:.3f}'
        }

    # Rule 3: subsystem_fault — multi-channel or high neighbor fraction
    return {
        'label': 'subsystem_fault',
        'neighbor_flagged_fraction': nff,
        'reason': f'n_flagged={n_flagged}, nff={nff:.3f}'
    }


# Thin shim for backward compatibility
def classify_fault(flagged_sensors, downstream_impact):
    if len(flagged_sensors) == 1 and not downstream_impact:
        return f"Sensor fault: {flagged_sensors[0]} unreliable"
    return "Subsystem Fault"
