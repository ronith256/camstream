// frontend/src/contexts/CameraContext.tsx
import React, { createContext, useState, useContext, useEffect, useRef, ReactNode, useCallback } from 'react';
import { CameraStatus, CameraInfo } from '../types/types';
import { getCameraStatus, takePhoto, startRecording, stopRecording, getAvailableCameras } from '../services/api';
import webRTCService from '../services/webrtc';

interface CameraContextType {
  connected: boolean;
  connecting: boolean;
  streaming: boolean;
  recording: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraStatus: CameraStatus | null;
  isPhotoLoading: boolean;
  isRecordingLoading: boolean;
  error: string | null;
  availableCameras: CameraInfo[];
  selectedCameraId: string;
  setSelectedCameraId: (cameraId: string) => void;
  startStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  capturePhoto: () => Promise<string>;
  startVideoRecording: () => Promise<string>;
  stopVideoRecording: () => Promise<string>;
  resetError: () => void;
  reconnect: () => Promise<void>;
  loadAvailableCameras: () => Promise<CameraInfo[]>;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export const CameraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Connection and streaming states
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  
  // Media operation states
  const [recording, setRecording] = useState(false);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  
  // Camera selection state
  const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Camera status from backend
  const [cameraStatus, setCameraStatus] = useState<CameraStatus | null>(null);
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  // Connection attempt tracking
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Refs for elements and timers
  const videoRef = useRef<HTMLVideoElement>(null);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollingIntervalRef = useRef<number>(5000);
  
  // Load available cameras
  const loadAvailableCameras = useCallback(async () => {
    try {
      const cameras = await getAvailableCameras();
      setAvailableCameras(cameras);
      
      // Auto-select the first camera if none is selected
      if (!selectedCameraId && cameras.length > 0) {
        setSelectedCameraId(cameras[0].id);
      }
      
      return cameras;
    } catch (error) {
      console.error('Failed to fetch available cameras:', error);
      setError('Failed to load available cameras');
      return [];
    }
  }, [selectedCameraId]);
  
  // Load cameras on mount
  useEffect(() => {
    loadAvailableCameras();
  }, [loadAvailableCameras]);
  
  // Clear error state
  const resetError = useCallback(() => {
    setError(null);
  }, []);
  
  // Handle WebRTC connection state changes
  useEffect(() => {
    const handleConnectionStateChange = (state: string) => {
      console.log(`WebRTC connection state changed: ${state}`);
      
      switch (state) {
        case 'connecting':
          setConnecting(true);
          setConnected(false);
          setStreaming(false);
          break;
        case 'connected':
          setConnecting(false);
          setConnected(true);
          setStreaming(true);
          setConnectionAttempts(0);
          break;
        case 'disconnected':
        case 'reconnecting':
          setConnecting(true);
          setConnected(false);
          break;
        case 'failed':
        case 'closed':
          setConnecting(false);
          setConnected(false);
          setStreaming(false);
          break;
      }
    };
    
    // Subscribe to connection state changes
    const unsubscribe = webRTCService.on('connectionStateChange', handleConnectionStateChange);
    
    // Initial state sync
    const initialState = webRTCService.getConnectionState();
    handleConnectionStateChange(initialState);
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Reset connection when camera changes
  useEffect(() => {
    if (selectedCameraId && (connected || connecting)) {
      // Disconnect from current camera
      stopStream().then(() => {
        // Connect to new camera
        startStream();
      }).catch(console.error);
    }
  }, [selectedCameraId]);
  
  // Poll the camera status from the backend
  const fetchCameraStatus = useCallback(async () => {
    // Skip if we're loading a photo or connecting or no camera selected
    if (isPhotoLoading || connecting || !selectedCameraId) return;
    
    try {
      const status = await getCameraStatus(selectedCameraId);
      
      // Only update if there's a change to avoid unnecessary renders
      if (!cameraStatus || 
          cameraStatus.status !== status.status ||
          cameraStatus.recording !== status.recording ||
          cameraStatus.camera_id !== status.camera_id) {
        
        setCameraStatus(status);
        setRecording(status.recording);
        
        // Reset polling interval on status change
        statusPollingIntervalRef.current = 5000;
      } else {
        // Gradually increase polling interval up to 30 seconds
        statusPollingIntervalRef.current = Math.min(30000, statusPollingIntervalRef.current * 1.5);
      }
    } catch (error) {
      console.error('Error fetching camera status:', error);
      
      // Don't display errors for status polling to avoid UI noise
      // Just increase polling interval on error
      statusPollingIntervalRef.current = Math.min(30000, statusPollingIntervalRef.current * 1.5);
    }
  }, [isPhotoLoading, connecting, cameraStatus, selectedCameraId]);
  
  // Set up status polling
  useEffect(() => {
    // Skip if no camera selected
    if (!selectedCameraId) return;
    
    // Initial status check
    fetchCameraStatus();
    
    // Clear any existing interval
    if (statusPollingRef.current) {
      clearTimeout(statusPollingRef.current);
    }
    
    // Set up dynamic polling with setTimeout for more accuracy
    const scheduleNextPoll = () => {
      statusPollingRef.current = setTimeout(() => {
        fetchCameraStatus().finally(() => {
          scheduleNextPoll();
        });
      }, statusPollingIntervalRef.current);
    };
    
    scheduleNextPoll();
    
    // Cleanup on unmount or camera change
    return () => {
      if (statusPollingRef.current) {
        clearTimeout(statusPollingRef.current);
      }
    };
  }, [fetchCameraStatus, selectedCameraId]);
  
  // Start WebRTC stream
  const startStream = async () => {
    if (!selectedCameraId) {
      setError('No camera selected');
      return;
    }
    
    if (streaming || connecting) {
      console.log('Already streaming or connecting');
      return;
    }
    
    try {
      setConnecting(true);
      setError(null);
      
      console.log(`Initializing WebRTC connection for camera ${selectedCameraId}`);
      
      // Initialize WebRTC with video element
      if (videoRef.current) {
        // Pass the camera ID to the WebRTC service
        await webRTCService.initialize(videoRef.current, selectedCameraId);
        
        // Connect to camera stream
        console.log(`Connecting to camera stream for ${selectedCameraId}`);
        await webRTCService.connect();
        
        // Connection state will be updated via event handler
        
        // Force a status update after connection
        setTimeout(fetchCameraStatus, 500);
      } else {
        throw new Error('Video element reference is not available');
      }
    } catch (error) {
      console.error('Failed to start camera stream:', error);
      setError(`Failed to connect to camera ${selectedCameraId}. Please try again.`);
      setConnecting(false);
      setConnected(false);
      setStreaming(false);
      
      // Increment connection attempts
      setConnectionAttempts(prev => prev + 1);
    }
  };
  
  // Stop WebRTC stream
  const stopStream = async () => {
    if (!streaming && !connected && !connecting) return;
    
    try {
      setConnecting(true);
      
      console.log('Stopping camera stream');
      await webRTCService.disconnect();
      
      // State will be updated via event handler
    } catch (error) {
      console.error('Failed to stop camera stream:', error);
      
      // Force disconnect state even on error
      setConnecting(false);
      setConnected(false);
      setStreaming(false);
    }
  };
  
  // Manual reconnect function
  const reconnect = async () => {
    try {
      setConnecting(true);
      await webRTCService.forceReconnect();
    } catch (error) {
      console.error('Manual reconnection failed:', error);
      setError('Failed to reconnect. Please try again.');
      
      // Connection state will be updated via event handler
    }
  };
  
  // Capture a photo
  const capturePhoto = async (): Promise<string> => {
    if (!selectedCameraId) {
      throw new Error('No camera selected');
    }
    
    if (!streaming) {
      throw new Error('Camera is not streaming. Please start the stream first.');
    }
    
    if (isPhotoLoading || isRecordingLoading) {
      throw new Error('Another operation is in progress. Please try again shortly.');
    }
    
    try {
      setIsPhotoLoading(true);
      setError(null);
      
      // Tell WebRTC service that a media operation is beginning
      webRTCService.beginMediaOperation();
      
      console.log(`Taking photo with camera ${selectedCameraId}`);
      const result = await takePhoto(selectedCameraId);
      
      // Force refresh status after taking photo
      setTimeout(fetchCameraStatus, 500);
      
      console.log('Photo captured successfully:', result.filename);
      return result.path;
    } catch (error) {
      console.error('Failed to capture photo:', error);
      setError('Failed to capture photo. Please try again.');
      throw error;
    } finally {
      // End media operation and reset loading state
      webRTCService.endMediaOperation();
      setIsPhotoLoading(false);
    }
  };
  
  // Start video recording
  const startVideoRecording = async (): Promise<string> => {
    if (!selectedCameraId) {
      throw new Error('No camera selected');
    }
    
    if (!streaming) {
      throw new Error('Camera is not streaming. Please start the stream first.');
    }
    
    if (isPhotoLoading || isRecordingLoading) {
      throw new Error('Another operation is in progress. Please try again shortly.');
    }
    
    try {
      setIsRecordingLoading(true);
      setError(null);
      
      // Tell WebRTC service that a media operation is beginning
      webRTCService.beginMediaOperation();
      
      console.log(`Starting video recording with camera ${selectedCameraId}`);
      const result = await startRecording(selectedCameraId);
      setRecording(true);
      
      // Force refresh status after starting recording
      setTimeout(fetchCameraStatus, 500);
      
      console.log('Video recording started successfully');
      return result.path;
    } catch (error) {
      console.error('Failed to start recording:', error);
      setError('Failed to start video recording. Please try again.');
      throw error;
    } finally {
      // End media operation and reset loading state
      webRTCService.endMediaOperation();
      setIsRecordingLoading(false);
    }
  };
  
  // Stop video recording
  const stopVideoRecording = async (): Promise<string> => {
    if (!selectedCameraId) {
      throw new Error('No camera selected');
    }
    
    if (!recording) {
      throw new Error('No active recording to stop.');
    }
    
    if (isPhotoLoading || isRecordingLoading) {
      throw new Error('Another operation is in progress. Please try again shortly.');
    }
    
    try {
      setIsRecordingLoading(true);
      setError(null);
      
      // Tell WebRTC service that a media operation is beginning
      webRTCService.beginMediaOperation();
      
      console.log(`Stopping video recording for camera ${selectedCameraId}`);
      const result = await stopRecording(selectedCameraId);
      setRecording(false);
      
      // Force refresh status after stopping recording
      setTimeout(fetchCameraStatus, 500);
      
      console.log('Video recording stopped successfully');
      return result.path;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setError('Failed to stop video recording. Please try again.');
      throw error;
    } finally {
      // End media operation and reset loading state
      webRTCService.endMediaOperation();
      setIsRecordingLoading(false);
    }
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Ensure stream is stopped
      webRTCService.disconnect().catch(console.error);
      
      // Clear polling interval
      if (statusPollingRef.current) {
        clearTimeout(statusPollingRef.current);
      }
    };
  }, []);
  
  // Context value
  const value = {
    connected,
    connecting,
    streaming,
    recording,
    videoRef,
    cameraStatus,
    isPhotoLoading,
    isRecordingLoading,
    error,
    availableCameras,
    selectedCameraId,
    setSelectedCameraId,
    startStream,
    stopStream,
    capturePhoto,
    startVideoRecording,
    stopVideoRecording,
    resetError,
    reconnect,
    loadAvailableCameras,
  };
  
  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
};

export const useCamera = (): CameraContextType => {
  const context = useContext(CameraContext);
  
  if (context === undefined) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  
  return context;
};