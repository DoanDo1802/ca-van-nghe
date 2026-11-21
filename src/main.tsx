import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const EditorApp = lazy(() =>
  import('./editor/EditorApp').then((m) => ({ default: m.EditorApp }))
);
const WebGamePlayer = lazy(() =>
  import('./editor/WebGamePlayer').then((m) => ({ default: m.WebGamePlayer }))
);
const LegacyApp = lazy(() => import('./App.jsx'));

const isLegacyMode =
  window.location.search.includes('legacy=1') ||
  window.location.pathname === '/legacy';

const isStandalonePlay =
  window.location.search.includes('play=1') ||
  window.location.pathname === '/play';

const Loader: React.FC<{ label: string }> = ({ label }) => (
  <div className="w-screen h-screen bg-[#0c0e14] text-amber-200 flex items-center justify-center text-sm">
    {label}
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLegacyMode ? (
      <Suspense fallback={<Loader label="Đang tải game gốc (Three.js)..." />}>
        <LegacyApp />
      </Suspense>
    ) : isStandalonePlay ? (
      <Suspense fallback={<Loader label="Đang tải Ca Văn Nghệ Player..." />}>
        <WebGamePlayer />
      </Suspense>
    ) : (
      <Suspense fallback={<Loader label="Đang tải 3D Game Editor..." />}>
        <EditorApp />
      </Suspense>
    )}
  </React.StrictMode>
);
