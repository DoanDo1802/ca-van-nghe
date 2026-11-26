import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const EditorApp = lazy(() =>
  import('./editor/EditorApp').then((m) => ({ default: m.EditorApp }))
);
const CharacterStudioApp = lazy(() =>
  import('./editor/CharacterStudioApp').then((m) => ({ default: m.CharacterStudioApp }))
);
const WebGamePlayer = lazy(() =>
  import('./editor/WebGamePlayer').then((m) => ({ default: m.WebGamePlayer }))
);
const AdminDashboard = lazy(() =>
  import('./editor/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

const isStudioMode =
  window.location.search.includes('studio=1') ||
  window.location.pathname === '/studio';

const isEditorMode =
  window.location.search.includes('editor=1') ||
  window.location.pathname === '/editor';

const isAdminMode = window.location.pathname === '/admin';

const Loader: React.FC<{ label: string }> = ({ label }) => (
  <div className="w-screen h-screen bg-[#121212] text-neutral-300 flex items-center justify-center text-sm">
    {label}
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminMode ? (
      <Suspense fallback={<Loader label="Đang tải trang Admin..." />}>
        <AdminDashboard />
      </Suspense>
    ) : isStudioMode ? (
      <Suspense fallback={<Loader label="Đang tải Character & Animation Studio..." />}>
        <CharacterStudioApp />
      </Suspense>
    ) : isEditorMode ? (
      <Suspense fallback={<Loader label="Đang tải 3D Game Editor (Admin)..." />}>
        <EditorApp />
      </Suspense>
    ) : (
      <Suspense fallback={<Loader label="Đang tải Ca Văn Nghệ..." />}>
        <WebGamePlayer />
      </Suspense>
    )}
  </React.StrictMode>
);
