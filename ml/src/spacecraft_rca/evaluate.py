from pathlib import Path

import yaml

from .utils import get_logger, set_global_seed

logger = get_logger(__name__)

def evaluate_thresholds(config: dict, data_root: Path):
    raise NotImplementedError("NOT COMPUTED")

def generate_headline_chart():
    raise NotImplementedError("NOT COMPUTED")

def main() -> None:
    """Main evaluation routine."""
    config_path = Path(__file__).parent.parent.parent / "configs" / "default.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
        
    seed = config.get("seeds", {}).get("global", 42)
    set_global_seed(seed)
    
    logger.info("Starting evaluation process")
    data_root = Path(config.get("data_root", "../data"))
    
    try:
        evaluate_thresholds(config, data_root)
    except NotImplementedError:
        logger.warning("Threshold evaluation NOT COMPUTED")
        
    try:
        generate_headline_chart()
    except NotImplementedError:
        logger.warning("Headline chart NOT COMPUTED")

if __name__ == "__main__":
    main()
