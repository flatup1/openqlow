import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnimationStudioPage } from './pages/AnimationStudioPage';
import './styles/index.css';

const el = document.getElementById('root');
if (!el) throw new Error('root element not found');
createRoot(el).render(
  <React.StrictMode>
    <AnimationStudioPage />
  </React.StrictMode>,
);
