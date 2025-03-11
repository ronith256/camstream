// frontend/src/components/CameraView/MultiCameraView.tsx
import React, { useState } from 'react';
import { useCamera } from '../../contexts/CameraContext';
import Toast from '../UI/Toast';
import MultiCameraGridItem from './MultiCameraGridItem';

interface MultiCameraViewProps {
  onSelectCamera: (cameraId: string) => void;
}

const MultiCameraView: React.FC<MultiCameraViewProps> = ({ onSelectCamera }) => {
  const { availableCameras } = useCamera();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show toast message
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    
    // Auto hide after 3 seconds
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handleSelectCamera = (cameraId: string) => {
    onSelectCamera(cameraId);
  };

  // Define grid layout based on number of cameras
  const getGridClass = () => {
    const count = availableCameras.length;
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
    if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  // No cameras found message
  if (availableCameras.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded-lg">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No cameras found</p>
          <p className="text-gray-400 text-sm mt-2">Connect a camera to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className={`grid ${getGridClass()} gap-4`}>
        {availableCameras.map(camera => (
          <MultiCameraGridItem
            key={camera.id}
            camera={camera}
            onSelect={handleSelectCamera}
            onToast={showToast}
          />
        ))}
      </div>

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

export default MultiCameraView;