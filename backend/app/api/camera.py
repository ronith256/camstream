from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import os
import logging
from datetime import datetime
import asyncio
from app.camera.camera import Camera, get_camera, get_available_cameras
from app.media.storage import save_photo_async, start_video_recording_async, stop_video_recording_async

logger = logging.getLogger(__name__)
camera_router = APIRouter()

class CameraStatus(BaseModel):
    camera_id: str
    name: str
    status: str
    recording: bool
    resolution: Dict[str, int]

class CameraInfo(BaseModel):
    id: str
    name: str
    index: int
    resolution: Dict[str, int]
    fps: int

@camera_router.get("/list", response_model=List[CameraInfo])
async def get_camera_list():
    """Get a list of all available cameras"""
    cameras = get_available_cameras()
    return cameras

@camera_router.get("/status")
async def get_camera_status(camera_id: Optional[str] = None, camera: Camera = Depends(get_camera)) -> CameraStatus:
    """Get current camera status"""
    return CameraStatus(
        camera_id=camera.camera_id,
        name=camera.name,
        status="active" if camera.is_active() else "inactive",
        recording=camera.is_recording(),
        resolution={"width": camera.width, "height": camera.height}
    )

@camera_router.post("/photo")
async def take_photo(
    camera_id: Optional[str] = Query(None, description="Camera ID to use"),
    camera: Camera = Depends(get_camera)
):
    """Take a photo and save it asynchronously"""
    try:
        # Ensure camera is initialized
        if not camera.is_active():
            await camera.initialize_async()
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"photo_{timestamp}.jpg"
        
        # Capture frame and save to file asynchronously
        frame = await camera.capture_frame_async()
        filepath = await save_photo_async(frame, filename, camera_id=camera.camera_id)
        
        return {
            "success": True, 
            "filename": filename, 
            "path": filepath,
            "camera_id": camera.camera_id,
            "camera_name": camera.name
        }
    except Exception as e:
        logger.error(f"Error taking photo with camera {camera.camera_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@camera_router.post("/video/start")
async def start_recording(
    camera_id: Optional[str] = Query(None, description="Camera ID to use"),
    camera: Camera = Depends(get_camera)
):
    """Start video recording asynchronously"""
    if camera.is_recording():
        raise HTTPException(status_code=400, detail="Already recording")
    
    try:
        # Ensure camera is initialized
        if not camera.is_active():
            await camera.initialize_async()
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"video_{timestamp}.mp4"
        
        # Start recording asynchronously
        filepath = await start_video_recording_async(camera, filename, camera_id=camera.camera_id)
        
        return {
            "success": True, 
            "filename": filename, 
            "path": filepath,
            "camera_id": camera.camera_id,
            "camera_name": camera.name
        }
    except Exception as e:
        logger.error(f"Error starting recording with camera {camera.camera_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@camera_router.post("/video/stop")
async def stop_recording(
    camera_id: Optional[str] = Query(None, description="Camera ID to use"),
    camera: Camera = Depends(get_camera)
):
    """Stop video recording asynchronously"""
    if not camera.is_recording():
        raise HTTPException(status_code=400, detail="Not currently recording")
    
    try:
        # Stop recording asynchronously
        filepath = await stop_video_recording_async(camera, camera_id=camera.camera_id)
        
        return {
            "success": True, 
            "path": filepath,
            "camera_id": camera.camera_id,
            "camera_name": camera.name
        }
    except Exception as e:
        logger.error(f"Error stopping recording with camera {camera.camera_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@camera_router.get("/health", response_model=Dict[str, Any])
async def get_camera_health():
    """Get a health report for all cameras"""
    camera_health = {}
    for camera_id, camera in Camera.get_all_instances().items():
        try:
            stats = camera.get_stats()
            # Add a simple status check
            if stats['active']:
                if stats['fps_actual'] < stats['fps_target'] * 0.5:
                    stats['status'] = 'degraded'
                else:
                    stats['status'] = 'healthy'
            else:
                stats['status'] = 'error'
            
            camera_health[camera_id] = stats
        except Exception as e:
            camera_health[camera_id] = {
                'camera_id': camera_id,
                'status': 'error',
                'error': str(e)
            }
    
    return {
        "timestamp": datetime.now().isoformat(),
        "cameras": camera_health,
        "total_cameras": len(camera_health),
        "healthy_count": sum(1 for cam in camera_health.values() if cam.get('status') == 'healthy'),
        "system_load": os.getloadavg()[0] if hasattr(os, 'getloadavg') else None
    }

@camera_router.post("/reset/{camera_id}")
async def reset_camera(camera_id: str):
    """Reset a specific camera if it's having issues"""
    try:
        camera = Camera.get_instance(camera_id)
        # Stop any recording
        if camera.is_recording():
            await camera.stop_recording_async()
        
        # Release and reinitialize
        camera.release()
        await camera.initialize_async()
        
        return {
            "success": True,
            "camera_id": camera_id,
            "message": f"Camera {camera_id} reset successfully"
        }
    except Exception as e:
        logger.error(f"Failed to reset camera {camera_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset camera: {str(e)}")