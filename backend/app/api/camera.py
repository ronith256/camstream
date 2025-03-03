from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Dict, Any
import os
from datetime import datetime
import asyncio
from app.camera.camera import Camera, get_camera
from app.media.storage import save_photo_async, start_video_recording_async, stop_video_recording_async

camera_router = APIRouter()

class CameraStatus(BaseModel):
    status: str
    recording: bool
    resolution: Dict[str, int]

@camera_router.get("/status")
async def get_camera_status(camera: Camera = Depends(get_camera)) -> CameraStatus:
    """Get current camera status"""
    return CameraStatus(
        status="active" if camera.is_active() else "inactive",
        recording=camera.is_recording(),
        resolution={"width": camera.width, "height": camera.height}
    )

@camera_router.post("/photo")
async def take_photo(camera: Camera = Depends(get_camera)):
    """Take a photo and save it asynchronously"""
    try:
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"photo_{timestamp}.jpg"
        
        # Capture frame and save to file asynchronously
        frame = await camera.capture_frame_async()
        filepath = await save_photo_async(frame, filename)
        
        return {"success": True, "filename": filename, "path": filepath}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@camera_router.post("/video/start")
async def start_recording(camera: Camera = Depends(get_camera)):
    """Start video recording asynchronously"""
    if camera.is_recording():
        raise HTTPException(status_code=400, detail="Already recording")
    
    try:
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"video_{timestamp}.mp4"
        
        # Start recording asynchronously
        filepath = await start_video_recording_async(camera, filename)
        
        return {"success": True, "filename": filename, "path": filepath}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@camera_router.post("/video/stop")
async def stop_recording(camera: Camera = Depends(get_camera)):
    """Stop video recording asynchronously"""
    if not camera.is_recording():
        raise HTTPException(status_code=400, detail="Not currently recording")
    
    try:
        # Stop recording asynchronously
        filepath = await stop_video_recording_async(camera)
        
        return {"success": True, "path": filepath}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))