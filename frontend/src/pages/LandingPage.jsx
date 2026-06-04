import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Button from '../components/Button';
import InputField from '../components/InputField';
import './LandingPage.css';

const SPECIES = ['Koala', 'Wombat', 'Quokka', 'Echidna', 'Platypus', 'Dingo', 'Wallaby', 'Cassowary'];

const LandingPage = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const orbRef = useRef(null);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'

  // Sign in state
  const [signInForm, setSignInForm] = useState({ email: '', password: '' });
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);

  // Sign up state
  const [signUpForm, setSignUpForm] = useState({
    firstName: '', lastName: '', email: '', password: ''
  });
  const [signUpError, setSignUpError] = useState('');
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) navigate('/upload');
  }, [auth.isAuthenticated, navigate]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!orbRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      orbRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  
  const handleSignIn = async (e) => {
  e.preventDefault();
  setSignInError('');
  setSignInLoading(true);
  try {
    const { CognitoIdentityProviderClient, InitiateAuthCommand } =
      await import('@aws-sdk/client-cognito-identity-provider');

    const client = new CognitoIdentityProviderClient({
      region: 'ap-southeast-2'
    });

    const response = await client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: signInForm.email,
        PASSWORD: signInForm.password,
      },
    }));

    const { IdToken, AccessToken, RefreshToken } = response.AuthenticationResult;
    sessionStorage.setItem('idToken', IdToken);
    sessionStorage.setItem('accessToken', AccessToken);
    sessionStorage.setItem('refreshToken', RefreshToken);
    navigate('/upload');
  } catch (err) {
    console.error(err);
    setSignInError('Invalid email or password. Please try again.');
  } finally {
    setSignInLoading(false);
  }
};
 

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignUpError('');
    setSignUpLoading(true);
    try {
      const { CognitoIdentityProviderClient, SignUpCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      const client = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });
      await client.send(new SignUpCommand({
        ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
        Username: signUpForm.email,
        Password: signUpForm.password,
        UserAttributes: [
          { Name: 'email',       Value: signUpForm.email },
          { Name: 'given_name',  Value: signUpForm.firstName },
          { Name: 'family_name', Value: signUpForm.lastName },
        ],
      }));
      setSignUpSuccess(true);
    } catch (err) {
      setSignUpError(err.message || 'Sign up failed.');
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing__orb" ref={orbRef} />

      <div className="landing__layout">

        {/* Left — Hero */}
        <div className="landing__left">
          <div className="landing__hero-content stagger">
            <div className="landing__badge animate-fade-up">
              <span className="landing__badge-dot" />
              Australian Wildlife Intelligence
            </div>

            <h1 className="landing__title animate-fade-up">
              Every species.<br />
              <span className="landing__title-accent">Identified.</span><br />
              Protected.
            </h1>

            <p className="landing__subtitle animate-fade-up">
              Upload wildlife media and let our AI instantly identify,
              tag, and organise every species across Australia.
            </p>

            {/* <div className="landing__features-list animate-fade-up">
              {[
                'Auto species detection on upload',
                'Search by animal, count, or photo',
                'Email alerts for new sightings',
                'Multi-cloud AWS + GCP infrastructure',
              ].map(f => (
                <div key={f} className="landing__feature-item">
                  <span className="landing__feature-check">✓</span>
                  {f}
                </div>
              ))}
            </div> */}
          </div>

          {/* Floating species tags */}
          <div className="landing__tags">
            {SPECIES.map((s, i) => (
              <span key={s} className="landing__tag" style={{ animationDelay: `${i * 0.4}s` }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Right — Auth Form */}
        <div className="landing__right">
          <div className="landing__auth-card animate-fade-up">

            {/* Mode toggle */}
            <div className="landing__auth-tabs">
              <button
                className={`landing__auth-tab ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => { setMode('signin'); setSignInError(''); }}
              >
                Sign in
              </button>
              <button
                className={`landing__auth-tab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => { setMode('signup'); setSignUpError(''); setSignUpSuccess(false); }}
              >
                Create account
              </button>
            </div>

            {/* Sign In Form */}
            {mode === 'signin' && (
              <form className="landing__auth-form" onSubmit={handleSignIn}>
                <InputField
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={signInForm.email}
                  onChange={e => setSignInForm(p => ({ ...p, email: e.target.value }))}
                  required
                />
                <InputField
                  label="Password"
                  type="password"
                  placeholder="Your password"
                  value={signInForm.password}
                  onChange={e => setSignInForm(p => ({ ...p, password: e.target.value }))}
                  required
                />
                {signInError && <p className="landing__auth-error">{signInError}</p>}
                <Button type="submit" variant="primary" size="lg" fullWidth loading={signInLoading}>
                  Sign in
                </Button>
              </form>
            )}

            {/* Sign Up Form */}
            {mode === 'signup' && !signUpSuccess && (
              <form className="landing__auth-form" onSubmit={handleSignUp}>
                <div className="landing__name-row">
                  <InputField
                    label="First name"
                    placeholder="Mark"
                    value={signUpForm.firstName}
                    onChange={e => setSignUpForm(p => ({ ...p, firstName: e.target.value }))}
                    required
                  />
                  <InputField
                    label="Last name"
                    placeholder="Brown"
                    value={signUpForm.lastName}
                    onChange={e => setSignUpForm(p => ({ ...p, lastName: e.target.value }))}
                    required
                  />
                </div>
                <InputField
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={signUpForm.email}
                  onChange={e => setSignUpForm(p => ({ ...p, email: e.target.value }))}
                  required
                />
                <InputField
                  label="Password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={signUpForm.password}
                  onChange={e => setSignUpForm(p => ({ ...p, password: e.target.value }))}
                  required
                />
                {signUpError && <p className="landing__auth-error">{signUpError}</p>}
                <Button type="submit" variant="primary" size="lg" fullWidth loading={signUpLoading}>
                  Create account
                </Button>
              </form>
            )}

            {/* Sign Up Success */}
            {mode === 'signup' && signUpSuccess && (
              <div className="landing__auth-success">
                <span className="landing__auth-success-icon">✓</span>
                <p>Check your email to verify your account, then sign in.</p>
                <Button variant="ghost" size="md" fullWidth onClick={() => setMode('signin')}>
                  Back to sign in
                </Button>
              </div>
            )}

            <p className="landing__auth-note">Secured by AWS Cognito</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;