import asyncio
import cv2
import base64
import numpy as np
from fastapi import WebSocket
from typing import Dict, Set, List
import time
from app.camera.camera import Camera
from app.config.settings import settings

class CameraStreamManager:
    def __init__(self, camera: Camera):
        self.camera = camera
        self.active_connections: Set[WebSocket] = set()
        self.streaming_task = None
        self.running = False
    
    async def connect(self, websocket: WebSocket):
        """Add client to active connections"""
        # Check if max clients reached
        if len(self.active_connections) >= settings.MAX_CLIENTS:
            await websocket.close(code=1008, reason="Too many connections")
            return
        
        self.active_connections.add(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Remove client from active connections"""
        self.active_connections.discard(websocket)
    
    async def broadcast_frame(self, frame: np.ndarray):
        """Send frame to all connected clients"""
        # Skip if no clients connected
        if not self.active_connections:
            return
        
        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY])
        
        # Convert to base64 for sending over WebSocket
        encoded_frame = base64.b64encode(buffer).decode('utf-8')
        
        # Create a payload with the image data
        payload = {
            "type": "frame",
            "data": encoded_frame,
            "timestamp": time.time()
        }
        
        # Send to all clients
        disconnected_clients = []
        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except Exception:
                # Mark this client for disconnection
                disconnected_clients.append(connection)
        
        # Clean up any disconnected clients
        for client in disconnected_clients:
            self.disconnect(client)
    
    async def stream_frames(self):
        """Main streaming loop"""
        self.running = True
        
        try:
            while self.running:
                # Capture frame from camera
                frame = self.camera.capture_frame()
                
                # If recording, save this frame
                self.camera.record_frame(frame)
                
                # Send to all clients
                await self.broadcast_frame(frame)
                
                # Control frame rate (don't stream faster than FPS)
                await asyncio.sleep(1.0 / self.camera.fps)
        except Exception as e:
            print(f"Streaming error: {str(e)}")
            self.running = False
    
    async def start_streaming(self):
        """Start the streaming task"""
        if self.streaming_task is None or self.streaming_task.done():
            self.streaming_task = asyncio.create_task(self.stream_frames())
    
    async def stop_streaming(self):
        """Stop the streaming task"""
        self.running = False
        
        if self.streaming_task is not None and not self.streaming_task.done():
            self.streaming_task.cancel()
            try:
                await self.streaming_task
            except asyncio.CancelledError:
                pass
            self.streaming_task = None
