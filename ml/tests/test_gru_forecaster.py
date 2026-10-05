import numpy as np
import torch

from spacecraft_rca.models.gru_forecaster import GRUForecaster, TelemetryWindowDataset


def test_gru_forecaster_masked_inputs():
    """
    Ensure the model processes inputs properly, even when 50% of the channels
    are masked (zeros in features, ones in mask), and does not produce NaNs.
    """
    input_dim = 50
    hidden_dim = 64
    batch_size = 8
    seq_len = 32
    output_dim = 23
    
    model = GRUForecaster(input_dim=input_dim, hidden_dim=hidden_dim, num_layers=1, output_dim=output_dim, dropout=0.2)
    model.eval()
    
    # Create random input
    x = torch.randn(batch_size, seq_len, input_dim)
    
    # Mask 50% of the channels: set signal to 0 and mask to 1
    # Signals are 0-22, masks are 27-49
    mask_indices = np.random.choice(23, size=12, replace=False)
    for idx in mask_indices:
        x[:, :, idx] = 0.0          # zero out signal
        x[:, :, 27 + idx] = 1.0     # set missing mask
        
    # Standard forward pass
    with torch.no_grad():
        preds = model(x)
        
    assert preds.shape == (batch_size, output_dim)
    assert not torch.isnan(preds).any(), "Model produced NaNs with 50% masked inputs."
    assert not torch.isinf(preds).any(), "Model produced infs with 50% masked inputs."
    
    # Test MC Dropout
    mean_preds, std_preds = model.predict_mc_dropout(x, num_samples=10)
    assert mean_preds.shape == (batch_size, output_dim)
    assert std_preds.shape == (batch_size, output_dim)
    assert not torch.isnan(mean_preds).any()
    assert not torch.isnan(std_preds).any()
    assert (std_preds >= 0).all(), "Standard deviation must be non-negative."

def test_dataset_augmentation():
    """Verify that dataset augmentation drops channels randomly."""
    X = np.ones((100, 50))
    y = np.ones((100, 23))
    
    dataset = TelemetryWindowDataset(X, y, window_size=10, augment=True, drop_prob=1.0) # Force drop
    x_window, y_target = dataset[0]
    
    # Signals (0-22) should all be zeroed out
    assert torch.all(x_window[:, :23] == 0.0)
    # Masks (27-49) should all be 1.0
    assert torch.all(x_window[:, 27:50] == 1.0)
