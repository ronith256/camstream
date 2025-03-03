from fastapi import APIRouter
from app.api.camera import camera_router
from app.api.media import media_router
from app.api.webrtc import webrtc_router

api_router = APIRouter()

api_router.include_router(camera_router, prefix="/camera", tags=["camera"])
api_router.include_router(media_router, prefix="/media", tags=["media"])
api_router.include_router(webrtc_router, prefix="/webrtc", tags=["webrtc"])