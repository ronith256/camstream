// frontend/src/components/CameraView/CameraControls.tsx
import React from 'react';
import { useCamera } from '../../contexts/CameraContext';
import { Camera, Video, Square, Settings, Loader } from 'lucide-react';

interface CameraControlsProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

const CameraControls: React.FC<CameraControlsProps> = ({ onToast }) => {
  const {
    streaming,
    recording,
    connecting,
    isPhotoLoading,
    isRecordingLoading,
    capturePhoto,
    startVideoRecording,
    stopVideoRecording,
  } = useCamera();

  const handleCapturePhoto = async () => {
    if (!streaming || connecting || isPhotoLoading || isRecordingLoading) return;
    
    try {
      onToast('Capturing photo...', 'success');
      await capturePhoto();
      onToast('Photo captured successfully');
    } catch (error) {
      onToast('Failed to capture photo', 'error');
    }
  };

  const handleToggleRecording = async () => {
    if (!streaming || connecting || isPhotoLoading || isRecordingLoading) return;
    
    try {
      if (recording) {
        onToast('Saving video...', 'success');
        await stopVideoRecording();
        onToast('Video saved successfully');
      } else {
        onToast('Starting recording...', 'success');
        await startVideoRecording();
        onToast('Recording started');
      }
    } catch (error) {
      onToast('Video recording action failed', 'error');
    }
  };

  // Determine button states
  const photoButtonDisabled = !streaming || connecting || isPhotoLoading || isRecordingLoading;
  const recordButtonDisabled = !streaming || connecting || isPhotoLoading || isRecordingLoading;
  const settingsButtonDisabled = !streaming || connecting || isPhotoLoading || isRecordingLoading;

  return (
    <div className="camera-controls">
      {/* Photo capture button */}
      <button
        onClick={handleCapturePhoto}
        disabled={photoButtonDisabled}
        className={`bg-white text-black p-3 rounded-full hover:bg-gray-200 transition-all
                   ${photoButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''} 
                   ${isPhotoLoading ? 'bg-gray-200' : ''}`}
        aria-label="Take Photo"
      >
        {isPhotoLoading ? (
          <Loader size={24} className="animate-spin" />
        ) : (
          <Camera size={24} />
        )}
      </button>
      
      {/* Video recording button */}
      <button
        onClick={handleToggleRecording}
        disabled={recordButtonDisabled}
        className={`p-3 rounded-full transition-all
                   ${recordButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                   ${recording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-black hover:bg-gray-200'}
                   ${isRecordingLoading ? 'bg-opacity-70' : ''}`}
        aria-label={recording ? 'Stop Recording' : 'Start Recording'}
      >
        {isRecordingLoading ? (
          <Loader size={24} className="animate-spin" />
        ) : (
          recording ? <Square size={24} /> : <Video size={24} />
        )}
        
        {recording && !isRecordingLoading && (
          <span className="absolute top-0 right-0 h-3 w-3 bg-red-500 rounded-full animate-pulse"></span>
        )}
      </button>
      
      {/* Settings button */}
      <button
        disabled={settingsButtonDisabled}
        className={`bg-white text-black p-3 rounded-full hover:bg-gray-200 transition-all
                   ${settingsButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Settings"
      >
        <Settings size={24} />
      </button>
    </div>
  );
};

export default CameraControls;