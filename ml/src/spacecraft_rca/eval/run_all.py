from pathlib import Path

import yaml

from ..utils import get_logger, set_global_seed

logger = get_logger(__name__)

def plot_f1_vs_missing(out_dir: Path):
    raise NotImplementedError("NOT COMPUTED")

def plot_false_alerts(out_dir: Path):
    raise NotImplementedError("NOT COMPUTED")

def run_all_evaluations():
    config_path = Path(__file__).parent.parent.parent.parent / "configs" / "default.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
        
    seed = config.get("seeds", {}).get("global", 42)
    set_global_seed(seed)
    
    reports_dir = Path(__file__).parent.parent.parent.parent / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("Starting Master Evaluation Suite...")
    
    try:
        plot_f1_vs_missing(reports_dir)
    except NotImplementedError:
        logger.warning("F1 plots NOT COMPUTED")
        
    try:
        plot_false_alerts(reports_dir)
    except NotImplementedError:
        logger.warning("False alerts plots NOT COMPUTED")
        
    report = [
        "# Spacecraft RCA - Master Evaluation Report",
        f"**Seed:** {seed}",
        "## 1. Detection Performance",
        "NOT COMPUTED",
        "",
        "## 2. Root Cause Analysis (Top-1 / Top-3)",
        "NOT COMPUTED",
        "",
        "## 3. Ablation Studies",
        "NOT COMPUTED"
    ]
    
    with open(reports_dir / "evaluation.md", "w", encoding="utf-8") as f:
        f.write("\n".join(report))
        
    logger.info("Master Evaluation Report compiled at reports/evaluation.md")

if __name__ == "__main__":
    run_all_evaluations()
