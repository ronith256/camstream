from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os
from datetime import datetime
from app.api.routes import api_router
from app.api.webrtc import webrtc_router
from app.camera.camera import Camera, get_camera
from app.config.settings import settings

app = FastAPI(title="CamStream API - Multi-Camera")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")

# Include WebRTC routes
app.include_router(webrtc_router, prefix="/api/webrtc", tags=["webrtc"])

# Create media directory if it doesn't exist
os.makedirs(settings.MEDIA_DIR, exist_ok=True)

# Mount static files
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")

@app.on_event("startup")
async def startup_event():
    # Initialize each configured camera
    for camera_id in settings.CAMERAS:
        camera = Camera.get_instance(camera_id)
        if not camera.is_active():
            camera.initialize()

@app.on_event("shutdown")
async def shutdown_event():
    # Release all camera resources
    for camera_id, camera in Camera.get_all_instances().items():
        camera.release()
    
    # Close any WebRTC connections for all cameras
    for camera_id, camera in Camera.get_all_instances().items():
        from app.camera.webrtc_stream import get_webrtc_manager
        manager = get_webrtc_manager(camera)
        await manager.close_all_connections()

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)