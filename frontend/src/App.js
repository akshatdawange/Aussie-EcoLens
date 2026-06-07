import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage  from './pages/LandingPage';
import SignInPage   from './pages/SignInPage';
import SignUpPage   from './pages/SignUpPage';
import SearchPage   from './pages/SearchPage';
import MyFilesPage  from './pages/MyFilesPage';
import NotFoundPage from './pages/NotFoundPage';
import HomePage from './pages/HomePage';

const App = () => {
  const auth = useAuth();
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"       element={<LandingPage />} />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/upload" element={<Navigate to="/home" replace />} />
        <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="/files"  element={<ProtectedRoute><MyFilesPage /></ProtectedRoute>} />
        <Route path="/NotFoundPage"       element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;