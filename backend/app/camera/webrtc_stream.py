# backend/app/camera/webrtc_stream.py
import asyncio
import uuid
import json
import logging
import cv2
from fastapi import Depends
import numpy as np
import fractions
from typing import Dict, Optional, Set, Any
import time
import threading

from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    RTCConfiguration,
    RTCIceServer,
    VideoStreamTrack,
    MediaStreamTrack
)
from aiortc.contrib.media import MediaBlackhole, MediaRecorder, MediaRelay
from av import VideoFrame
from app.camera.camera import Camera, get_camera
from app.config.settings import settings

logger = logging.getLogger(__name__)

class CameraVideoStreamTrack(VideoStreamTrack):
    """
    A video stream track that captures from the camera.
    """
    kind = "video"

    def __init__(self, camera: Camera):
        super().__init__()
        self.camera = camera
        self._frame_count = 0
        self._fps = camera.fps
        self._frame_time = 1 / self._fps
        self._start_time = time.time()
        self._current_time = 0
        self._last_frame = None
        # Add frame cache and status tracking
        self._cached_frame = None
        self._cached_frame_time = 0
        self._stream_active = True
        self._error_count = 0
        self._frame_timeout = 0.5  # seconds

    async def recv(self):
        """
        Get a frame from the camera and return it.
        """
        if not self._stream_active:
            # Stream marked as inactive, return black frame
            black_frame = np.zeros((self.camera.height, self.camera.width, 3), dtype=np.uint8)
            video_frame = VideoFrame.from_ndarray(black_frame, format="rgb24")
            pts, time_base = self._frame_count, fractions.Fraction(1, self._fps)
            video_frame.pts = pts
            video_frame.time_base = time_base
            self._frame_count += 1
            return video_frame
            
        # Sleep to ensure correct frame rate
        self._current_time = time.time() - self._start_time
        next_frame_time = self._frame_count * self._frame_time
        wait_time = max(0, next_frame_time - self._current_time)
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        # Get frame from camera (using the camera's cached frame)
        try:
            # During camera operations like taking photos or recording,
            # use a cached frame to prevent disruption
            if self.camera.is_operation_in_progress() and self._cached_frame is not None:
                logger.debug("Using cached frame during camera operation")
                frame = self._cached_frame.copy()
            else:
                # Get a fresh frame from the camera
                frame = self.camera.capture_frame()
                # Update the cache
                self._cached_frame = frame.copy()
                self._cached_frame_time = time.time()
                # Reset error count on successful frame capture
                self._error_count = 0
            
            # Convert to suitable format for WebRTC
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            video_frame = VideoFrame.from_ndarray(frame_rgb, format="rgb24")
            
            # Update timestamp for the frame
            pts, time_base = self._frame_count, fractions.Fraction(1, self._fps)
            video_frame.pts = pts
            video_frame.time_base = time_base
            
            self._frame_count += 1
            self._last_frame = video_frame
            
            return video_frame
        except Exception as e:
            logger.error(f"Error capturing frame: {str(e)}")
            self._error_count += 1
            
            # If there are too many consecutive errors, mark the stream as inactive
            if self._error_count > 10:
                logger.warning("Too many frame errors, marking stream as inactive")
                self._stream_active = False
            
            # If there's an error getting a new frame, use the last successful frame if available
            if self._last_frame is not None:
                return self._last_frame
            
            # If no previous frame, create a black frame
            black_frame = np.zeros((self.camera.height, self.camera.width, 3), dtype=np.uint8)
            video_frame = VideoFrame.from_ndarray(black_frame, format="rgb24")
            video_frame.pts = self._frame_count
            video_frame.time_base = fractions.Fraction(1, self._fps)
            self._frame_count += 1
            return video_frame
    
    def stop(self):
        """
        Mark the stream as inactive.
        """
        self._stream_active = False
    
    def restart(self):
        """
        Mark the stream as active again.
        """
        self._stream_active = True
        self._error_count = 0

class WebRTCStreamManager:
    """
    Manages WebRTC peer connections for camera streaming.
    """
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls, camera: Camera) -> 'WebRTCStreamManager':
        """Singleton pattern to ensure only one instance exists"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(camera)
            return cls._instance

    def __init__(self, camera: Camera):
        self.camera = camera
        self.peer_connections: Dict[str, RTCPeerConnection] = {}
        self.video_tracks: Dict[str, CameraVideoStreamTrack] = {}
        self.connection_states: Dict[str, str] = {}
        self.ice_servers = [RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
        self.rtc_config = RTCConfiguration(iceServers=self.ice_servers)
        
        # Stats and health tracking
        self.last_health_check = time.time()
        self.health_check_interval = 30  # seconds
        
    def get_session_status(self, client_id: str) -> Dict[str, Any]:
        """
        Get status information for a specific WebRTC session.
        """
        if client_id not in self.peer_connections:
            return {"connected": False, "exists": False}
        
        pc = self.peer_connections[client_id]
        
        # Get state information
        return {
            "connected": pc.connectionState == "connected",
            "exists": True,
            "connectionState": pc.connectionState,
            "iceConnectionState": pc.iceConnectionState,
            "iceGatheringState": pc.iceGatheringState,
            "signalingState": pc.signalingState,
            "stream_active": self.video_tracks.get(client_id) is not None and 
                            self.video_tracks[client_id]._stream_active
        }
    
    async def create_peer_connection(self, client_id: str) -> RTCPeerConnection:
        """
        Create a new peer connection for a client.
        """
        # Close existing connection if it exists
        if client_id in self.peer_connections:
            try:
                await self.close_peer_connection(client_id)
            except Exception as e:
                logger.error(f"Error closing existing peer connection for {client_id}: {str(e)}")
        
        # Create peer connection with ICE servers
        pc = RTCPeerConnection(configuration=self.rtc_config)
        
        # Create a new video track for this client
        video_track = CameraVideoStreamTrack(self.camera)
        self.video_tracks[client_id] = video_track
        
        # Add track to peer connection
        pc.addTrack(video_track)
        
        # Store the peer connection
        self.peer_connections[client_id] = pc
        self.connection_states[client_id] = "new"
        
        # Handle ICE connection state changes
        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            logger.info(f"Client {client_id}: ICE connection state is {pc.iceConnectionState}")
            self.connection_states[client_id] = pc.iceConnectionState
            
            if pc.iceConnectionState == "failed" or pc.iceConnectionState == "closed":
                if client_id in self.peer_connections:  # Check if client_id still exists
                    await self.close_peer_connection(client_id)
            elif pc.iceConnectionState == "disconnected":
                # Handle temporary disconnections
                logger.warning(f"Client {client_id} temporarily disconnected")
            elif pc.iceConnectionState == "connected":
                # Restart video track if it was stopped
                if client_id in self.video_tracks and not self.video_tracks[client_id]._stream_active:
                    self.video_tracks[client_id].restart()
        
        # Handle connection state changes
        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Client {client_id}: Connection state is {pc.connectionState}")
            self.connection_states[client_id] = pc.connectionState
            
            if pc.connectionState == "failed" or pc.connectionState == "closed":
                if client_id in self.peer_connections:  # Check if client_id still exists
                    await self.close_peer_connection(client_id)
            elif pc.connectionState == "connected":
                # Restart video track if it was stopped
                if client_id in self.video_tracks and not self.video_tracks[client_id]._stream_active:
                    self.video_tracks[client_id].restart()
        
        return pc
    
    async def process_offer(self, client_id: str, offer: dict) -> dict:
        """
        Process a WebRTC offer from a client.
        """
        # Create new peer connection
        pc = await self.create_peer_connection(client_id)
        
        try:
            # Set remote description (client's offer)
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer["sdp"], type=offer["type"]))
            
            # Create answer
            answer = await pc.createAnswer()
            
            # Set local description (our answer)
            await pc.setLocalDescription(answer)
            
            # Return answer to client
            return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type, "session_id": client_id}
        except Exception as e:
            # Clean up on error
            logger.error(f"Error processing offer: {str(e)}")
            await self.close_peer_connection(client_id)
            raise
    
    async def process_ice_candidate(self, client_id: str, candidate: dict) -> None:
        """
        Process an ICE candidate from a client.
        
        The candidate dict should have:
        - sdpMid: Optional[str]
        - sdpMLineIndex: Optional[int]
        - candidate: str (the ICE candidate string)
        """
        if client_id not in self.peer_connections:
            logger.warning(f"Received ICE candidate for unknown client {client_id}")
            return
            
        pc = self.peer_connections[client_id]
        
        try:
            # Create RTCIceCandidate with positional arguments
            if "candidate" in candidate and candidate["candidate"]:
                ice_candidate = RTCIceCandidate(
                    candidate["candidate"],
                    candidate.get("sdpMid", None),
                    candidate.get("sdpMLineIndex", None)
                )
                await pc.addIceCandidate(ice_candidate)
                logger.debug(f"Added ICE candidate for client {client_id}")
            else:
                logger.warning(f"Received empty ICE candidate for client {client_id}")
        except Exception as e:
            logger.error(f"Error processing ICE candidate: {str(e)}")
            # Don't raise the exception to avoid disrupting the connection
    
    async def close_peer_connection(self, client_id: str) -> None:
        """
        Close a peer connection.
        """
        try:
            if client_id in self.peer_connections:
                pc = self.peer_connections[client_id]
                
                # Stop the video track
                if client_id in self.video_tracks:
                    try:
                        self.video_tracks[client_id].stop()
                    except Exception as e:
                        logger.error(f"Error stopping video track for {client_id}: {str(e)}")
                
                # Close the connection
                await pc.close()
                
                # Remove from internal storage
                self.peer_connections.pop(client_id, None)
                self.video_tracks.pop(client_id, None)
                self.connection_states.pop(client_id, None)
                
                logger.info(f"Closed peer connection for client {client_id}")
        except Exception as e:
            logger.error(f"Error closing peer connection for {client_id}: {str(e)}")
    
    async def close_all_connections(self) -> None:
        """
        Close all peer connections.
        """
        # Make a copy of keys to avoid dict size change during iteration
        client_ids = list(self.peer_connections.keys())
        
        for client_id in client_ids:
            await self.close_peer_connection(client_id)
    
    async def health_check(self) -> None:
        """
        Perform periodic health checks on all connections.
        """
        if time.time() - self.last_health_check < self.health_check_interval:
            return
            
        self.last_health_check = time.time()
        logger.info(f"Performing health check on {len(self.peer_connections)} connections")
        
        # Check each connection
        for client_id, pc in list(self.peer_connections.items()):
            if pc.connectionState in ["failed", "closed"]:
                logger.warning(f"Detected dead connection for client {client_id}, cleaning up")
                await self.close_peer_connection(client_id)

def get_webrtc_manager(camera: Camera = Depends(get_camera)) -> WebRTCStreamManager:
    """
    Get the WebRTC manager singleton instance.
    This is a FastAPI dependency that will be used in the endpoints.
    """
    return WebRTCStreamManager.get_instance(camera)