import os
import cv2
import numpy as np
import json
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import uuid
import shutil
from app.config.settings import settings
from app.media.thumbs import create_thumbnail_async

def get_media_dir_for_date(date: datetime, camera_id: str = None) -> str:
    """Get the media directory for a specific date and camera"""
    date_str = date.strftime("%Y-%m-%d")
    
    # If camera_id is specified, include it in the path
    if camera_id:
        media_path = os.path.join(settings.MEDIA_DIR, camera_id, date_str)
    else:
        media_path = os.path.join(settings.MEDIA_DIR, settings.DEFAULT_CAMERA_ID, date_str)
        
    os.makedirs(media_path, exist_ok=True)
    return media_path

async def save_photo_async(frame: np.ndarray, filename: str, camera_id: str = None) -> str:
    """Save a photo frame to disk and create thumbnail asynchronously"""
    # Create directory for today
    date_dir = get_media_dir_for_date(datetime.now(), camera_id)
    
    # Save full image (use run_in_executor to avoid blocking)
    filepath = os.path.join(date_dir, filename)
    loop = asyncio.get_event_loop()
    
    # Save image in a non-blocking way
    await loop.run_in_executor(
        None, 
        lambda: cv2.imwrite(filepath, frame)
    )
    
    # Create and save thumbnail asynchronously
    thumb_filename = f"thumb_{filename}"
    thumb_path = os.path.join(date_dir, thumb_filename)
    await create_thumbnail_async(frame, thumb_path)
    
    # Create metadata
    media_id = str(uuid.uuid4())
    metadata = {
        "id": media_id,
        "filename": filename,
        "camera_id": camera_id or settings.DEFAULT_CAMERA_ID,
        "type": "photo",
        "created_at": datetime.now().isoformat(),
        "size": os.path.getsize(filepath),
        "resolution": {
            "width": frame.shape[1],
            "height": frame.shape[0]
        }
    }
    
    # Save metadata (use run_in_executor for file operations)
    meta_path = os.path.join(date_dir, f"{media_id}.json")
    await loop.run_in_executor(
        None,
        lambda: write_json(meta_path, metadata)
    )
    
    return filepath

def write_json(path, data):
    """Helper function to write JSON data to a file"""
    with open(path, 'w') as f:
        json.dump(data, f)

async def start_video_recording_async(camera, filename: str, camera_id: str = None) -> str:
    """Start recording video asynchronously"""
    # Create directory for today
    date_dir = get_media_dir_for_date(datetime.now(), camera_id)
    
    # Full path for video
    filepath = os.path.join(date_dir, filename)
    
    # Start recording asynchronously
    await camera.start_recording_async(filepath)
    
    return filepath

async def stop_video_recording_async(camera, camera_id: str = None) -> str:
    """Stop recording video and save metadata asynchronously"""
    # Stop the recording asynchronously
    filepath = await camera.stop_recording_async()
    
    if not filepath or not os.path.exists(filepath):
        raise Exception("Video file not found")
    
    # Get directory and filename
    date_dir = os.path.dirname(filepath)
    filename = os.path.basename(filepath)
    
    # Create thumbnail from the video
    thumb_filename = f"thumb_{filename.replace('.mp4', '.jpg')}"
    thumb_path = os.path.join(date_dir, thumb_filename)
    
    loop = asyncio.get_event_loop()
    
    # Extract a frame for the thumbnail
    frame = await extract_video_frame_async(filepath)
    if frame is not None:
        await create_thumbnail_async(frame, thumb_path)
    
    # Get video properties asynchronously
    video_info = await get_video_info_async(filepath)
    
    # Create metadata
    media_id = str(uuid.uuid4())
    metadata = {
        "id": media_id,
        "filename": filename,
        "camera_id": camera_id or settings.DEFAULT_CAMERA_ID,
        "type": "video",
        "created_at": datetime.now().isoformat(),
        "size": os.path.getsize(filepath),
        "resolution": {
            "width": video_info["width"],
            "height": video_info["height"]
        },
        "duration": video_info["duration"],
        "fps": video_info["fps"]
    }
    
    # Save metadata
    meta_path = os.path.join(date_dir, f"{media_id}.json")
    await loop.run_in_executor(
        None,
        lambda: write_json(meta_path, metadata)
    )
    
    return filepath

async def extract_video_frame_async(video_path: str) -> Optional[np.ndarray]:
    """Extract a frame from a video file asynchronously"""
    loop = asyncio.get_event_loop()
    
    def _extract_frame():
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        cap.release()
        if ret:
            return frame
        return None
    
    return await loop.run_in_executor(None, _extract_frame)

async def get_video_info_async(video_path: str) -> Dict[str, Any]:
    """Get video properties asynchronously"""
    loop = asyncio.get_event_loop()
    
    def _get_video_info():
        cap = cv2.VideoCapture(video_path)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        cap.release()
        
        return {
            "width": width,
            "height": height,
            "fps": fps,
            "duration": duration
        }
    
    return await loop.run_in_executor(None, _get_video_info)

async def get_media_by_date_async(start_date: datetime, end_date: datetime, camera_id: str = None) -> List[Dict[str, Any]]:
    """Get media items grouped by date asynchronously"""
    result = []
    loop = asyncio.get_event_loop()
    
    # Get list of camera directories to search
    camera_dirs = []
    if camera_id:
        # Specific camera requested
        camera_path = os.path.join(settings.MEDIA_DIR, camera_id)
        if os.path.exists(camera_path):
            camera_dirs.append((camera_id, camera_path))
    else:
        # Search all camera directories
        try:
            for cam_id in os.listdir(settings.MEDIA_DIR):
                cam_path = os.path.join(settings.MEDIA_DIR, cam_id)
                if os.path.isdir(cam_path):
                    camera_dirs.append((cam_id, cam_path))
        except FileNotFoundError:
            # Media directory doesn't exist yet
            pass
    
    # Function to process a single date directory for a specific camera
    async def process_date_dir(cam_id, date_str):
        date_dir = os.path.join(settings.MEDIA_DIR, cam_id, date_str)
        
        # Skip if directory doesn't exist
        if not os.path.exists(date_dir):
            return None
        
        # Get all JSON metadata files
        meta_files = await loop.run_in_executor(
            None,
            lambda: [f for f in os.listdir(date_dir) if f.endswith('.json')]
        )
        
        items = []
        for meta_file in meta_files:
            meta_path = os.path.join(date_dir, meta_file)
            try:
                metadata = await loop.run_in_executor(
                    None,
                    lambda: json.load(open(meta_path, 'r'))
                )
                
                # Create media item
                filename = metadata['filename']
                thumb_filename = f"thumb_{filename}"
                if metadata['type'] == 'video' and thumb_filename.endswith('.mp4'):
                    thumb_filename = thumb_filename.replace('.mp4', '.jpg')
                
                item = {
                    "id": metadata['id'],
                    "filename": filename,
                    "camera_id": metadata.get('camera_id', cam_id),
                    "type": metadata['type'],
                    "date": date_str,
                    "thumbnail": f"/media/{cam_id}/{date_str}/{thumb_filename}",
                    "url": f"/media/{cam_id}/{date_str}/{filename}",
                    "metadata": metadata
                }
                items.append(item)
            except Exception as e:
                print(f"Error reading metadata {meta_file}: {str(e)}")
        
        # Return date group if items exist
        if items:
            return {
                "date": date_str,
                "camera_id": cam_id,
                "items": items,
                "count": len(items)
            }
        return None
    
    # Process all dates in the range for each camera concurrently
    for cam_id, cam_path in camera_dirs:
        tasks = []
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            tasks.append(process_date_dir(cam_id, date_str))
            current_date += timedelta(days=1)
        
        # Wait for all tasks to complete for this camera
        date_results = await asyncio.gather(*tasks)
        
        # Filter out None results and add to result list
        cam_results = [r for r in date_results if r is not None]
        result.extend(cam_results)
    
    return result

async def get_media_info_async(media_id: str, camera_id: str = None) -> Optional[Dict[str, Any]]:
    """Get a specific media item by ID asynchronously"""
    loop = asyncio.get_event_loop()
    
    # Get list of camera directories to search
    camera_dirs = []
    if camera_id:
        # Specific camera requested
        camera_path = os.path.join(settings.MEDIA_DIR, camera_id)
        if os.path.exists(camera_path):
            camera_dirs.append((camera_id, camera_path))
    else:
        # Search all camera directories
        try:
            for cam_id in os.listdir(settings.MEDIA_DIR):
                cam_path = os.path.join(settings.MEDIA_DIR, cam_id)
                if os.path.isdir(cam_path):
                    camera_dirs.append((cam_id, cam_path))
        except FileNotFoundError:
            # Media directory doesn't exist yet
            pass
    
    # Search for the media ID in all camera directories
    for cam_id, cam_path in camera_dirs:
        try:
            # Get all date directories for this camera
            date_dirs = await loop.run_in_executor(
                None,
                lambda: [d for d in os.listdir(cam_path) 
                        if os.path.isdir(os.path.join(cam_path, d))]
            )
            
            for date_dir in date_dirs:
                date_path = os.path.join(cam_path, date_dir)
                
                # Check if metadata exists
                meta_path = os.path.join(date_path, f"{media_id}.json")
                exists = await loop.run_in_executor(None, os.path.exists, meta_path)
                
                if exists:
                    try:
                        metadata = await loop.run_in_executor(
                            None,
                            lambda: json.load(open(meta_path, 'r'))
                        )
                        
                        # Create media item
                        filename = metadata['filename']
                        thumb_filename = f"thumb_{filename}"
                        if metadata['type'] == 'video' and thumb_filename.endswith('.mp4'):
                            thumb_filename = thumb_filename.replace('.mp4', '.jpg')
                        
                        return {
                            "id": metadata['id'],
                            "filename": filename,
                            "camera_id": metadata.get('camera_id', cam_id),
                            "type": metadata['type'],
                            "date": date_dir,
                            "thumbnail": f"/media/{cam_id}/{date_dir}/{thumb_filename}",
                            "url": f"/media/{cam_id}/{date_dir}/{filename}",
                            "metadata": metadata
                        }
                    except Exception:
                        pass
        except FileNotFoundError:
            # This camera directory doesn't exist yet
            continue
    
    return None

async def get_cameras_with_media_async() -> List[Dict[str, Any]]:
    """Get a list of cameras that have media files"""
    loop = asyncio.get_event_loop()
    result = []
    
    try:
        # Check if media directory exists
        if not os.path.exists(settings.MEDIA_DIR):
            return []
            
        # List all potential camera directories
        camera_dirs = await loop.run_in_executor(
            None,
            lambda: [d for d in os.listdir(settings.MEDIA_DIR) 
                    if os.path.isdir(os.path.join(settings.MEDIA_DIR, d))]
        )
        
        for cam_id in camera_dirs:
            cam_path = os.path.join(settings.MEDIA_DIR, cam_id)
            
            # Check if this directory has any date subdirectories with media
            date_dirs = await loop.run_in_executor(
                None,
                lambda: [d for d in os.listdir(cam_path) 
                        if os.path.isdir(os.path.join(cam_path, d))]
            )
            
            # Find camera config if available
            camera_name = cam_id
            if cam_id in settings.CAMERAS:
                camera_name = settings.CAMERAS[cam_id].get("name", camera_name)
            
            # Count total media items
            total_items = 0
            for date_dir in date_dirs:
                date_path = os.path.join(cam_path, date_dir)
                json_files = await loop.run_in_executor(
                    None,
                    lambda: [f for f in os.listdir(date_path) if f.endswith('.json')]
                )
                total_items += len(json_files)
            
            if total_items > 0:
                result.append({
                    "camera_id": cam_id,
                    "name": camera_name,
                    "total_items": total_items,
                    "date_count": len(date_dirs)
                })
        
    except Exception as e:
        print(f"Error getting cameras with media: {str(e)}")
    
    return result

# Synchronous versions for backwards compatibility
def get_cameras_with_media() -> List[Dict[str, Any]]:
    """Synchronous version of get_cameras_with_media_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(get_cameras_with_media_async())
    finally:
        loop.close()

# Provide backwards compatibility for the old functions
def save_photo(frame: np.ndarray, filename: str, camera_id: str = None) -> str:
    """Synchronous version of save_photo_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(save_photo_async(frame, filename, camera_id))
    finally:
        loop.close()

def start_video_recording(camera, filename: str, camera_id: str = None) -> str:
    """Synchronous version of start_video_recording_async for backwards compatibility"""
    # Use the synchronous method from the camera class
    camera.start_recording(os.path.join(get_media_dir_for_date(datetime.now(), camera_id), filename))
    return os.path.join(get_media_dir_for_date(datetime.now(), camera_id), filename)

def stop_video_recording(camera, camera_id: str = None) -> str:
    """Synchronous version of stop_video_recording_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(stop_video_recording_async(camera, camera_id))
    finally:
        loop.close()

def get_media_by_date(start_date: datetime, end_date: datetime, camera_id: str = None) -> List[Dict[str, Any]]:
    """Synchronous version of get_media_by_date_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(get_media_by_date_async(start_date, end_date, camera_id))
    finally:
        loop.close()

def get_media_info(media_id: str, camera_id: str = None) -> Optional[Dict[str, Any]]:
    """Synchronous version of get_media_info_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(get_media_info_async(media_id, camera_id))
    finally:
        loop.close()