import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import InputField from '../components/InputField';
import './AuthPages.css';

const SignUpPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { CognitoIdentityProviderClient, SignUpCommand } = await import('@aws-sdk/client-cognito-identity-provider');

      const client = new CognitoIdentityProviderClient({
        region: 'ap-southeast-2'
      });

      await client.send(new SignUpCommand({
        ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
        Username: form.email,
        Password: form.password,
        UserAttributes: [
          { Name: 'email',       Value: form.email },
          { Name: 'given_name',  Value: form.firstName },
          { Name: 'family_name', Value: form.lastName },
        ],
      }));

      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card animate-fade-up">
          <button className="auth-logo" onClick={() => navigate('/')}>
            AussieEcoLens
          </button>
          <div className="auth-card__header">
            <h1 className="auth-card__title">Check your email</h1>
            <p className="auth-card__subtitle">
              We sent a verification link to <strong>{form.email}</strong>.
              Verify your email then sign in.
            </p>
          </div>
          <div className="auth-card__body">
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/signin')}>
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-up">
        <button className="auth-logo" onClick={() => navigate('/')}>
          AussieEcoLens
        </button>

        <div className="auth-card__header">
          <h1 className="auth-card__title">Create account</h1>
          <p className="auth-card__subtitle">
            Join the Australian wildlife research community.
          </p>
        </div>

        <form className="auth-card__body" onSubmit={handleSignUp}>
          <div className="auth-name-row">
            <InputField
              label="First name"
              placeholder="Mark"
              value={form.firstName}
              onChange={update('firstName')}
              required
            />
            <InputField
              label="Last name"
              placeholder="Brown"
              value={form.lastName}
              onChange={update('lastName')}
              required
            />
          </div>

          <InputField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update('email')}
            required
          />

          <InputField
            label="Password"
            type="password"
            placeholder="Min 8 characters"
            value={form.password}
            onChange={update('password')}
            required
          />

          {error && <p className="auth-error">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
          >
            Create account
          </Button>

          <div className="auth-divider"><span>or</span></div>

          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => navigate('/signin')}
          >
            Sign in instead
          </Button>
        </form>

        <p className="auth-card__note">Secured by AWS Cognito</p>
      </div>
    </div>
  );
};

export default SignUpPage;