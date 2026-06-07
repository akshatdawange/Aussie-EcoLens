import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Navbar.css";

const NAV_LINKS = [
  { path: "/home", label: "Home" },
  { path: "/search", label: "Search" },
  { path: "/files", label: "My Uploads" },
];

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoggedIn = !!sessionStorage.getItem("idToken");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = () => {
    sessionStorage.clear();
    navigate("/");
  };

  return (
    <nav className={`navbar ${scrolled ? "navbar--scrolled" : ""}`}>
      <div className="navbar__inner">
        {/* Logo */}
        <button
          className="navbar__logo"
          onClick={() => navigate(isLoggedIn ? "/home" : "/")}
        >
          AussieEcoLens
        </button>

        {/* Desktop links - only when logged in */}
        {isLoggedIn && (
          <div className="navbar__links">
            {NAV_LINKS.map(({ path, label }) => (
              <button
                key={path}
                className={`navbar__link ${location.pathname === path ? "navbar__link--active" : ""}`}
                onClick={() => navigate(path)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Right actions */}
        <div className="navbar__actions">
          {isLoggedIn ? (
            <button className="navbar__signout" onClick={handleSignOut}>
              Sign out
            </button>
          ) : null}
        </div>

        {/* Mobile hamburger */}
        {isLoggedIn && (
          <button
            className={`navbar__hamburger ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        )}
      </div>

      {/* Mobile menu */}
      {menuOpen && isLoggedIn && (
        <div className="navbar__mobile-menu animate-fade-in">
          {NAV_LINKS.map(({ path, label }) => (
            <button
              key={path}
              className={`navbar__mobile-link ${location.pathname === path ? "active" : ""}`}
              onClick={() => {
                navigate(path);
                setMenuOpen(false);
              }}
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
