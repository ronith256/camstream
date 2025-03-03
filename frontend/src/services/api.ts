// frontend/src/services/api.ts
import { CameraStatus, MediaGroup, MediaItem } from '../types/types';

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
export async function getCameraStatus(): Promise<CameraStatus> {
  return apiRequest<CameraStatus>('/camera/status');
}

export async function takePhoto(): Promise<{ success: boolean; filename: string; path: string }> {
  return apiRequest<{ success: boolean; filename: string; path: string }>(
    '/camera/photo',
    'POST'
  );
}

export async function startRecording(): Promise<{ success: boolean; filename: string; path: string }> {
  return apiRequest<{ success: boolean; filename: string; path: string }>(
    '/camera/video/start',
    'POST'
  );
}

export async function stopRecording(): Promise<{ success: boolean; path: string }> {
  return apiRequest<{ success: boolean; path: string }>(
    '/camera/video/stop',
    'POST'
  );
}

// Media-related API calls
export async function getMediaList(days: number = 7): Promise<MediaGroup[]> {
  return apiRequest<MediaGroup[]>(`/media/list?days=${days}`);
}

export async function getMediaItem(mediaId: string): Promise<MediaItem> {
  return apiRequest<MediaItem>(`/media/item/${mediaId}`);
}