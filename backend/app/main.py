from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import asyncio
import os
import logging
from datetime import datetime
from app.api.routes import api_router
from app.api.webrtc import webrtc_router
from app.camera.camera import Camera, get_camera
from app.config.settings import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('camstream.log')
    ]
)

logger = logging.getLogger(__name__)

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
    """Initialize cameras asynchronously on startup"""
    logger.info("Starting application and initializing cameras...")
    
    # Create instances but don't initialize yet
    cameras = {}
    for camera_id in settings.CAMERAS:
        cameras[camera_id] = Camera.get_instance(camera_id)
        logger.info(f"Created camera instance for {camera_id}")
    
    # Initialize cameras with a concurrency limit to avoid resource issues
    # Process in batches of N cameras at a time
    batch_size = settings.CAMERA_INIT_BATCH_SIZE
    init_tasks = []
    initialized_cameras = 0
    
    # Group cameras into batches
    camera_ids = list(cameras.keys())
    
    for i in range(0, len(camera_ids), batch_size):
        batch_camera_ids = camera_ids[i:i+batch_size]
        batch_tasks = []
        
        for camera_id in batch_camera_ids:
            camera = cameras[camera_id]
            if not camera.is_active():
                logger.info(f"Scheduling initialization for camera {camera_id}")
                batch_tasks.append(initialize_camera_with_retries(camera))
        
        if batch_tasks:
            # Process this batch concurrently
            logger.info(f"Initializing batch of {len(batch_tasks)} cameras...")
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Check results
            for j, result in enumerate(batch_results):
                camera_id = batch_camera_ids[j]
                if isinstance(result, Exception):
                    logger.error(f"Failed to initialize camera {camera_id}: {str(result)}")
                else:
                    initialized_cameras += 1
                    logger.info(f"Camera {camera_id} initialized successfully")
            
            # Add a small delay between batches
            if i + batch_size < len(camera_ids):
                await asyncio.sleep(1.0)
    
    logger.info(f"Startup complete: {initialized_cameras}/{len(camera_ids)} cameras initialized")

async def initialize_camera_with_retries(camera, max_retries=3):
    """Initialize a camera with retries"""
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Attempting to initialize camera {camera.camera_id} (attempt {attempt}/{max_retries})")
            await camera.initialize_async()
            logger.info(f"Camera {camera.camera_id} initialized successfully on attempt {attempt}")
            return True
        except Exception as e:
            logger.error(f"Attempt {attempt}/{max_retries} to initialize camera {camera.camera_id} failed: {str(e)}")
            if attempt < max_retries:
                # Wait before retry with exponential backoff
                wait_time = 2 ** attempt
                logger.info(f"Waiting {wait_time} seconds before retrying...")
                await asyncio.sleep(wait_time)
            else:
                # Last attempt failed
                logger.error(f"All {max_retries} attempts to initialize camera {camera.camera_id} failed")
                raise

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down application...")
    
    # Release all camera resources
    for camera_id, camera in Camera.get_all_instances().items():
        try:
            logger.info(f"Releasing camera {camera_id}")
            camera.release()
        except Exception as e:
            logger.error(f"Error releasing camera {camera_id}: {str(e)}")
    
    # Close any WebRTC connections for all cameras
    try:
        for camera_id, camera in Camera.get_all_instances().items():
            from app.camera.webrtc_stream import get_webrtc_manager
            manager = get_webrtc_manager(camera)
            await manager.close_all_connections()
            logger.info(f"Closed all WebRTC connections for camera {camera_id}")
    except Exception as e:
        logger.error(f"Error closing WebRTC connections: {str(e)}")
    
    logger.info("Shutdown complete")

@app.get("/api/health")
async def health_check():
    """Basic health check endpoint"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "cameras": {camera_id: camera.get_stats() for camera_id, camera in Camera.get_all_instances().items()},
        "version": "2.0.0"
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)