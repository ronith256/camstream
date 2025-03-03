# backend/app/media/thumbs.py
import cv2
import numpy as np
import asyncio

async def create_thumbnail_async(image: np.ndarray, output_path: str, max_size: int = 256) -> None:
    """Create a thumbnail from an image asynchronously"""
    # Get original dimensions
    height, width = image.shape[:2]
    
    # Calculate new dimensions
    if width > height:
        new_width = max_size
        new_height = int(height * (max_size / width))
    else:
        new_height = max_size
        new_width = int(width * (max_size / height))
    
    # Use run_in_executor to perform the resize and save operations
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: save_thumbnail(image, output_path, new_width, new_height)
    )

def save_thumbnail(image: np.ndarray, output_path: str, width: int, height: int) -> None:
    """Helper function to resize and save a thumbnail (used within run_in_executor)"""
    # Resize image
    thumbnail = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    
    # Save thumbnail
    cv2.imwrite(output_path, thumbnail)

# For backwards compatibility
def create_thumbnail(image: np.ndarray, output_path: str, max_size: int = 256) -> None:
    """Synchronous version of create_thumbnail_async for backwards compatibility"""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(create_thumbnail_async(image, output_path, max_size))
    finally:
        loop.close()