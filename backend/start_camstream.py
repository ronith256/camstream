#!/usr/bin/env python
"""
CamStream Startup Helper

This script helps to start the CamStream application with different configurations
for handling multiple cameras. It's especially useful for Raspberry Pi and other
edge devices.
"""

import argparse
import os
import sys
import subprocess
import logging
import uvicorn
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('camstream_start.log')
    ]
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="CamStream Startup Helper")
    
    # Add command line arguments
    parser.add_argument(
        "--host", 
        default="0.0.0.0", 
        help="IP address to bind the server to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=8000, 
        help="Port to run the server on (default: 8000)"
    )
    parser.add_argument(
        "--cameras", 
        help="Comma-separated list of camera IDs to enable (e.g. camera1,camera2)"
    )
    parser.add_argument(
        "--batch-size", 
        type=int, 
        default=1, 
        help="Number of cameras to initialize in parallel (default: 1)"
    )
    parser.add_argument(
        "--dev-mode", 
        action="store_true", 
        help="Enable development mode with dummy camera if no real cameras detected"
    )
    parser.add_argument(
        "--list-cameras",
        action="store_true",
        help="List available cameras and exit"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    
    args = parser.parse_args()
    
    # Set environment variables based on arguments
    if args.cameras:
        os.environ["ENABLED_CAMERAS"] = args.cameras
    
    os.environ["CAMERA_INIT_BATCH_SIZE"] = str(args.batch_size)
    
    if args.dev_mode:
        os.environ["CAMSTREAM_DEV"] = "1"
    
    # Set log level
    if args.debug:
        os.environ["LOG_LEVEL"] = "DEBUG"

    # Check if we should just list cameras and exit
    if args.list_cameras:
        try:
            from app.config.settings import settings
            cameras = settings.force_camera_detection()
            print("\nDetected cameras:")
            print("----------------")
            if not cameras:
                print("No cameras detected.")
            for camera_id, camera_info in cameras.items():
                print(f"Camera ID: {camera_id}")
                print(f"  Name:       {camera_info.get('name', 'Unknown')}")
                print(f"  Index:      {camera_info.get('index', 'Unknown')}")
                print(f"  Resolution: {camera_info.get('width', '?')}x{camera_info.get('height', '?')}")
                print(f"  FPS:        {camera_info.get('fps', 'Unknown')}")
                print()
        except Exception as e:
            logger.error(f"Error listing cameras: {e}")
            sys.exit(1)
        sys.exit(0)
    
    # Start the application
    logger.info("Starting CamStream application")
    logger.info(f"Host: {args.host}, Port: {args.port}")
    if args.cameras:
        logger.info(f"Enabled cameras: {args.cameras}")
    logger.info(f"Camera init batch size: {args.batch_size}")
    
    # Start with Uvicorn
    try:
        uvicorn.run("app.main:app", host=args.host, port=args.port, log_level="info")
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
    except Exception as e:
        logger.error(f"Error starting application: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()