// frontend/src/components/CameraView/MultiCameraGridItem.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Maximize, Camera as CameraIcon, Video, Square, Loader } from 'lucide-react';
import { CameraInfo } from '../../types/types';
import { MultiWebRTCService } from '../../services/multi-webrtc';
import { takePhoto, startRecording, stopRecording } from '../../services/api';

interface MultiCameraGridItemProps {
  camera: CameraInfo;
  onSelect: (cameraId: string) => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const MultiCameraGridItem: React.FC<MultiCameraGridItemProps> = ({ camera, onSelect, onToast }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rtcServiceRef = useRef<any>(null);

  useEffect(() => {
    // Initialize the stream when the component mounts
    connectStream();

    // Clean up when the component unmounts
    return () => {
      disconnectStream();
    };
  }, [camera.id]);

  const connectStream = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      setError(null);
      
      if (!videoRef.current) {
        throw new Error('Video element reference is not available');
      }
      
      // Create a new WebRTC service instance for this camera
      const rtcService = new MultiWebRTCService();
      rtcServiceRef.current = rtcService;
      
      // Add event listeners
      const unsubscribe = rtcService.on('connectionStateChange', (state: string) => {
        if (state === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
        } else if (state === 'connecting' || state === 'reconnecting') {
          setIsConnecting(true);
          setIsConnected(false);
        } else {
          setIsConnected(false);
          setIsConnecting(false);
        }
      });
      
      // Initialize and connect
      await rtcService.initialize(videoRef.current, camera.id);
      await rtcService.connect();
      
    } catch (err) {
      console.error(`Failed to connect to camera ${camera.id}:`, err);
      setError('Connection failed');
      setIsConnected(false);
      setIsConnecting(false);
    }
  };

  const disconnectStream = async () => {
    try {
      if (rtcServiceRef.current) {
        await rtcServiceRef.current.disconnect();
        rtcServiceRef.current = null;
      }
      setIsConnected(false);
    } catch (err) {
      console.error(`Error disconnecting from camera ${camera.id}:`, err);
    }
  };

  const handleReconnect = async () => {
    await disconnectStream();
    await connectStream();
  };

  const handleSelect = () => {
    onSelect(camera.id);
  };

  const handleCapturePhoto = async () => {
    if (!isConnected || isPhotoLoading || isRecordingLoading) return;
    
    try {
      setIsPhotoLoading(true);
      
      // Tell WebRTC service that a media operation is beginning
      if (rtcServiceRef.current) {
        rtcServiceRef.current.beginMediaOperation();
      }
      
      onToast('Capturing photo...', 'success');
      
      // Call the API to take a photo
      const result = await takePhoto(camera.id);
      
      onToast('Photo captured successfully');
    } catch (error) {
      console.error('Failed to capture photo:', error);
      onToast('Failed to capture photo', 'error');
    } finally {
      // End media operation
      if (rtcServiceRef.current) {
        rtcServiceRef.current.endMediaOperation();
      }
      setIsPhotoLoading(false);
    }
  };

  const handleToggleRecording = async () => {
    if (!isConnected || isPhotoLoading || isRecordingLoading) return;
    
    try {
      setIsRecordingLoading(true);
      
      // Tell WebRTC service that a media operation is beginning
      if (rtcServiceRef.current) {
        rtcServiceRef.current.beginMediaOperation();
      }
      
      if (isRecording) {
        onToast('Saving video...', 'success');
        
        // Call the API to stop recording
        const result = await stopRecording(camera.id);
        
        setIsRecording(false);
        onToast('Video saved successfully');
      } else {
        onToast('Starting recording...', 'success');
        
        // Call the API to start recording
        const result = await startRecording(camera.id);
        
        setIsRecording(true);
        onToast('Recording started');
      }
    } catch (error) {
      console.error('Video recording action failed:', error);
      onToast('Video recording action failed', 'error');
    } finally {
      // End media operation
      if (rtcServiceRef.current) {
        rtcServiceRef.current.endMediaOperation();
      }
      setIsRecordingLoading(false);
    }
  };

  return (
    <div className="camera-item relative rounded-lg overflow-hidden bg-black aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />
      
      {/* Camera name overlay */}
      <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
        <span className="text-white text-sm">{camera.name}</span>
      </div>
      
      {/* Top right controls */}
      <div className="absolute top-2 right-2 flex space-x-2">
        <button 
          className="p-1 bg-black bg-opacity-50 rounded text-white hover:bg-opacity-70"
          onClick={handleSelect}
          title="View full screen"
        >
          <Maximize size={16} />
        </button>
      </div>
      
      {/* Camera controls at bottom */}
      {isConnected && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 bg-black bg-opacity-50 rounded-full px-3 py-1">
          {/* Photo capture button */}
          <button
            onClick={handleCapturePhoto}
            disabled={!isConnected || isPhotoLoading || isRecordingLoading}
            className={`bg-white text-black p-2 rounded-full hover:bg-gray-200 transition-all
                      ${(!isConnected || isPhotoLoading || isRecordingLoading) ? 'opacity-50 cursor-not-allowed' : ''} 
                      ${isPhotoLoading ? 'bg-gray-200' : ''}`}
            aria-label="Take Photo"
            title="Take Photo"
          >
            {isPhotoLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Camera size={16} />
            )}
          </button>
          
          {/* Video recording button */}
          <button
            onClick={handleToggleRecording}
            disabled={!isConnected || isPhotoLoading || isRecordingLoading}
            className={`p-2 rounded-full transition-all
                      ${(!isConnected || isPhotoLoading || isRecordingLoading) ? 'opacity-50 cursor-not-allowed' : ''}
                      ${isRecording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-black hover:bg-gray-200'}
                      ${isRecordingLoading ? 'bg-opacity-70' : ''}`}
            aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecordingLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              isRecording ? <Square size={16} /> : <Video size={16} />
            )}
            
            {isRecording && !isRecordingLoading && (
              <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
            )}
          </button>
        </div>
      )}
      
      {/* Connection status */}
      {!isConnected && !isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-black bg-opacity-70">
          <CameraIcon size={32} />
          <p className="text-center mt-2">Camera offline</p>
          {error && (
            <p className="text-center text-red-400 text-sm mt-1">{error}</p>
          )}
          <button
            onClick={handleReconnect}
            className="mt-3 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
          >
            Connect
          </button>
        </div>
      )}
      
      {/* Connecting indicator */}
      {isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-black bg-opacity-70">
          <RefreshCw size={32} className="animate-spin mb-2" />
          <p>Connecting...</p>
        </div>
      )}
    </div>
  );
};

export default MultiCameraGridItem;