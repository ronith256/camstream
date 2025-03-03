// frontend/src/components/Layout/Header.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, Grid, Settings } from 'lucide-react';

const Header: React.FC = () => {
  const location = useLocation();
  
  return (
    <header className="bg-gray-700 text-white shadow-md">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Camera size={24} />
            <h1 className="text-xl font-bold">CamStream</h1>
          </div>
          
          <nav>
            <ul className="flex space-x-4">
              <li>
                <Link
                  to="/"
                  className={`flex items-center px-3 py-1 rounded transition-colors ${
                    location.pathname === '/' ? 'bg-blue-500' : 'hover:bg-gray-600'
                  }`}
                >
                  <span>Live View</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/gallery"
                  className={`flex items-center px-3 py-1 rounded transition-colors ${
                    location.pathname.startsWith('/gallery') ? 'bg-blue-500' : 'hover:bg-gray-600'
                  }`}
                >
                  <span>Gallery</span>
                </Link>
              </li>
            </ul>
          </nav>
          
          <button className="p-2 rounded hover:bg-gray-600">
            <Settings size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;