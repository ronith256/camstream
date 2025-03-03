// frontend/src/contexts/CameraContext.tsx
import React, { createContext, useState, useContext, useEffect, useRef, ReactNode, useCallback } from 'react';
import { CameraStatus } from '../types/types';
import { getCameraStatus, takePhoto, startRecording, stopRecording } from '../services/api';
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
  startStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  capturePhoto: () => Promise<string>;
  startVideoRecording: () => Promise<string>;
  stopVideoRecording: () => Promise<string>;
  resetError: () => void;
  reconnect: () => Promise<void>;
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
  
  // Poll the camera status from the backend
  const fetchCameraStatus = useCallback(async () => {
    // Skip if we're loading a photo or connecting
    if (isPhotoLoading && connecting) return;
    
    try {
      const status = await getCameraStatus();
      
      // Only update if there's a change to avoid unnecessary renders
      if (!cameraStatus || 
          cameraStatus.status !== status.status ||
          cameraStatus.recording !== status.recording) {
        
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
  }, [isPhotoLoading, connecting, cameraStatus]);
  
  // Set up status polling
  useEffect(() => {
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
    
    // Cleanup on unmount
    return () => {
      if (statusPollingRef.current) {
        clearTimeout(statusPollingRef.current);
      }
    };
  }, [fetchCameraStatus]);
  
  // Start WebRTC stream
  const startStream = async () => {
    if (streaming || connecting) {
      console.log('Already streaming or connecting');
      return;
    }
    
    try {
      setConnecting(true);
      setError(null);
      
      console.log('Initializing WebRTC connection');
      
      // Initialize WebRTC with video element
      if (videoRef.current) {
        await webRTCService.initialize(videoRef.current);
        
        // Connect to camera stream
        console.log('Connecting to camera stream');
        await webRTCService.connect();
        
        // Connection state will be updated via event handler
        
        // Force a status update after connection
        setTimeout(fetchCameraStatus, 500);
      } else {
        throw new Error('Video element reference is not available');
      }
    } catch (error) {
      console.error('Failed to start camera stream:', error);
      setError('Failed to connect to camera stream. Please try again.');
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
      
      console.log('Taking photo');
      const result = await takePhoto();
      
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
      
      console.log('Starting video recording');
      const result = await startRecording();
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
      
      console.log('Stopping video recording');
      const result = await stopRecording();
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
    startStream,
    stopStream,
    capturePhoto,
    startVideoRecording,
    stopVideoRecording,
    resetError,
    reconnect,
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