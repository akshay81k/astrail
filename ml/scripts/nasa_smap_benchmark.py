import os
import urllib.request
import zipfile
import logging
import argparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

NASA_SMAP_URL = "https://s3-us-west-2.amazonaws.com/telemanom/data.zip"

def download_and_extract_smap(data_dir: str):
    """Downloads the official NASA SMAP/MSL telemetry benchmark dataset."""
    os.makedirs(data_dir, exist_ok=True)
    zip_path = os.path.join(data_dir, "nasa_data.zip")
    
    if not os.path.exists(zip_path):
        logging.info(f"Downloading NASA SMAP dataset from {NASA_SMAP_URL}...")
        
        # AWS S3 sometimes blocks programmatic downloads with a 403 Forbidden.
        # We use requests with headers, and fallback gracefully if they still block it.
        try:
            import requests
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            with requests.get(NASA_SMAP_URL, stream=True, headers=headers) as r:
                r.raise_for_status()
                with open(zip_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            logging.info("Download complete.")
        except Exception as e:
            logging.error(f"AWS S3 blocked the automated download ({e}).")
            logging.error("Please download the dataset manually from the JPL Telemanom repository: https://github.com/khundman/telemanom")
            return
            
    logging.info("Extracting dataset...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(data_dir)
    logging.info(f"NASA dataset extracted to {data_dir}/data")

def evaluate_nasa_benchmark():
    """
    Hook to pass the downloaded NASA arrays through the trained Spacecraft GRU.
    NASA telemetry is provided in .npy format.
    """
    logging.info("Initializing Spacecraft GRU model for cross-domain evaluation...")
    # TODO: Load PyTorch GRU model from ../models/gru_v1.pt
    # TODO: Iterate through /data/test/ and /data/train/ .npy files
    # TODO: Calculate F1 score using our conformal thresholding logic
    logging.info("NASA SMAP Evaluation Suite initialized. Awaiting model weights.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the NASA SMAP/MSL Benchmark against the Spacecraft GRU")
    parser.add_argument("--download", action="store_true", help="Download the 500MB NASA dataset")
    args = parser.parse_args()
    
    if args.download:
        download_and_extract_smap("./nasa_benchmark")
    else:
        logging.info("Run with --download to fetch the NASA dataset.")
    
    evaluate_nasa_benchmark()
