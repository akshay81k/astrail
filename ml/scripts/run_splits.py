import os
from pathlib import Path
from spacecraft_rca.data.splits import generate_splits

if __name__ == '__main__':
    data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
    generate_splits(data_root)
