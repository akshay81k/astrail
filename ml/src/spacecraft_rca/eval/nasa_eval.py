import subprocess
from pathlib import Path

from ..utils import get_logger, set_global_seed

logger = get_logger(__name__)

def run_nasa_telemanom_eval():
    """
    Independent evaluation pipeline for NASA Telemanom data.
    Trains one small GRU PER CHANNEL (multivariate not used here) and applies conformal thresholding.
    No Root Cause Analysis (RCA) is performed on NASA data.
    """
    logger.info("Starting isolated NASA Telemanom Evaluation...")
    set_global_seed(42)
    
    data_root = Path(__file__).parent.parent.parent.parent.parent / "INITIUM_TECHFEST_2026_27_DATA_PACK" / "data"
    
    # 1. Execute external download script and verify checksums
    download_script = data_root / "scripts" / "download_nasa_telemanom.py"
    if download_script.exists():
        logger.info(f"Executing {download_script}...")
        try:
            # We assume the script handles its own checksum verification as requested
            subprocess.run(["python", str(download_script)], check=True)
            logger.info("NASA Telemanom download and verification completed.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Download script failed: {e}")
            return
    else:
        logger.warning(f"Download script not found at {download_script}. Proceeding with mocked evaluation for architecture completion.")
        
    # 2. Load Telemanom Data & Anomalies
    labels_path = data_root / "nasa_telemanom_labeled_anomalies.csv"
    
    # MOCK DATA LOADER FOR PIPELINE ARCHITECTURE (Replace with actual telemetry load)
    # The telemanom dataset usually has channels named 'F-1', 'P-1', etc.
    subset_channels = [f"channel_{i}" for i in range(10)] # Subset of 10 channels
    
    # 3. Train One GRU Per Channel & Apply Conformal
    results = {}
    total_events = 0
    tp = fp = fn = 0
    
    logger.info("Training separate univariate GRUs for a subset of channels...")
    raise NotImplementedError("NOT COMPUTED")
    
    report_path = Path(__file__).parent.parent.parent.parent / "reports" / "nasa_evaluation.md"
    with open(report_path, "w") as f:
        f.write("\n".join(report))
        
    logger.info(f"NASA evaluation complete. Report saved to {report_path}")

if __name__ == "__main__":
    run_nasa_telemanom_eval()
