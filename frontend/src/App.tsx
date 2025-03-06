// frontend/src/App.tsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LiveView from './components/CameraView/LiveView';
import CameraGallery from './components/Gallery/CameraGallery';
import CameraGalleryView from './components/Gallery/CameraGalleryView';
import MediaView from './components/Gallery/MediaView';
import { CameraProvider } from './contexts/CameraContext';

const App: React.FC = () => {
  return (
    <CameraProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LiveView />} />
          <Route path="gallery" element={<CameraGallery />} />
          <Route path="gallery/camera/:cameraId" element={<CameraGalleryView />} />
          <Route path="gallery/media/:mediaId" element={<MediaView />} />
        </Route>
      </Routes>
    </CameraProvider>
  );
};

export default App;