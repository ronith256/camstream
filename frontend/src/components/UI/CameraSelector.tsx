// frontend/src/components/UI/CameraSelector.tsx
import React, { useEffect, useState } from 'react';
import { ChevronDown, Camera } from 'lucide-react';
import { getAvailableCameras } from '../../services/api';

export interface CameraInfo {
  id: string;
  name: string;
  index: number;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
}

interface CameraSelectorProps {
  selectedCameraId: string;
  onCameraChange: (cameraId: string) => void;
  disabled?: boolean;
}

const CameraSelector: React.FC<CameraSelectorProps> = ({
  selectedCameraId,
  onCameraChange,
  disabled = false
}) => {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the list of available cameras on mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        setIsLoading(true);
        const camerasData = await getAvailableCameras();
        setCameras(camerasData);
        
        // Auto-select the first camera if none is selected
        if (!selectedCameraId && camerasData.length > 0) {
          onCameraChange(camerasData[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch cameras:', err);
        setError('Failed to load available cameras');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCameras();
  }, [selectedCameraId, onCameraChange]);

  // Find the selected camera info
  const selectedCamera = cameras.find(cam => cam.id === selectedCameraId);

  // Toggle dropdown
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  // Handle camera selection
  const handleCameraSelect = (cameraId: string) => {
    onCameraChange(cameraId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={disabled || isLoading}
        className={`flex items-center gap-2 px-3 py-2 rounded-md bg-gray-100 text-gray-800 
                    border border-gray-300 focus:outline-none
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer'}
                    ${isLoading ? 'animate-pulse' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Camera size={18} />
        
        <span className="flex-1 text-left">
          {isLoading 
            ? 'Loading cameras...' 
            : (selectedCamera?.name || 'Select Camera')}
        </span>
        
        <ChevronDown 
          size={16} 
          className={`transition-transform ${isOpen ? 'transform rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div 
          className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg overflow-hidden border border-gray-300"
          role="listbox"
        >
          <ul className="py-1 max-h-60 overflow-auto">
            {cameras.length === 0 && (
              <li className="px-4 py-2 text-sm text-gray-500">
                {error || 'No cameras available'}
              </li>
            )}

            {cameras.map((camera) => (
              <li
                key={camera.id}
                onClick={() => handleCameraSelect(camera.id)}
                className={`px-4 py-2 text-sm cursor-pointer
                          ${camera.id === selectedCameraId 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'hover:bg-gray-100'}`}
                role="option"
                aria-selected={camera.id === selectedCameraId}
              >
                <div className="flex items-center justify-between">
                  <span>{camera.name}</span>
                  <span className="text-xs text-gray-500">
                    {camera.resolution.width}x{camera.resolution.height}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CameraSelector;