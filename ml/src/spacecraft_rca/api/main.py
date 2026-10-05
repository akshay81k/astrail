import os
import time

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security.api_key import APIKeyHeader

from ..utils import get_logger, load_artifact
from .schemas import TelemetryBatch

logger = get_logger(__name__)

app = FastAPI(title="Spacecraft RCA API", version="1.0.0")

# Security
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key_header: str = Depends(api_key_header)):
    expected = os.getenv("RCA_API_KEY")
    if not expected:
        # Failsafe if env var missing in prod
        raise HTTPException(status_code=500, detail="Server auth configuration missing.")
    if api_key_header != expected:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
    return api_key_header

# CORS
origins = [
    "https://dashboard.spacecraft-rca.local",
    "http://dashboard.spacecraft-rca.local"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["X-API-Key", "Content-Type"],
)

# Exception Handler to suppress stack traces
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url}: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )

# Model Loading (Strict SHA256 Check)
models = {}

@app.on_event("startup")
async def load_models():
    logger.info("Starting up API, loading models via SHA256 manifest check...")
    try:
        # Load artifacts securely through utils (which enforces manifest.json SHA256 verification)
        # Note: If artifacts aren't generated yet or tampered, this will raise an exception.
        models['gru'] = load_artifact("gru_state_dict.safetensors", artifact_type="safetensors")
        logger.info("Successfully verified and loaded models.")
    except Exception as e:
        logger.error(f"Failed to load models securely: {e}")
        # In a real app we might sys.exit(1), but for testing we'll just log

@app.post("/ingest", dependencies=[Depends(get_api_key)])
async def ingest_telemetry(batch: TelemetryBatch):
    logger.info(f"Received valid batch {batch.batch_id} with {len(batch.data)} rows.")
    # Here we would route to the detection pipeline
    return {"status": "accepted", "rows_processed": len(batch.data)}

# WebSocket Connection Manager with basic rate limiting
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.last_msg_time = {}

    async def connect(self, websocket: WebSocket, token: str):
        expected = os.getenv("RCA_API_KEY")
        if token != expected:
            await websocket.close(code=4003)
            return False
            
        await websocket.accept()
        self.active_connections.append(websocket)
        self.last_msg_time[websocket] = time.time()
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.last_msg_time:
            del self.last_msg_time[websocket]

    async def send_incident(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send websocket message: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    success = await manager.connect(websocket, token)
    if not success:
        return
        
    try:
        while True:
            # Client heartbeat/commands
            data = await websocket.receive_text()
            
            # Rate limit: max 2 msgs per second
            now = time.time()
            if now - manager.last_msg_time[websocket] < 0.5:
                await websocket.send_json({"error": "Rate limit exceeded"})
                continue
            manager.last_msg_time[websocket] = now
            
            await websocket.send_json({"ack": "received"})
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
