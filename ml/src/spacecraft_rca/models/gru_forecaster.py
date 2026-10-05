import copy
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from ..utils import get_logger, save_artifact

logger = get_logger(__name__)

class GRUForecaster(nn.Module):
    def __init__(self, input_dim: int = 50, hidden_dim: int = 64, num_layers: int = 2, output_dim: int = 23, dropout: float = 0.2):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.output_dim = output_dim
        
        # MC Dropout requires dropout to be active during inference
        self.dropout_rate = dropout
        self.gru = nn.GRU(
            input_size=input_dim, 
            hidden_size=hidden_dim, 
            num_layers=num_layers, 
            batch_first=True, 
            dropout=dropout if num_layers > 1 else 0.0
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, seq_len, input_dim)
        # Enable MC Dropout during inference
        out, _ = self.gru(x)
        out = self.dropout(out[:, -1, :]) # Take last step
        out = self.fc(out)
        return out

    def predict_mc_dropout(self, x: torch.Tensor, num_samples: int = 30) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Runs MC Dropout to estimate epistemic uncertainty.
        Returns: (mean_prediction, std_prediction)
        """
        self.train() # Force train mode for dropout
        preds = []
        with torch.no_grad():
            for _ in range(num_samples):
                out, _ = self.gru(x)
                out = self.dropout(out[:, -1, :])
                preds.append(self.fc(out))
        
        preds_stack = torch.stack(preds) # (num_samples, batch, output_dim)
        mean_pred = preds_stack.mean(dim=0)
        std_pred = preds_stack.std(dim=0)
        
        self.eval()
        return mean_pred, std_pred

class TelemetryWindowDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray, window_size: int = 32, augment: bool = False, drop_prob: float = 0.1):
        """
        X: features (batch, input_dim)
        y: targets (batch, output_dim)
        """
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32)
        self.window_size = window_size
        self.augment = augment
        self.drop_prob = drop_prob
        
    def __len__(self):
        return len(self.X) - self.window_size

    def __getitem__(self, idx):
        x_window = self.X[idx : idx + self.window_size].clone()
        y_target = self.y[idx + self.window_size].clone()
        
        if self.augment:
            # Augmentation: randomly drop channels
            # X features structure assumption: 
            # 0-22: signals, 23-26: mode one-hot, 27-49: missing masks
            mask = torch.rand(23) < self.drop_prob
            if mask.any():
                # Set signal to 0 and missing mask to 1
                x_window[:, :23][:, mask] = 0.0
                x_window[:, 27:50][:, mask] = 1.0
                
        return x_window, y_target

def train_model(
    model: nn.Module, 
    train_loader: DataLoader, 
    val_loader: DataLoader, 
    epochs: int = 50, 
    patience: int = 5, 
    lr: float = 1e-3, 
    device: str = "cpu"
) -> dict[str, Any]:
    
    model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    best_val_loss = float('inf')
    best_model_state = None
    patience_counter = 0
    history = {"train_loss": [], "val_loss": [], "val_rmse_per_channel": None}
    
    # Using masked MSE: where target is not 0 in mask if we pass masks in y, 
    # but for simplicity, we assume targets are non-missing in clean val.
    criterion = nn.MSELoss()
    
    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for x_batch, y_batch in train_loader:
            x_batch, y_batch = x_batch.to(device), y_batch.to(device)
            
            optimizer.zero_grad()
            preds = model(x_batch)
            loss = criterion(preds, y_batch)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item() * len(x_batch)
            
        train_loss /= len(train_loader.dataset)
        history["train_loss"].append(train_loss)
        
        # Validation
        model.eval()
        val_loss = 0.0
        all_preds, all_targets = [], []
        with torch.no_grad():
            for x_batch, y_batch in val_loader:
                x_batch, y_batch = x_batch.to(device), y_batch.to(device)
                preds = model(x_batch)
                loss = criterion(preds, y_batch)
                val_loss += loss.item() * len(x_batch)
                
                all_preds.append(preds.cpu())
                all_targets.append(y_batch.cpu())
                
        val_loss /= len(val_loader.dataset)
        history["val_loss"].append(val_loss)
        
        logger.info(f"Epoch {epoch+1}/{epochs} - Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_model_state = copy.deepcopy(model.state_dict())
            patience_counter = 0
            
            # Compute per-channel RMSE
            all_preds = torch.cat(all_preds, dim=0)
            all_targets = torch.cat(all_targets, dim=0)
            rmse_per_channel = torch.sqrt(torch.mean((all_preds - all_targets)**2, dim=0)).numpy()
            history["val_rmse_per_channel"] = rmse_per_channel.tolist()
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info(f"Early stopping triggered at epoch {epoch+1}")
                break
                
    model.load_state_dict(best_model_state)
    logger.info("Training complete.")
    
    # Save the artifacts
    config = {
        "input_dim": model.input_dim,
        "hidden_dim": model.hidden_dim,
        "num_layers": model.num_layers,
        "output_dim": model.output_dim,
        "dropout": model.dropout_rate
    }
    save_artifact(best_model_state, "gru_state_dict.safetensors", artifact_type="safetensors")
    save_artifact(config, "gru_config.json", artifact_type="json")
    
    return history
