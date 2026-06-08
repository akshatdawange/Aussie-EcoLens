import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import { cognitoConfig } from './config/auth';
import App from './App';
import './styles/globals.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <AuthProvider
      {...cognitoConfig}
      onSigninCallback={() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      <App />
    </AuthProvider>
  </React.StrictMode>
);