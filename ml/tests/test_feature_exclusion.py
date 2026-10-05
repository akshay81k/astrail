import pandas as pd
from spacecraft_rca.models.iforest import IForestForecaster

def test_feature_list_excludes_labels():
    labels = ['anomaly_label', 'fault_type', 'source_subsystem', 'severity', 'fault_id', 'risk_level']
    
    df = pd.DataFrame({
        'timestamp': [1, 2, 3],
        'sensor1': [1.0, 1.0, 1.0],
        'anomaly_label': [0, 1, 0],
        'fault_type': ['none', 'none', 'none'],
        'risk_level': ['LOW', 'LOW', 'LOW']
    })
    
    forecaster = IForestForecaster(window_size=1)
    features = forecaster.extract_features(df)
    
    for label in labels:
        assert label not in features.columns, f"Label {label} leaked into feature set!"
