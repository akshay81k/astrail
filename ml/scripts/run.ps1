param (
    [string]$Command = ""
)

$env:RCA_API_KEY = "smoke-test-key-123"

switch ($Command) {
    "activate" {
        Write-Host "To activate, run: .\venv\Scripts\activate.ps1"
    }
    "test" {
        .\venv\Scripts\activate.ps1
        pytest -q tests/
    }
    "splits" {
        .\venv\Scripts\activate.ps1
        python -c "from spacecraft_rca.data.splits import generate_splits; generate_splits('../INITIUM_TECHFEST_2026_27_DATA_PACK', buffer=100)"
    }
    "zscore" {
        .\venv\Scripts\activate.ps1
        python scripts/run_zscore.py
    }
    "train" {
        .\venv\Scripts\activate.ps1
        python -m spacecraft_rca.train
    }
    "evaluate" {
        .\venv\Scripts\activate.ps1
        python -m spacecraft_rca.eval.run_all
    }
    "serve" {
        .\venv\Scripts\activate.ps1
        uvicorn spacecraft_rca.api.main:app --port 8001
    }
    "smoke" {
        .\venv\Scripts\activate.ps1
        python scripts/smoke_test.py
    }
    default {
        Write-Host "Usage: .\scripts\run.ps1 [activate|test|splits|zscore|train|evaluate|serve|smoke]"
    }
}
