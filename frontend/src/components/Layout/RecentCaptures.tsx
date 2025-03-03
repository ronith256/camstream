// frontend/src/components/Layout/RecentCaptures.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMediaList } from '../../services/api';
import { MediaGroup, MediaItem } from '../../types/types';
import { FolderOpen, ChevronRight } from 'lucide-react';

const RecentCaptures: React.FC = () => {
  const [mediaGroups, setMediaGroups] = useState<MediaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRecentMedia = async () => {
      try {
        setLoading(true);
        const data = await getMediaList(7); // Get media from last 7 days
        setMediaGroups(data);
      } catch (error) {
        console.error('Failed to fetch recent captures:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentMedia();
  }, []);

  const handleViewAll = () => {
    navigate('/gallery');
  };

  const handleItemClick = (mediaItem: MediaItem) => {
    navigate(`/gallery/${mediaItem.id}`);
  };

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-gray-100 rounded-lg">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-300 rounded"></div>
              <div className="h-4 bg-gray-300 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mediaGroups.length === 0) {
    return (
      <div className="mt-4 p-4 bg-gray-100 rounded-lg text-center">
        <p className="text-gray-500">No recent captures</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium">Recent Captures</h2>
        <button
          onClick={handleViewAll}
          className="text-blue-500 hover:underline flex items-center"
        >
          <span>Browse All</span>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="space-y-4">
        {mediaGroups.slice(0, 3).map((group) => (
          <div key={group.date} className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
              <h3 className="font-medium">{formatGroupDate(group.date)}</h3>
              <span className="text-sm text-gray-500">{group.count} items</span>
            </div>
            
            <div className="p-3 grid grid-cols-3 gap-2">
              {group.items.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="aspect-square rounded overflow-hidden cursor-pointer"
                  onClick={() => handleItemClick(item)}
                >
                  <img
                    src={item.thumbnail}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              
              {group.count > 3 && (
                <div
                  className="aspect-square rounded bg-gray-200 flex items-center justify-center cursor-pointer"
                  onClick={() => navigate('/gallery')}
                >
                  <span className="text-lg font-medium text-gray-600">+{group.count - 3}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const formatGroupDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return 'This Week';
};

export default RecentCaptures;