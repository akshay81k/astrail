import time
import requests
import pandas as pd
import json

CSV_PATH = "../INITIUM_TECHFEST_2026_27_DATA_PACK/data/synthetic_telemetry_imperfect.csv"
API_URL = "http://127.0.0.1:8001/ingest"
API_KEY = "dev-key-123"

def stream_data():
    print("Loading dataset...")
    df = pd.read_csv(CSV_PATH)
    
    # We will pick a slice that contains a known fault to make it interesting
    # F001 (Power Surge) happens around row 12000. Let's start streaming from row 11950.
    start_row = 11950
    print(f"Starting continuous stream from row {start_row}...")
    
    while True:
        buffer = []
        for i in range(start_row, len(df)):
            row = df.iloc[i]
            
            try:
                ts = pd.to_datetime(row['timestamp']).timestamp()
            except:
                continue
                
            valid_modes = ['NOMINAL', 'SAFE', 'SCIENCE', 'ECLIPSE']
            mode = row['mode']
            if mode not in valid_modes:
                mode = 'NOMINAL'  # Fallback for unexpected dataset modes like HIGH_LOAD
                
            d = {'timestamp': float(ts), 'mode': mode, 'signals': {}}
            for c in df.columns:
                if c not in ['timestamp', 'mode', 'spacecraft_id'] and not pd.isna(row[c]):
                    val = row[c]
                    if str(val).strip().upper() != 'NONE':
                        try:
                            d['signals'][c] = float(val)
                        except ValueError:
                            pass
                    
            buffer.append(d)
            
            # We simulate the stream by sending 1 row at a time, every 0.1 seconds
            if len(buffer) == 1:
                payload = {
                    "batch_id": f"stream_{i}",
                    "data": buffer
                }
                try:
                    res = requests.post(
                        API_URL, 
                        json=payload, 
                        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"}
                    )
                    if res.status_code != 200:
                        print(f"Error {res.status_code}: {res.text}")
                    else:
                        print(f"Sent row {i} to API...")
                except Exception as e:
                    print(f"Connection failed: {e}")
                    
                buffer = []
                time.sleep(0.1) # 10 rows per second for dramatic effect
        print("Reached end of dataset, looping back to row 11950...")

if __name__ == "__main__":
    stream_data()
