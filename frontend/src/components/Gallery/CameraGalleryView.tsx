// frontend/src/components/Gallery/CameraGalleryView.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMediaList } from '../../services/api';
import { MediaGroup, MediaItem } from '../../types/types';
import { Calendar, ChevronRight, ChevronLeft, FilmIcon, Image } from 'lucide-react';
import Loading from '../UI/Loading';
import { transformUrl } from '../../utils/transformUrl';

const CameraGalleryView: React.FC = () => {
  const { cameraId } = useParams<{ cameraId: string }>();
  const [mediaGroups, setMediaGroups] = useState<MediaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraName, setCameraName] = useState('Camera');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMedia = async () => {
      if (!cameraId) return;
      
      try {
        setLoading(true);
        const data = await getMediaList(30, cameraId); // Get media from last 30 days
        setMediaGroups(data);
        
        // Set camera name from the first media group if available
        if (data.length > 0 && data[0].items.length > 0) {
          // Extract camera name from metadata if available
          const firstItem = data[0].items[0];
          if (firstItem.metadata && (firstItem.metadata as any).camera_name) {
            setCameraName((firstItem.metadata as any).camera_name);
          }
        }
        
        setError(null);
      } catch (err) {
        setError('Failed to load media');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [cameraId]);

  const handleMediaClick = (mediaItem: MediaItem) => {
    navigate(`/gallery/media/${mediaItem.id}`);
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

  if (mediaGroups.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-24 h-24 flex items-center justify-center rounded-full bg-gray-100 mb-4">
          <Calendar size={32} className="text-gray-400" />
        </div>
        <h3 className="text-xl font-medium mb-2">No media found for this camera</h3>
        <p className="text-gray-500 mb-4">Capture photos or videos to see them here</p>
        <div className="flex justify-center gap-4">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => navigate('/gallery')}
          >
            Back to Cameras
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => navigate('/')}
          >
            Go to Live View
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/gallery')}
            className="flex items-center gap-1 text-blue-500 hover:underline"
          >
            <ChevronLeft size={16} />
            <span>All Cameras</span>
          </button>
          <span className="text-gray-500">/</span>
          <h1 className="text-xl font-semibold">{cameraName}</h1>
        </div>
        
        <button
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => navigate('/')}
        >
          Back to Camera
        </button>
      </div>

      {mediaGroups.map((group) => (
        <div key={group.date} className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
            <h2 className="font-medium">{formatDate(group.date)}</h2>
            <span className="text-sm text-gray-500">{group.count} items</span>
          </div>
          
          <div className="p-4">
            <div className="gallery-grid">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="gallery-item"
                  onClick={() => handleMediaClick(item)}
                >
                  <img
                    src={transformUrl(item.thumbnail)}
                    alt={item.filename}
                    className="gallery-thumbnail"
                  />
                  {item.type === 'video' && (
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 p-1 rounded">
                      <FilmIcon size={16} className="text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper for date formatting
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
};

export default CameraGalleryView;