import os
import sys
import re
import subprocess
import json
from typing import List, Dict, Any

import cv2
from pydantic_settings import BaseSettings

def detect_cameras_linux() -> Dict[str, Dict[str, Any]]:
    """
    Detect cameras on Linux by enumerating /dev/video* devices.
    Optionally gathers extra capabilities via the native 'v4l2-ctl' utility.
    """
    cameras = {}
    try:
        video_devices = [dev for dev in os.listdir('/dev') if re.match(r'video\d+', dev)]
    except Exception as e:
        video_devices = []
        print(f"Error listing /dev devices: {e}")

    for dev in video_devices:
        device_path = os.path.join('/dev', dev)
        camera_info: Dict[str, Any] = {"device": device_path, "name": dev}
        
        # Attempt to retrieve detailed info using v4l2-ctl (if installed)
        try:
            output = subprocess.check_output(
                ['v4l2-ctl', '--all', '-d', device_path],
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )
            camera_info["v4l2_info"] = output.strip()
        except Exception as e:
            camera_info["v4l2_info"] = f"v4l2-ctl not available or error occurred: {e}"
        
        # Open the device with OpenCV to get current resolution and frame rate
        cap = cv2.VideoCapture(device_path)
        if cap.isOpened():
            camera_info["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            camera_info["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            camera_info["fps"] = int(cap.get(cv2.CAP_PROP_FPS))
            cap.release()
        else:
            camera_info["error"] = "Unable to open camera with OpenCV"
        
        cameras[dev] = camera_info
    return cameras

def detect_cameras_windows_fast() -> Dict[str, Dict[str, Any]]:
    """
    Quickly detect cameras on Windows using caching to avoid the delay
    caused by repeatedly opening VideoCapture devices.
    """
    cache_path = os.path.join(os.path.dirname(__file__), "camera_cache.json")
    # Attempt to load from cache
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                cameras = json.load(f)
                return cameras
        except Exception as e:
            print(f"Error reading camera cache: {e}")
    
    # If no valid cache, do a quick detection (probe only index 0 and 1)
    cameras = {}
    for index in range(2):  # Adjust the range as needed
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if cap.isOpened():
            cameras[f"camera{index + 1}"] = {
                "index": index,
                "name": f"Camera {index + 1}",
                "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                "fps": int(cap.get(cv2.CAP_PROP_FPS))
            }
            cap.release()
    # Write the detected info to cache for faster startup next time
    try:
        with open(cache_path, "w") as f:
            json.dump(cameras, f)
    except Exception as err:
        print(f"Error writing camera cache: {err}")
    return cameras

def detect_cameras() -> Dict[str, Dict[str, Any]]:
    """
    Detect available cameras and their capabilities using OS-specific methods.
    For Windows we use a fast detection method.
    """
    if sys.platform.startswith("linux"):
        return detect_cameras_linux()
    elif sys.platform.startswith("win"):
        return detect_cameras_windows_fast()
    else:
        raise NotImplementedError("Camera detection not implemented for this OS.")

class Settings(BaseSettings):
    # API Configuration
    API_V1_STR: str = "/v1"
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"]  # In production, specify exact origins
    
    # Media storage
    MEDIA_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../media"))
    
    # Default camera settings (for backwards compatibility)
    FRAME_WIDTH: int = 640
    FRAME_HEIGHT: int = 480
    FPS: int = 30
    CAMERA_INDEX: int = 0  # Default camera index (usually the first connected camera)
    
    # Multiple camera settings
    DEFAULT_CAMERA_ID: str = "camera1"
    CAMERAS: Dict[str, Dict[str, Any]] = detect_cameras()  # Auto-detect cameras based on OS
    
    # Streaming settings
    JPEG_QUALITY: int = 70  # Balance between quality and performance
    MAX_CLIENTS: int = 5
    
    class Config:
        env_file = ".env"

settings = Settings()
