# backend/app/camera/camera.py
import cv2
import threading
import asyncio
import time
from typing import Optional, Tuple, List, Dict
import numpy as np
import logging
from app.config.settings import settings

logger = logging.getLogger(__name__)

class Camera:
    _instance = None
    _lock = threading.Lock()
    
    @classmethod
    def get_instance(cls):
        """Singleton pattern to ensure only one camera instance exists"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance
    
    def __init__(self, camera_index: int = settings.CAMERA_INDEX):
        """Initialize the camera - should only be called once through the singleton pattern"""
        self.camera_index = camera_index
        self.width = settings.FRAME_WIDTH
        self.height = settings.FRAME_HEIGHT
        self.fps = settings.FPS
        
        self.cap = None
        self.recording = False
        self.video_writer = None
        self.video_path = None
        
        # Frame cache for async access - use a double buffer approach
        self._frame_buffer = None  # Current frame buffer
        self._frame_buffer_next = None  # Next frame buffer
        self._frame_lock = threading.RLock()  # Use RLock to prevent deadlocks
        self._frame_ready = threading.Event()
        
        # Background thread for frame capture
        self._running = False
        self._capture_thread = None
        
        # Client tracking for shared access
        self._clients = set()
        
        # Stats for monitoring
        self._frame_count = 0
        self._error_count = 0
        self._last_fps_calc = time.time()
        self._current_fps = 0
        
        # Operations in progress flag
        self._operation_in_progress = False
        
        # Initialize camera
        self.initialize()
        self._start_background_capture()
    
    def initialize(self):
        """Initialize the camera"""
        logger.info(f"Initializing camera with index {self.camera_index}")
        try:
            self.cap = cv2.VideoCapture(self.camera_index)
            
            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            
            # Read actual properties (may differ from requested)
            self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.fps = int(self.cap.get(cv2.CAP_PROP_FPS))
            
            logger.info(f"Camera initialized: {self.width}x{self.height} @ {self.fps}fps")
        except Exception as e:
            logger.error(f"Failed to initialize camera: {str(e)}")
            raise
    
    def register_client(self, client_id):
        """Register a new client that will use the camera"""
        self._clients.add(client_id)
        logger.info(f"Client {client_id} registered. Total clients: {len(self._clients)}")
    
    def unregister_client(self, client_id):
        """Unregister a client that was using the camera"""
        if client_id in self._clients:
            self._clients.remove(client_id)
            logger.info(f"Client {client_id} unregistered. Total clients: {len(self._clients)}")
    
    def is_active(self) -> bool:
        """Check if camera is active and working"""
        return self.cap is not None and self.cap.isOpened()
    
    def is_recording(self) -> bool:
        """Check if currently recording"""
        return self.recording
    
    def is_operation_in_progress(self) -> bool:
        """Check if an operation (like starting/stopping recording) is in progress"""
        return self._operation_in_progress
    
    def _start_background_capture(self):
        """Start background thread for frame capture"""
        if self._capture_thread is not None and self._running:
            return
            
        self._running = True
        self._capture_thread = threading.Thread(target=self._capture_frames, daemon=True)
        self._capture_thread.start()
        logger.info("Background frame capture thread started")
    
    def _capture_frames(self):
        """Background thread for continuous frame capture"""
        self._frame_count = 0
        capture_start = time.time()
        
        while self._running and self.is_active():
            try:
                ret, frame = self.cap.read()
                
                if ret:
                    # Use double buffer approach to avoid frame tearing
                    with self._frame_lock:
                        # Rotate buffers
                        self._frame_buffer_next = frame.copy()
                        # Atomic swap of buffers
                        self._frame_buffer, self._frame_buffer_next = self._frame_buffer_next, self._frame_buffer
                        self._frame_ready.set()
                    
                    # Record frame if recording - do this after updating the shared buffer
                    if self.recording and self.video_writer:
                        try:
                            # Use a copy to avoid interfering with the buffer
                            self.video_writer.write(frame.copy())
                        except Exception as e:
                            logger.error(f"Error writing video frame: {str(e)}")
                    
                    # Update stats
                    self._frame_count += 1
                    now = time.time()
                    if now - self._last_fps_calc >= 1.0:  # Calculate FPS every second
                        duration = now - self._last_fps_calc
                        self._current_fps = self._frame_count / duration
                        self._frame_count = 0
                        self._last_fps_calc = now
                    
                    # Control frame rate to prevent excessive CPU usage
                    # Use a more precise sleep calculation
                    elapsed = time.time() - capture_start
                    target_time = 1.0 / self.fps
                    sleep_time = max(0, target_time - elapsed)
                    if sleep_time > 0:
                        time.sleep(sleep_time)
                    capture_start = time.time()
                else:
                    # Try to reinitialize camera on failure
                    logger.warning("Failed to capture frame, attempting to reinitialize camera")
                    self._error_count += 1
                    self.initialize()
                    time.sleep(0.5)  # Wait before retry
            except Exception as e:
                logger.error(f"Error in frame capture thread: {str(e)}")
                self._error_count += 1
                time.sleep(0.5)  # Wait before retry
    
    async def capture_frame_async(self) -> np.ndarray:
        """Asynchronously capture a single frame"""
        if not self.is_active():
            self.initialize()
            self._start_background_capture()
        
        # Wait for a frame to be available
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._frame_ready.wait)
        
        # Use a shorter lock period and copy the frame quickly
        with self._frame_lock:
            if self._frame_buffer is None:
                raise Exception("Failed to capture frame")
            frame = self._frame_buffer.copy()
            self._frame_ready.clear()
        
        return frame
    
    def capture_frame(self) -> np.ndarray:
        """Synchronously capture a single frame (for backwards compatibility)"""
        if not self.is_active():
            self.initialize()
            self._start_background_capture()
        
        # First try to get the cached frame - this is much faster
        with self._frame_lock:
            if self._frame_buffer is not None:
                return self._frame_buffer.copy()
        
        # If no cached frame, capture one directly as fallback
        ret, frame = self.cap.read()
        if not ret:
            raise Exception("Failed to capture frame")
        return frame
    
    def start_recording(self, output_path: str):
        """Synchronously start video recording (for backwards compatibility)"""
        if self.recording:
            return
        
        try:
            self._operation_in_progress = True
            
            # Define codec and create VideoWriter
            # Use H.264 codec which is browser compatible
            fourcc = cv2.VideoWriter_fourcc(*'avc1')  # H.264
            self.video_writer = cv2.VideoWriter(
                output_path, fourcc, self.fps, (self.width, self.height)
            )
            
            self.recording = True
            self.video_path = output_path
            logger.info(f"Started recording to {output_path}")
        finally:
            self._operation_in_progress = False
        
    async def start_recording_async(self, output_path: str):
        """Asynchronously start video recording"""
        if self.recording:
            return
        
        try:
            self._operation_in_progress = True
            
            # Use a short-lived executor to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: self.start_recording(output_path))
            
            logger.info(f"Started recording asynchronously to {output_path}")
        finally:
            self._operation_in_progress = False

    async def stop_recording_async(self) -> str:
        """Asynchronously stop video recording"""
        if not self.recording:
            return None
        
        try:
            self._operation_in_progress = True
            
            # Signal that recording should stop
            self.recording = False
            
            if self.video_writer:
                # Use executor to avoid blocking the event loop during file operations
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self.video_writer.release)
                self.video_writer = None
            
            video_path = self.video_path
            self.video_path = None
            
            logger.info(f"Stopped recording to {video_path}")
            return video_path
        finally:
            self._operation_in_progress = False
    
    def stop_recording(self) -> str:
        """Synchronously stop video recording (for backwards compatibility)"""
        if not self.recording:
            return None
        
        try:
            self._operation_in_progress = True
            
            self.recording = False
            
            if self.video_writer:
                self.video_writer.release()
                self.video_writer = None
            
            video_path = self.video_path
            self.video_path = None
            
            logger.info(f"Stopped recording to {video_path}")
            return video_path
        finally:
            self._operation_in_progress = False
    
    def get_stats(self) -> Dict:
        """Get camera statistics"""
        return {
            "active": self.is_active(),
            "recording": self.recording,
            "resolution": f"{self.width}x{self.height}",
            "fps_target": self.fps,
            "fps_actual": round(self._current_fps, 2),
            "clients": len(self._clients),
            "errors": self._error_count,
            "operation_in_progress": self._operation_in_progress
        }
    
    def release(self):
        """Release camera resources"""
        logger.info("Releasing camera resources")
        self._running = False
        
        if self._capture_thread:
            self._capture_thread.join(timeout=1.0)
            self._capture_thread = None
        
        if self.recording:
            self.stop_recording()
            
        if self.cap is not None:
            self.cap.release()
            self.cap = None


# Function to get the camera singleton instance
def get_camera():
    camera = Camera.get_instance()
    try:
        yield camera
    finally:
        pass  # Don't release here, we're using a singleton