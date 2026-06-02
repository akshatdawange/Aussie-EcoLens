import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage  from './pages/LandingPage';
import SignInPage   from './pages/SignInPage';
import SignUpPage   from './pages/SignUpPage';
import UploadPage   from './pages/UploadPage';
import SearchPage   from './pages/SearchPage';
import MyFilesPage  from './pages/MyFilesPage';
import NotFoundPage from './pages/NotFoundPage';

const App = () => {
  const auth = useAuth();
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"       element={<LandingPage />} />
        <Route path="/signin" element={auth.isAuthenticated ? <Navigate to="/upload" replace /> : <SignInPage />} />
        <Route path="/signup" element={auth.isAuthenticated ? <Navigate to="/upload" replace /> : <SignUpPage />} />
        <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/files"  element={<ProtectedRoute><MyFilesPage /></ProtectedRoute>} />
        <Route path="*"       element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;