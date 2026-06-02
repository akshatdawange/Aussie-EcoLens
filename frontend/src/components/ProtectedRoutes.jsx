import React from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate } from 'react-router-dom';

const LoadingScreen = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '20px',
    background: 'var(--bg-void)',
  }}>
    <div style={{
      width: '48px', height: '48px',
      border: '2px solid var(--border-soft)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <p style={{
      fontFamily: 'var(--font-display)', fontSize: '13px',
      color: 'var(--text-muted)', letterSpacing: '0.1em',
      textTransform: 'uppercase',
    }}>
      Authenticating...
    </p>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const auth = useAuth();
  if (auth.isLoading) return <LoadingScreen />;
  if (auth.error || !auth.isAuthenticated) return <Navigate to="/signin" replace />;
  return children;
};

export default ProtectedRoute;