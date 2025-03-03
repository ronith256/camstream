// frontend/src/components/CameraView/LiveView.tsx
import React, { useEffect, useState } from 'react';
import { useCamera } from '../../contexts/CameraContext';
import { Camera, Video, RefreshCw, WifiOff } from 'lucide-react';
import CameraControls from './CameraControls';
import Toast from '../UI/Toast';

const LiveView: React.FC = () => {
  const {
    connected,
    connecting,
    streaming,
    recording,
    videoRef,
    error,
    isPhotoLoading,
    isRecordingLoading,
    startStream,
    resetError,
    reconnect
  } = useCamera();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Start streaming when component mounts
  useEffect(() => {
    const initStream = async () => {
      try {
        await startStream();
        // Reset connection attempts on success
        setConnectionAttempts(0);
      } catch (err) {
        // Increment connection attempts on failure
        setConnectionAttempts(prev => prev + 1);
      }
    };
    
    if (!connected && !connecting) {
      initStream();
    }
  }, [startStream, connected, connecting]);

  // Show toast message
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    
    // Auto hide after 3 seconds
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };
  
  // Handle manual reconnection
  const handleReconnect = async () => {
    try {
      setConnectionAttempts(prev => prev + 1);
      await reconnect();
    } catch (err) {
      console.error("Reconnection failed:", err);
    }
  };

  // Any media operation in progress?
  const isLoading = isPhotoLoading || isRecordingLoading;

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Live View</h1>
        <div className="flex items-center gap-2">
          {connecting && !isLoading ? (
            <span className="text-sm flex items-center gap-1">
              <RefreshCw size={14} className="animate-spin" />
              <span>Connecting...</span>
            </span>
          ) : (
            <>
              <span className={`h-3 w-3 rounded-full ${streaming ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-sm">{streaming ? 'Connected' : 'Disconnected'}</span>
            </>
          )}
          
          {recording && (
            <div className="flex items-center gap-1 text-red-500">
              <span className="animate-pulse h-3 w-3 rounded-full bg-red-500"></span>
              <span className="text-sm">Recording</span>
              {isRecordingLoading && (
                <span className="text-xs">(saving...)</span>
              )}
            </div>
          )}
          
          {!streaming && !connecting && (
            <button
              onClick={handleReconnect}
              className="ml-2 p-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              disabled={connecting || isLoading}
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="camera-container bg-black mb-4 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
        />
        
        {!streaming && !connecting && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            {connectionAttempts >= 5 ? (
              <>
                <WifiOff size={48} className="mb-2 text-red-500" />
                <p className="text-center mb-2">Connection failed after multiple attempts</p>
                <button 
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  onClick={handleReconnect}
                >
                  Try Again
                </button>
              </>
            ) : (
              <>
                <Camera size={48} />
                <p>No stream available</p>
              </>
            )}
          </div>
        )}

        {connecting && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <RefreshCw size={48} className="animate-spin mb-2" />
            <p>{connectionAttempts > 0 ? `Reconnecting (attempt ${connectionAttempts})...` : 'Connecting to camera...'}</p>
          </div>
        )}
        
        {/* Show camera controls while stream is active, even during loading */}
        {streaming && (
          <CameraControls onToast={showToast} />
        )}
      </div>

      {/* Status messages */}
      {isPhotoLoading && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-300 text-blue-800 rounded-lg flex items-center is-media-operation">
          <RefreshCw size={16} className="animate-spin mr-2" />
          <p>Processing photo...</p>
        </div>
      )}
      
      {isRecordingLoading && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-300 text-blue-800 rounded-lg flex items-center is-media-operation">
          <RefreshCw size={16} className="animate-spin mr-2" />
          <p>{recording ? 'Processing recording...' : 'Starting recording...'}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 text-red-800 rounded-lg">
          <p className="font-medium">Error: {error}</p>
          <button 
            className="mt-2 text-sm text-blue-500 hover:underline"
            onClick={resetError}
          >
            Dismiss
          </button>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default LiveView;