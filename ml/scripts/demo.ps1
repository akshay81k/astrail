# Astrail Live Spacecraft RCA Demonstration Script
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ASTRAIL - Spacecraft Telemetry RCA Live Demo" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$VenvPython = ".\venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[ERROR] Virtualenv python not found at $VenvPython" -ForegroundColor Red
    exit 1
}

Write-Host "`n1. Verifying Model Artifacts & Evaluation Suite..." -ForegroundColor Yellow
& $VenvPython scripts/eval_phase8.py

Write-Host "`n2. Launching Mission Control UI..." -ForegroundColor Yellow
$MissionControlPath = Resolve-Path "mission_control.html"
Start-Process "file:///$($MissionControlPath -replace '\\', '/')"

Write-Host "`n3. Checking Live Ingestion Server (:8001)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8001/health" -Method Get -TimeoutSec 2
    Write-Host "   API is ALIVE: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "   API server not detected on port 8001. Starting in background..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; uvicorn spacecraft_rca.api.main:app --port 8001"
    Start-Sleep -Seconds 3
}

Write-Host "`n4. Running Streamer Playback (Fault F001 @ row 11950)..." -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop streaming." -ForegroundColor Gray
& $VenvPython streamer.py
