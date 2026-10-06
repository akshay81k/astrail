import argparse
import json
import os
from pathlib import Path
import time
import pandas as pd
import requests

DEFAULT_CLEAN_CSV = Path(__file__).resolve().parent.parent / "INITIUM_TECHFEST_2026_27_DATA_PACK" / "data" / "synthetic_telemetry_clean.csv"
if not DEFAULT_CLEAN_CSV.exists():
    DEFAULT_CLEAN_CSV = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK/data/synthetic_telemetry_clean.csv")

API_URL = os.getenv("API_URL", "http://127.0.0.1:8001/ingest")
API_KEY = os.getenv("RCA_API_KEY", "dev-key-123")

def stream_data(csv_path: str, start_row: int = 11900, delay_sec: float = 0.1, loop: bool = True):
    print(f"Loading real telemetry dataset from: {csv_path}")
    df = pd.read_csv(csv_path)
    total_rows = len(df)
    print(f"Dataset loaded: {total_rows} rows, {len(df.columns)} columns.")
    print(f"Starting continuous stream from row {start_row} with delay {delay_sec}s (Loop: {loop})...")

    valid_modes = {'NOMINAL', 'SAFE', 'SCIENCE', 'ECLIPSE'}
    curr_row = start_row

    while True:
        if curr_row >= total_rows:
            if loop:
                print("Reached end of telemetry dataset, looping back to start...")
                curr_row = 0
            else:
                print("Reached end of telemetry dataset.")
                break

        row = df.iloc[curr_row]
        curr_row += 1

        try:
            ts = pd.to_datetime(row['timestamp']).timestamp()
        except Exception:
            continue

        mode = row['mode'] if 'mode' in row and str(row['mode']) in valid_modes else 'NOMINAL'

        signals = {}
        for c in df.columns:
            if c not in ['timestamp', 'mode', 'spacecraft_id'] and not pd.isna(row[c]):
                val = row[c]
                if str(val).strip().upper() != 'NONE':
                    try:
                        signals[c] = float(val)
                    except ValueError:
                        pass

        d = {
            'timestamp': float(ts),
            'mode': mode,
            'signals': signals
        }

        payload = {
            "batch_id": f"stream_{curr_row}",
            "data": [d]
        }

        try:
            res = requests.post(
                API_URL,
                json=payload,
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                timeout=5.0
            )
            if res.status_code != 200:
                print(f"[Row {curr_row}] Error {res.status_code}: {res.text}")
            else:
                data = res.json()
                status = "NOMINAL"
                if data.get("incident"):
                    status = f"ANOMALY ({data['incident']['flagged_sensors']})"
                print(f"[Row {curr_row}/{total_rows}] Temp={signals.get('battery_temperature_C', 0):.2f}°C, Current={signals.get('solar_array_current_A', 0):.2f}A -> Status: {status}")
        except Exception as e:
            print(f"[Row {curr_row}] Ingest connection error: {e}")
            time.sleep(1.0)

        time.sleep(delay_sec)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stream real spacecraft telemetry to ML RCA API")
    parser.add_argument("--csv", default=str(DEFAULT_CLEAN_CSV), help="Path to telemetry CSV file")
    parser.add_argument("--start-row", type=int, default=11900, help="Row index to start streaming from")
    parser.add_argument("--delay", type=float, default=0.1, help="Delay in seconds between streamed rows")
    parser.add_argument("--no-loop", action="store_true", help="Do not loop after reaching the end of the file")
    args = parser.parse_args()

    stream_data(csv_path=args.csv, start_row=args.start_row, delay_sec=args.delay, loop=not args.no_loop)
