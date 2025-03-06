// frontend/src/services/api.ts
import { CameraStatus, MediaGroup, MediaItem, CameraInfo } from '../types/types';

export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Generic API request handler
async function apiRequest<T>(
  endpoint: string,
  method: string = 'GET',
  body?: any
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unknown error occurred',
    }));
    throw new Error(error.message || `API request failed with status ${response.status}`);
  }

  return response.json();
}

// Camera-related API calls
export async function getCameraStatus(cameraId?: string): Promise<CameraStatus> {
  const queryParams = cameraId ? `?camera_id=${cameraId}` : '';
  return apiRequest<CameraStatus>(`/camera/status${queryParams}`);
}

export async function getAvailableCameras(): Promise<CameraInfo[]> {
  return apiRequest<CameraInfo[]>('/camera/list');
}

export async function takePhoto(cameraId?: string): Promise<{ success: boolean; filename: string; path: string }> {
  const queryParams = cameraId ? `?camera_id=${cameraId}` : '';
  return apiRequest<{ success: boolean; filename: string; path: string }>(
    `/camera/photo${queryParams}`,
    'POST'
  );
}

export async function startRecording(cameraId?: string): Promise<{ success: boolean; filename: string; path: string }> {
  const queryParams = cameraId ? `?camera_id=${cameraId}` : '';
  return apiRequest<{ success: boolean; filename: string; path: string }>(
    `/camera/video/start${queryParams}`,
    'POST'
  );
}

export async function stopRecording(cameraId?: string): Promise<{ success: boolean; path: string }> {
  const queryParams = cameraId ? `?camera_id=${cameraId}` : '';
  return apiRequest<{ success: boolean; path: string }>(
    `/camera/video/stop${queryParams}`,
    'POST'
  );
}

// Media-related API calls
export async function getMediaList(days: number = 7, cameraId?: string): Promise<MediaGroup[]> {
  const queryParams = new URLSearchParams();
  queryParams.append('days', days.toString());
  if (cameraId) {
    queryParams.append('camera_id', cameraId);
  }
  return apiRequest<MediaGroup[]>(`/media/list?${queryParams.toString()}`);
}

export async function getMediaItem(mediaId: string, cameraId?: string): Promise<MediaItem> {
  const queryParams = cameraId ? `?camera_id=${cameraId}` : '';
  return apiRequest<MediaItem>(`/media/item/${mediaId}${queryParams}`);
}

export async function getCamerasWithMedia(): Promise<Array<{camera_id: string, name: string, total_items: number}>> {
  return apiRequest<Array<{camera_id: string, name: string, total_items: number}>>('/media/cameras');
}