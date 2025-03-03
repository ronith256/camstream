// frontend/src/components/Gallery/Gallery.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMediaList } from '../../services/api';
import { MediaGroup, MediaItem } from '../../types/types';
import { Calendar, ChevronRight, FilmIcon, Image } from 'lucide-react';
import Loading from '../UI/Loading';
import { transformUrl } from '../../utils/transformUrl';

const Gallery: React.FC = () => {
  const [mediaGroups, setMediaGroups] = useState<MediaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        const data = await getMediaList(30); // Get media from last 30 days
        setMediaGroups(data);
        setError(null);
      } catch (err) {
        setError('Failed to load media');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, []);

  const handleMediaClick = (mediaItem: MediaItem) => {
    navigate(`/gallery/${mediaItem.id}`);
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
        <h3 className="text-xl font-medium mb-2">No media found</h3>
        <p className="text-gray-500 mb-4">Capture photos or videos to see them here</p>
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

export default Gallery;