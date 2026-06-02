import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Button from '../components/Button';
import './AuthPages.css';

const SignInPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-up">
        {/* Header */}
        <div className="auth-card__header">
          <button className="auth-logo" onClick={() => navigate('/')}>
            <span className="auth-logo__icon">◈</span>
            <span>Aussie<span style={{color:'var(--accent)'}}>EcoLens</span></span>
          </button>
          <h1 className="auth-card__title">Welcome back</h1>
          <p className="auth-card__subtitle">
            Sign in to your account to continue cataloguing Australia's wildlife.
          </p>
        </div>

        {/* Sign in button — uses Cognito Hosted UI */}
        <div className="auth-card__body">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSignIn}
          >
            Continue with Cognito →
          </Button>

          <div className="auth-divider">
            <span>Don't have an account?</span>
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => navigate('/signup')}
          >
            Create account
          </Button>
        </div>

        {/* Footer note */}
        <p className="auth-card__note">
          Protected by AWS Cognito. Your credentials are never stored by this app.
        </p>
      </div>

      {/* Decorative side panel */}
      <div className="auth-panel">
        <div className="auth-panel__content">
          <blockquote className="auth-panel__quote">
            <span className="auth-panel__quote-mark">"</span>
            Australia holds 10% of the world's biodiversity.
            Every observation counts.
          </blockquote>
          <div className="auth-panel__stat-grid">
            {[
              { n: '300+', label: 'Species tracked' },
              { n: '2 clouds', label: 'Infrastructure' },
              { n: '< 3s',  label: 'AI tagging time' },
            ].map(s => (
              <div key={s.label} className="auth-panel__stat">
                <span className="auth-panel__stat-n">{s.n}</span>
                <span className="auth-panel__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;