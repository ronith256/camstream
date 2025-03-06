// frontend/src/components/Gallery/MediaView.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getMediaItem } from '../../services/api';
import { MediaItem } from '../../types/types';
import { ArrowLeft, Download, Trash, Info, Camera } from 'lucide-react';
import Loading from '../UI/Loading';
import { transformUrl } from '../../utils/transformUrl';

const MediaView: React.FC = () => {
  const { mediaId } = useParams<{ mediaId: string }>();
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchMediaItem = async () => {
      if (!mediaId) return;
      
      try {
        setLoading(true);
        const data = await getMediaItem(mediaId);
        setMedia(data);
        setError(null);
      } catch (err) {
        setError('Failed to load media');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMediaItem();
  }, [mediaId]);

  // Determine where to navigate back to - either camera-specific gallery or main gallery
  const handleBack = () => {
    if (media?.camera_id) {
      navigate(`/gallery/camera/${media.camera_id}`);
    } else {
      navigate('/gallery');
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !media) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error || 'Media not found'}</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => navigate('/gallery')}
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <button
          className="flex items-center gap-1 text-blue-500 hover:underline"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          <span>Back to Gallery</span>
        </button>
        
        <div className="flex items-center gap-3">
          <a
            href={media.url}
            download={media.filename}
            className="flex items-center gap-1 text-green-500 hover:underline"
          >
            <Download size={16} />
            <span>Download</span>
          </a>
        </div>
      </div>

      <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
        {media.type === 'photo' ? (
          <img
            src={transformUrl(media.url)}
            alt={media.filename}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            src={transformUrl(media.url)}
            controls
            className="max-w-full max-h-full"
          />
        )}
      </div>

      <div className="mt-4 bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-medium mb-2">{media.filename}</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Type</p>
            <p className="font-medium">{media.type === 'photo' ? 'Photo' : 'Video'}</p>
          </div>
          
          <div>
            <p className="text-gray-500">Date</p>
            <p className="font-medium">{new Date(media.metadata.created_at).toLocaleString()}</p>
          </div>
          
          <div>
            <p className="text-gray-500">Resolution</p>
            <p className="font-medium">
              {media.metadata.resolution.width} x {media.metadata.resolution.height}
            </p>
          </div>
          
          <div>
            <p className="text-gray-500">Size</p>
            <p className="font-medium">{formatFileSize(media.metadata.size)}</p>
          </div>
          
          <div>
            <p className="text-gray-500">Camera</p>
            <p className="font-medium">
              {(media.metadata as any).camera_name || media.camera_id || 'Unknown'}
            </p>
          </div>
          
          {media.type === 'video' && media.metadata.duration && (
            <div>
              <p className="text-gray-500">Duration</p>
              <p className="font-medium">{formatDuration(media.metadata.duration)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper for file size formatting
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Helper for duration formatting
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default MediaView;