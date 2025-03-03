// frontend/src/components/Layout/Footer.tsx
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-200 py-3 text-center text-gray-600 text-sm">
      <p>CamStream © {new Date().getFullYear()}</p>
    </footer>
  );
};

export default Footer;