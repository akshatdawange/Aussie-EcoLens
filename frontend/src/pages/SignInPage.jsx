import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Button from '../components/Button';
import InputField from '../components/InputField';
import './AuthPages.css';

const SignInPage = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.signinResourceOwnerCredentials({
        username: email,
        password: password,
      });
      navigate('/upload');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-up">
        <button className="auth-logo" onClick={() => navigate('/')}>
          AussieEcoLens
        </button>

        <div className="auth-card__header">
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__subtitle">
            Continue to your wildlife observation dashboard.
          </p>
        </div>

        <form className="auth-card__body" onSubmit={handleSignIn}>
          <InputField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <InputField
            label="Password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="auth-error">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
          >
            Sign in
          </Button>

          <div className="auth-divider"><span>or</span></div>

          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => navigate('/signup')}
          >
            Create an account
          </Button>
        </form>

        <p className="auth-card__note">Secured by AWS Cognito</p>
      </div>
    </div>
  );
};

export default SignInPage;