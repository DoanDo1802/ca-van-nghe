import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { EditorApp } from './editor/EditorApp';
import { WebGamePlayer } from './editor/WebGamePlayer';
import './index.css';

const LegacyApp = lazy(() => import('./App.jsx'));

const isLegacyMode =
  window.location.search.includes('legacy=1') ||
  window.location.pathname === '/legacy';

const isStandalonePlay =
  window.location.search.includes('play=1') ||
  window.location.pathname === '/play';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLegacyMode ? (
      <Suspense
        fallback={
          <div className="w-screen h-screen bg-[#0c0e14] text-amber-200 flex items-center justify-center text-sm">
            Đang tải game gốc (Three.js)...
          </div>
        }
      >
        <LegacyApp />
      </Suspense>
    ) : isStandalonePlay ? (
      <WebGamePlayer />
    ) : (
      <EditorApp />
    )}
  </React.StrictMode>,
);
