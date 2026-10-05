import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { FoundationWorkspace } from './foundation/Workspace';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/foundation" replace />} />
        <Route path="/foundation" element={<FoundationWorkspace />} />
        <Route path="/candidate/*" element={<Navigate to="/foundation" replace />} />
        <Route path="/hiring-manager/*" element={<Navigate to="/foundation" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}
