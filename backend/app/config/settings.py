import os
import sys
import re
import subprocess
import json
import time
from typing import List, Dict, Any, Optional

import cv2
from pydantic_settings import BaseSettings

def detect_cameras_linux() -> Dict[str, Dict[str, Any]]:
    """
    Detect cameras on Linux by enumerating /dev/video* devices.
    Optimized with timeout handling for more reliable detection.
    """
    cameras = {}
    try:
        video_devices = [dev for dev in os.listdir('/dev') if re.match(r'video\d+', dev)]
    except Exception as e:
        video_devices = []
        print(f"Error listing /dev devices: {e}")

    for i, dev in enumerate(video_devices):
        device_path = os.path.join('/dev', dev)
        camera_info: Dict[str, Any] = {"device": device_path, "name": f"Camera {i+1}", "index": i}
        
        # Try to access the camera with timeout handling
        try:
            # Attempt to open the camera with a timeout
            cap = cv2.VideoCapture(device_path)
            
            # Set a short timeout
            start_time = time.time()
            is_opened = False
            
            # Wait for a maximum of 2 seconds for the camera to open
            while time.time() - start_time < 2.0:
                if cap.isOpened():
                    is_opened = True
                    break
                time.sleep(0.1)
            
            if is_opened:
                # Try to grab a frame to verify camera is working
                frame_grabbed = False
                start_time = time.time()
                
                while time.time() - start_time < 1.0:
                    if cap.grab():
                        frame_grabbed = True
                        break
                    time.sleep(0.1)
                
                if frame_grabbed:
                    # Get camera properties
                    camera_info["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    camera_info["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    camera_info["fps"] = int(cap.get(cv2.CAP_PROP_FPS))
                    
                    # Add camera to list
                    camera_id = f"camera{i+1}"
                    cameras[camera_id] = camera_info
                else:
                    print(f"Camera {device_path} opened but failed to grab a frame")
            else:
                print(f"Failed to open camera {device_path}")
                
            # Always release the camera
            cap.release()
        except Exception as e:
            print(f"Error accessing camera {device_path}: {e}")
        
    return cameras

def detect_cameras_windows_fast() -> Dict[str, Dict[str, Any]]:
    """
    Quickly detect cameras on Windows using caching and proper timeout handling.
    """
    # Path for the camera cache file
    cache_path = os.path.join(os.path.dirname(__file__), "camera_cache.json")
    use_cache = True  # Set to False to force fresh detection
    
    # Attempt to load from cache if exists and we're using cache
    if use_cache and os.path.exists(cache_path):
        try:
            # Check if cache is recent (less than 1 hour old)
            cache_age = time.time() - os.path.getmtime(cache_path)
            if cache_age < 3600:  # 1 hour in seconds
                with open(cache_path, "r") as f:
                    cameras = json.load(f)
                    print(f"Loaded {len(cameras)} cameras from cache")
                    return cameras
            else:
                print("Camera cache is outdated, performing fresh detection")
        except Exception as e:
            print(f"Error reading camera cache: {e}")
    
    # Perform fresh camera detection with proper timeout handling
    cameras = {}
    max_cameras = 2  # Adjust the range as needed
    
    for index in range(max_cameras):
        try:
            print(f"Attempting to detect camera at index {index}...")
            
            # For Windows, use DirectShow backend for better performance
            cap = None
            if sys.platform.startswith('win'):
                cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(index)
            
            # Set a short timeout
            start_time = time.time()
            is_opened = False
            
            # Wait for a maximum of 3 seconds for the camera to open
            while time.time() - start_time < 3.0:
                if cap and cap.isOpened():
                    is_opened = True
                    break
                time.sleep(0.1)
            
            if is_opened:
                # Try to grab a frame to verify camera is working
                frame_grabbed = False
                start_time = time.time()
                
                while time.time() - start_time < 1.0:
                    if cap.grab():
                        frame_grabbed = True
                        break
                    time.sleep(0.1)
                
                if frame_grabbed:
                    # Get camera properties
                    camera_id = f"camera{index+1}"
                    cameras[camera_id] = {
                        "index": index,
                        "name": f"Camera {index+1}",
                        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                        "fps": int(cap.get(cv2.CAP_PROP_FPS))
                    }
                    print(f"Detected camera {camera_id}")
                else:
                    print(f"Camera at index {index} opened but failed to grab a frame")
            else:
                print(f"Failed to open camera at index {index}")
                
            # Always release the camera
            if cap:
                cap.release()
                
        except Exception as err:
            print(f"Error detecting camera at index {index}: {err}")
    
    # Write the detected cameras to cache for future use
    if cameras:
        try:
            with open(cache_path, "w") as f:
                json.dump(cameras, f)
            print(f"Saved {len(cameras)} cameras to cache")
        except Exception as err:
            print(f"Error writing camera cache: {err}")
    
    return cameras

def detect_cameras() -> Dict[str, Dict[str, Any]]:
    """
    Detect available cameras and their capabilities using OS-specific methods.
    """
    print("Detecting cameras...")
    
    if sys.platform.startswith("linux"):
        return detect_cameras_linux()
    elif sys.platform.startswith("win"):
        return detect_cameras_windows_fast()
    else:
        # Fallback for other platforms
        cameras = {}
        # Basic detection for other platforms
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                cameras["camera1"] = {
                    "index": 0,
                    "name": "Camera 1",
                    "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                    "fps": int(cap.get(cv2.CAP_PROP_FPS))
                }
                cap.release()
        except Exception as e:
            print(f"Error in basic camera detection: {e}")
        
        return cameras

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
    
    # Camera control
    ENABLED_CAMERAS: List[str] = []  # Empty list means use all detected cameras
    
    # Lazy initialization for cameras - don't detect until needed
    _cameras: Optional[Dict[str, Dict[str, Any]]] = None
    
    # Streaming settings
    JPEG_QUALITY: int = 70  # Balance between quality and performance
    MAX_CLIENTS: int = 5
    
    # Startup settings
    CAMERA_INIT_BATCH_SIZE: int = 2  # Initialize cameras in batches of this size
    CAMERA_INIT_RETRY_ATTEMPTS: int = 3  # Number of times to retry camera initialization
    
    @property
    def CAMERAS(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all detected cameras, filtered if ENABLED_CAMERAS is specified.
        Lazy initialization pattern - only detect cameras when needed.
        """
        if self._cameras is None:
            # First detection
            self._cameras = detect_cameras()
            
        # If no cameras detected, create a dummy camera for development
        if not self._cameras and os.environ.get("CAMSTREAM_DEV") == "1":
            self._cameras = {
                "camera1": {
                    "index": 0,
                    "name": "Dummy Camera",
                    "width": self.FRAME_WIDTH,
                    "height": self.FRAME_HEIGHT,
                    "fps": self.FPS
                }
            }
        
        # If ENABLED_CAMERAS is specified, filter the cameras
        if self.ENABLED_CAMERAS:
            return {cam_id: self._cameras[cam_id] for cam_id in self.ENABLED_CAMERAS 
                    if cam_id in self._cameras}
        
        # Otherwise return all detected cameras
        return self._cameras or {}
    
    def force_camera_detection(self):
        """Force a fresh detection of cameras"""
        self._cameras = detect_cameras()
        return self.CAMERAS
    
    class Config:
        env_file = ".env"

settings = Settings()