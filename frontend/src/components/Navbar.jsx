import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { buildLogoutUrl } from '../config/auth';
import './Navbar.css';

const NAV_LINKS = [
  { path: '/upload', label: 'Upload'   },
  { path: '/search', label: 'Search'   },
  { path: '/files',  label: 'My Files' },
];

const Navbar = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSignOut = () => {
    const logoutUrl = buildLogoutUrl();
    auth.removeUser();
    if (logoutUrl) {
      window.location.href = logoutUrl;
    } else {
      navigate('/');
    }
  };

  const firstName = auth.user?.profile?.given_name || 'User';

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner">

        {/* Logo */}
        <button className="navbar__logo" onClick={() => navigate('/')}>
          <span className="navbar__logo-icon">◈</span>
          <span className="navbar__logo-text">
            Aussie<span className="navbar__logo-accent">EcoLens</span>
          </span>
        </button>

        {/* Desktop nav links — only shown when logged in */}
        {auth.isAuthenticated && (
          <div className="navbar__links">
            {NAV_LINKS.map(({ path, label }) => (
              <button
                key={path}
                className={`navbar__link ${location.pathname === path ? 'navbar__link--active' : ''}`}
                onClick={() => navigate(path)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Right side */}
        <div className="navbar__actions">
          {auth.isAuthenticated ? (
            <>
              <div className="navbar__user">
                <span className="navbar__user-avatar">
                  {firstName.charAt(0).toUpperCase()}
                </span>
                <span className="navbar__user-name">{firstName}</span>
              </div>
              <button className="navbar__signout" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button className="navbar__signin-btn" onClick={() => navigate('/signin')}>
              Sign in
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className={`navbar__hamburger ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && auth.isAuthenticated && (
        <div className="navbar__mobile-menu animate-fade-in">
          {NAV_LINKS.map(({ path, label }) => (
            <button
              key={path}
              className={`navbar__mobile-link ${location.pathname === path ? 'active' : ''}`}
              onClick={() => { navigate(path); setMenuOpen(false); }}
            >
              {label}
            </button>
          ))}
          <button
            className="navbar__mobile-link navbar__mobile-signout"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;