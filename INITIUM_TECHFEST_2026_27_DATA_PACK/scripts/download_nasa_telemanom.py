#!/usr/bin/env python3
"""
Download the public NASA/JPL Telemanom SMAP/MSL benchmark.

This script retrieves the official public benchmark used by the
Telemanom project and does NOT modify the downloaded values.

Source:
https://github.com/khundman/telemanom
Data archive:
https://s3-us-west-2.amazonaws.com/telemanom/data.zip
Labels:
https://raw.githubusercontent.com/khundman/telemanom/master/labeled_anomalies.csv
"""
from pathlib import Path
import urllib.request, zipfile

OUT = Path("data/nasa_telemanom")
OUT.mkdir(parents=True, exist_ok=True)

data_zip = OUT / "data.zip"
urllib.request.urlretrieve(
    "https://s3-us-west-2.amazonaws.com/telemanom/data.zip", data_zip
)
with zipfile.ZipFile(data_zip) as z:
    z.extractall(OUT)
data_zip.unlink()

urllib.request.urlretrieve(
    "https://raw.githubusercontent.com/khundman/telemanom/master/labeled_anomalies.csv",
    OUT / "labeled_anomalies.csv"
)
print("Downloaded NASA/JPL Telemanom SMAP/MSL data to", OUT)
