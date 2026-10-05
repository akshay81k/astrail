import hashlib
import json
import logging
import random
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
from safetensors.torch import load_file, save_file


def get_logger(name: str) -> logging.Logger:
    """
    Returns a configured structured logger.

    Args:
        name: Name of the logger.

    Returns:
        A configured logging.Logger instance.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)
    return logger

logger = get_logger(__name__)

def set_global_seed(seed: int) -> None:
    """
    Sets global seeds for deterministic runs across random, numpy, and torch.

    Args:
        seed: The integer seed to use.
    """
    logger.info("Setting global seed to %d", seed)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # Force deterministic algorithms
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def _compute_sha256(filepath: str | Path) -> str:
    """Computes the SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def _get_manifest_path() -> Path:
    return Path(__file__).parent.parent.parent / "artifacts" / "manifest.json"


def _update_manifest(filename: str, sha256_hash: str) -> None:
    manifest_path = _get_manifest_path()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    
    manifest: dict[str, str] = {}
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError:
            pass

    manifest[filename] = sha256_hash
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=4)


def save_artifact(obj: Any, filename: str, artifact_type: str) -> None:
    """
    Saves an artifact and registers its SHA256 hash in the manifest.

    Args:
        obj: The object to save (dict of tensors for 'safetensors', sklearn model for 'joblib').
        filename: Name of the file inside the artifacts directory.
        artifact_type: The type of artifact ('safetensors' or 'joblib').
    """
    artifacts_dir = Path(__file__).parent.parent.parent / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    filepath = artifacts_dir / filename

    if artifact_type == "safetensors":
        save_file(obj, filepath)
    elif artifact_type == "joblib":
        joblib.dump(obj, filepath)
    elif artifact_type == "json":
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=4)
    else:
        raise ValueError(f"Unsupported artifact type: {artifact_type}")

    file_hash = _compute_sha256(filepath)
    _update_manifest(filename, file_hash)
    logger.info("Saved artifact %s with hash %s", filename, file_hash)


def load_artifact(filename: str, artifact_type: str) -> Any:
    """
    Loads an artifact after verifying its SHA256 hash against the manifest.

    Args:
        filename: Name of the file inside the artifacts directory.
        artifact_type: The type of artifact ('safetensors' or 'joblib').

    Returns:
        The loaded object.
    """
    artifacts_dir = Path(__file__).parent.parent.parent / "artifacts"
    filepath = artifacts_dir / filename
    manifest_path = _get_manifest_path()

    if not filepath.exists():
        raise FileNotFoundError(f"Artifact {filename} not found at {filepath}")
    
    if not manifest_path.exists():
        raise FileNotFoundError("Manifest file not found. Cannot verify artifact integrity.")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    expected_hash = manifest.get(filename)
    if not expected_hash:
        raise ValueError(f"Artifact {filename} is not registered in the manifest.")

    actual_hash = _compute_sha256(filepath)
    if actual_hash != expected_hash:
        raise ValueError(f"Hash mismatch for {filename}: expected {expected_hash}, got {actual_hash}")

    logger.info("Verified hash for artifact %s", filename)

    if artifact_type == "safetensors":
        return load_file(filepath)
    elif artifact_type == "joblib":
        return joblib.load(filepath)
    elif artifact_type == "json":
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        raise ValueError(f"Unsupported artifact type: {artifact_type}")
