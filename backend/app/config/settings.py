from pydantic_settings import BaseSettings
import os
from typing import List, Dict, Any

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
    CAMERA_INDEX: int = 0  # Default camera (usually the first connected camera)
    
    # Multiple camera settings
    DEFAULT_CAMERA_ID: str = "camera1"
    CAMERAS: Dict[str, Dict[str, Any]] = {
        "camera1": {
            "index": 0,
            "name": "Main Camera",
            "width": 640,
            "height": 480,
            "fps": 30
        }
    }
    
    # Streaming settings
    JPEG_QUALITY: int = 70  # Balance between quality and performance
    MAX_CLIENTS: int = 5
    
    class Config:
        env_file = ".env"

settings = Settings()