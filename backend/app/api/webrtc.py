# backend/app/api/webrtc.py
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field
from typing import Dict, Optional, Any, List
import uuid
import logging

from app.camera.camera import Camera, get_camera
from app.camera.webrtc_stream import WebRTCStreamManager, get_webrtc_manager

logger = logging.getLogger(__name__)
webrtc_router = APIRouter()

class RTCSessionDescription(BaseModel):
    """
    WebRTC session description model.
    """
    type: str
    sdp: str

class RTCIceCandidateInit(BaseModel):
    """
    WebRTC ICE candidate model with the correct field structure.
    """
    candidate: str
    sdpMid: Optional[str] = None
    sdpMLineIndex: Optional[int] = None
    usernameFragment: Optional[str] = None

class WebRTCSession(BaseModel):
    """
    WebRTC session model.
    """
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))

class WebRTCOfferResponse(BaseModel):
    """
    Response model for WebRTC offer processing.
    """
    type: str
    sdp: str
    session_id: str

@webrtc_router.post("/offer", response_model=WebRTCOfferResponse)
async def process_offer(
    session: WebRTCSession = Body(...),
    offer: RTCSessionDescription = Body(...),
    manager: WebRTCStreamManager = Depends(get_webrtc_manager)
):
    """
    Process a WebRTC offer from a client.
    """
    try:
        # Use provided session ID or generate a new one
        session_id = session.id if session.id else str(uuid.uuid4())
        logger.info(f"Processing WebRTC offer for session {session_id}")
        
        answer = await manager.process_offer(session_id, offer.dict())
        
        # Return both the answer and the session_id
        return WebRTCOfferResponse(
            type=answer["type"],
            sdp=answer["sdp"],
            session_id=answer["session_id"]
        )
    except Exception as e:
        logger.error(f"Error processing WebRTC offer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@webrtc_router.post("/icecandidate/{session_id}", response_model=Dict[str, Any])
async def process_ice_candidate(
    session_id: str,
    candidate: RTCIceCandidateInit = Body(...),
    manager: WebRTCStreamManager = Depends(get_webrtc_manager)
):
    """
    Process an ICE candidate from a client.
    """
    try:
        logger.info(f"Processing ICE candidate for session {session_id}")
        
        # Convert to format expected by aiortc
        # The key fix: aiortc RTCIceCandidate expects positional args, not keyword args
        candidate_dict = {
            "sdpMid": candidate.sdpMid,
            "sdpMLineIndex": candidate.sdpMLineIndex,
            "candidate": candidate.candidate,
        }
        
        await manager.process_ice_candidate(session_id, candidate_dict)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error processing ICE candidate: {str(e)}")
        # Don't raise an exception for ICE candidate processing errors
        # as it could disrupt the connection establishment
        return {"success": False, "error": str(e)}

@webrtc_router.get("/session/{session_id}/status", response_model=Dict[str, Any])
async def get_session_status(
    session_id: str,
    manager: WebRTCStreamManager = Depends(get_webrtc_manager)
):
    """
    Get status of a WebRTC session.
    """
    try:
        status = manager.get_session_status(session_id)
        return status
    except Exception as e:
        logger.error(f"Error getting WebRTC session status: {str(e)}")
        return {"connected": False, "error": str(e)}

@webrtc_router.delete("/session/{session_id}", response_model=Dict[str, Any])
async def close_session(
    session_id: str,
    manager: WebRTCStreamManager = Depends(get_webrtc_manager)
):
    """
    Close a WebRTC session.
    """
    try:
        logger.info(f"Closing WebRTC session {session_id}")
        await manager.close_peer_connection(session_id)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error closing WebRTC session: {str(e)}")
        # Don't raise an exception, just return the error
        return {"success": False, "error": str(e)}