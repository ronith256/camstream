from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
from datetime import datetime, timedelta
from app.media.storage import get_cameras_with_media_async, get_media_by_date, get_media_by_date_async, get_media_info, get_cameras_with_media, get_media_info_async

media_router = APIRouter()

class MediaItem(BaseModel):
    id: str
    filename: str
    camera_id: str
    type: str  # "photo" or "video"
    date: str
    thumbnail: str
    url: str
    metadata: Dict[str, Any] = {}

class MediaGroup(BaseModel):
    date: str
    camera_id: str
    items: List[MediaItem]
    count: int

class CameraWithMedia(BaseModel):
    camera_id: str
    name: str
    total_items: int
    date_count: int

@media_router.get("/cameras", response_model=List[CameraWithMedia])
async def list_cameras_with_media():
    """Get a list of cameras that have media files"""
    try:
        cameras = await get_cameras_with_media_async()
        return cameras
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@media_router.get("/list", response_model=List[MediaGroup])
async def list_media(
    days: Optional[int] = Query(7, description="Number of days to fetch"),
    camera_id: Optional[str] = Query(None, description="Camera ID to filter by")
):
    """Get media items grouped by date"""
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Get media items
        media_groups = await get_media_by_date_async(start_date, end_date, camera_id)
        
        return media_groups
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@media_router.get("/item/{item_id}", response_model=MediaItem)
async def get_media_item(
    item_id: str,
    camera_id: Optional[str] = Query(None, description="Camera ID to filter by")
):
    """Get details for a specific media item"""
    try:
        media_item = await get_media_info_async(item_id, camera_id)
        if not media_item:
            raise HTTPException(status_code=404, detail="Media item not found")
        
        return media_item
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))