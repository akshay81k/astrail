from pathlib import Path

import yaml

from .data.loaders import load_telemetry_data
from .utils import get_logger, set_global_seed

logger = get_logger(__name__)

def main() -> None:
    """Main training routine."""
    config_path = Path(__file__).parent.parent.parent / "configs" / "default.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
        
    seed = config.get("seeds", {}).get("global", 42)
    set_global_seed(seed)
    
    logger.info("Starting training process")
    
    data_root = config.get("data_root", "../data")
    try:
        df = load_telemetry_data(data_root, "clean")
        logger.info("Successfully loaded data of shape: %s", df.shape)
    except Exception as e:
        logger.error("Failed to load data: %s", e)

if __name__ == "__main__":
    main()
