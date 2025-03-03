from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
from datetime import datetime, timedelta
from app.media.storage import get_media_by_date, get_media_info

media_router = APIRouter()

class MediaItem(BaseModel):
    id: str
    filename: str
    type: str  # "photo" or "video"
    date: str
    thumbnail: str
    url: str
    metadata: Dict[str, Any] = {}

class MediaGroup(BaseModel):
    date: str
    items: List[MediaItem]
    count: int

@media_router.get("/list", response_model=List[MediaGroup])
def list_media(days: Optional[int] = Query(7, description="Number of days to fetch")):
    """Get media items grouped by date"""
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Get media items
        media_groups = get_media_by_date(start_date, end_date)
        
        return media_groups
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@media_router.get("/item/{item_id}", response_model=MediaItem)
def get_media_item(item_id: str):
    """Get details for a specific media item"""
    try:
        media_item = get_media_info(item_id)
        if not media_item:
            raise HTTPException(status_code=404, detail="Media item not found")
        
        return media_item
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
