// frontend/src/components/Gallery/CameraGallery.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCamerasWithMedia } from '../../services/api';
import { CameraWithMedia } from '../../types/types';
import { Camera, Image, FilmIcon, ChevronRight } from 'lucide-react';
import Loading from '../UI/Loading';

const CameraGallery: React.FC = () => {
  const [cameras, setCameras] = useState<CameraWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        setLoading(true);
        const data = await getCamerasWithMedia();
        setCameras(data);
        setError(null);
      } catch (err) {
        setError('Failed to load cameras with media');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, []);

  const handleCameraClick = (cameraId: string) => {
    navigate(`/gallery/camera/${cameraId}`);
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error}</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-24 h-24 flex items-center justify-center rounded-full bg-gray-100 mb-4">
          <Camera size={32} className="text-gray-400" />
        </div>
        <h3 className="text-xl font-medium mb-2">No media found</h3>
        <p className="text-gray-500 mb-4">Capture photos or videos to see them here</p>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => navigate('/')}
        >
          Go to Live View
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Gallery</h1>
        <button
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => navigate('/')}
        >
          Back to Camera
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cameras.map((camera) => (
          <div 
            key={camera.camera_id} 
            className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transform transition-transform hover:scale-105"
            onClick={() => handleCameraClick(camera.camera_id)}
          >
            <div className="p-5 flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Camera size={24} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-lg">{camera.name}</h3>
                <p className="text-gray-500 text-sm">
                  {camera.total_items} items in {camera.date_count} dates
                </p>
              </div>
              <ChevronRight size={20} className="text-gray-400" />
            </div>
            
            <div className="h-32 bg-gray-200 flex items-center justify-center">
              <div className="flex items-center justify-center gap-1 text-gray-500">
                <FilmIcon size={16} /> 
                <Image size={16} />
                <span className="text-xs">{camera.total_items} media items</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CameraGallery;