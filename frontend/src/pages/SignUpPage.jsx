import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Button from '../components/Button';
import './AuthPages.css';

const SignUpPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  // Cognito Hosted UI handles sign-up too — redirect to signinRedirect
  // which includes a link to sign up on the hosted UI
  const handleSignUp = () => {
    auth.signinRedirect({
      extraQueryParams: { screen_hint: 'signup' },
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-up">
        <div className="auth-card__header">
          <button className="auth-logo" onClick={() => navigate('/')}>
            <span className="auth-logo__icon">◈</span>
            <span>Aussie<span style={{color:'var(--accent)'}}>EcoLens</span></span>
          </button>
          <h1 className="auth-card__title">Join EcoLens</h1>
          <p className="auth-card__subtitle">
            Create your free account and start contributing to Australian wildlife research.
          </p>
        </div>

        <div className="auth-card__body">
          {/* What to expect */}
          <ul className="auth-perks">
            {[
              'Automatic species detection on upload',
              'Search across your entire media library',
              'Email alerts for new sightings',
              'Secure cloud storage across AWS + GCP',
            ].map(perk => (
              <li key={perk} className="auth-perk">
                <span className="auth-perk__check">✓</span>
                {perk}
              </li>
            ))}
          </ul>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSignUp}
          >
            Create account →
          </Button>

          <div className="auth-divider">
            <span>Already have an account?</span>
          </div>

          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => navigate('/signin')}
          >
            Sign in instead
          </Button>
        </div>

        <p className="auth-card__note">
          By creating an account, you agree that observation data may be used for
          environmental research purposes.
        </p>
      </div>

      {/* Decorative panel */}
      <div className="auth-panel">
        <div className="auth-panel__content">
          <blockquote className="auth-panel__quote">
            <span className="auth-panel__quote-mark">"</span>
            Citizen science is reshaping how we understand ecosystems.
            Your photos matter.
          </blockquote>
          <div className="auth-panel__stat-grid">
            {[
              { n: 'Free',   label: 'Forever' },
              { n: 'Auto',   label: 'AI tagging' },
              { n: 'Secure', label: 'Cognito auth' },
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

export default SignUpPage;