import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import Button from '../components/Button';
import './LandingPage.css';

const SPECIES = ['Koala', 'Wombat', 'Quokka', 'Echidna', 'Platypus', 'Dingo', 'Wallaby', 'Cassowary'];

const LandingPage = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const orbRef = useRef(null);

  // Parallax orb on mouse move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!orbRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      orbRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="landing">
      {/* Ambient orb */}
      <div className="landing__orb" ref={orbRef} />

      {/* Hero */}
      <section className="landing__hero">
        <div className="landing__hero-inner stagger">
          <div className="landing__badge animate-fade-up">
            <span className="landing__badge-dot" />
            Australian Wildlife Intelligence Platform
          </div>

          <h1 className="landing__title animate-fade-up">
            Every species.<br />
            <span className="landing__title-accent">
              <span className="landing__title-serif">Identified.</span> Catalogued.
            </span><br />
            Protected.
          </h1>

          <p className="landing__subtitle animate-fade-up">
            Upload wildlife media and let our AI instantly identify, tag, and
            organise every species — from the Great Barrier Reef to the Red Centre.
          </p>

          <div className="landing__cta animate-fade-up">
            {auth.isAuthenticated ? (
              <Button size="lg" onClick={() => navigate('/upload')}>
                Go to Dashboard →
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={() => navigate('/signup')}>
                  Start for free
                </Button>
                <Button size="lg" variant="secondary" onClick={() => navigate('/signin')}>
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Floating species tags */}
        <div className="landing__tags">
          {SPECIES.map((s, i) => (
            <span
              key={s}
              className="landing__tag"
              style={{ animationDelay: `${i * 0.4}s` }}
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Feature cards */}
      <section className="landing__features">
        {[
          {
            icon: '⬡',
            title: 'ML Auto-Tagging',
            desc: 'Pre-trained models identify species the moment you upload. No manual work.',
          },
          {
            icon: '◈',
            title: 'Smart Search',
            desc: 'Query by species, minimum counts, thumbnail URL, or upload a photo to search.',
          },
          {
            icon: '◎',
            title: 'Tag Alerts',
            desc: 'Subscribe to species tags. Get notified the moment a new sighting is added.',
          },
          {
            icon: '⬖',
            title: 'Multi-Cloud',
            desc: 'Built across AWS and GCP for high availability, zero vendor lock-in.',
          },
        ].map((f, i) => (
          <div
            key={f.title}
            className="landing__feature-card animate-fade-up"
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            <span className="landing__feature-icon">{f.icon}</span>
            <h3 className="landing__feature-title">{f.title}</h3>
            <p className="landing__feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default LandingPage;