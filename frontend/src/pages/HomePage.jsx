import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFeed, getMediaUrl, getUserEmail,
  getSubscriptions, createSubscription, deleteSubscription,
} from "../utils/api";
import ImageModal from "../components/ImageModal";
import UploadWidget from "../components/UploadWidget";
import "./HomePage.css";

// SVG Icons - no emojis
const UploadIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const BellIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// The notifications API may return the watched species in a few shapes.
const parseSubscriptions = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((s) => (typeof s === "string" ? s : s.species || s.tag))
      .flat()
      .filter(Boolean);
  }
  if (Array.isArray(data.species)) return data.species;
  if (typeof data.species === "string") return [data.species];
  if (Array.isArray(data.tags)) return data.tags;
  if (Array.isArray(data.subscriptions)) {
    return data.subscriptions.flatMap((s) => s.species || s.tag || []);
  }
  return [];
};

const SpeciesAlerts = () => {
  const [open, setOpen] = useState(false);
  const [species, setSpecies] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const email = getUserEmail();

  const load = async () => {
    try {
      const data = await getSubscriptions();
      const list = parseSubscriptions(data);
      setSpecies(list);
      // SNS won't deliver until the email endpoint is confirmed; the backend
      // reports this as a "PendingConfirmation" ARN.
      const arn = data?.subscriptionArn;
      setPending(list.length > 0 && (!arn || arn === "PendingConfirmation"));
    } catch {
      setSpecies([]);
      setPending(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const persist = async (list) => {
    setBusy(true);
    setError("");
    try {
      if (list.length === 0) {
        await deleteSubscription();
      } else {
        await createSubscription(email, list);
      }
      await load();
    } catch (e) {
      setError(e.message || "Could not update alerts.");
    } finally {
      setBusy(false);
    }
  };

  const addSpecies = async () => {
    const val = input.trim().toLowerCase();
    if (!val || species.includes(val)) {
      setInput("");
      return;
    }
    const next = [...species, val];
    setSpecies(next);
    setInput("");
    await persist(next);
  };

  const removeSpecies = async (tag) => {
    const next = species.filter((s) => s !== tag);
    setSpecies(next);
    await persist(next);
  };

  return (
    <div className="alerts">
      <button
        className={`alerts__trigger ${species.length > 0 ? "alerts__trigger--active" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        <span>Species alerts</span>
        {species.length > 0 && (
          <span className="alerts__badge">{species.length}</span>
        )}
      </button>

      {open && (
        <div className="alerts__panel animate-fade-in">
          <p className="alerts__title">Email me when new media is tagged</p>
          <p className="alerts__sub">
            Get an email at {email || "your address"} whenever a new file is
            tagged with a species you watch.
          </p>

          <div className="alerts__input-row">
            <input
              className="alerts__input"
              placeholder="e.g. koala"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSpecies()}
            />
            <button
              className="alerts__add"
              onClick={addSpecies}
              disabled={busy}
            >
              Add
            </button>
          </div>

          {species.length > 0 ? (
            <div className="alerts__chips">
              {species.map((tag) => (
                <span key={tag} className="alerts__chip">
                  {tag}
                  <button onClick={() => removeSpecies(tag)} disabled={busy}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="alerts__empty">No species watched yet.</p>
          )}

          {pending && (
            <p className="alerts__pending">
              Almost there: check your inbox (and spam) for an AWS subscription
              confirmation email and click "Confirm subscription". Alerts only
              start once confirmed.
            </p>
          )}

          {error && <p className="alerts__error">{error}</p>}
        </div>
      )}
    </div>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const [recentFiles, setRecentFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalUrl, setModalUrl] = useState(null);

  const loadFeed = async () => {
    try {
      const data = await getFeed();
      setRecentFiles(data.slice(0, 8));
    } catch {
      setRecentFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  return (
    <div className="home-page">
      <div className="home-page__inner">
        {/* Header */}
        <div className="home-header animate-fade-up">
          <div className="home-header__text">
            <p className="home-header__label">Welcome back</p>
            <h1 className="home-header__title">
              Your wildlife{" "}
              <span className="home-header__accent">observatory</span>
            </h1>
            <p className="home-header__subtitle">
              Track, tag and search Australian species across your media
              library.
            </p>
          </div>
          <SpeciesAlerts />
        </div>

        {/* Upload */}
        <div className="home-upload animate-fade-up">
          <div className="home-recent__header">
            <h2 className="home-recent__title">Upload media</h2>
            <span className="home-upload__hint">
              Auto-tagged with detected species on upload
            </span>
          </div>
          <UploadWidget onUploaded={loadFeed} />
        </div>

        {/* Recent uploads */}
        <div className="home-recent animate-fade-up">
          <div className="home-recent__header">
            <h2 className="home-recent__title">Recent uploads</h2>
            {recentFiles.length > 0 && (
              <button
                className="home-recent__view-all"
                onClick={() => navigate("/files")}
              >
                View all
              </button>
            )}
          </div>

          {loading && (
            <div className="home-loading">
              <div className="home-spinner" />
              <span>Loading your files...</span>
            </div>
          )}

          {!loading && recentFiles.length === 0 && (
            <div className="home-empty">
              <div className="home-empty__icon">
                <UploadIcon />
              </div>
              <p className="home-empty__text">No uploads yet.</p>
              <button
                className="home-empty__cta"
                onClick={() => navigate("/upload")}
              >
                Upload your first file
              </button>
            </div>
          )}

          {!loading && recentFiles.length > 0 && (
            <div className="home-grid">
              {recentFiles.map((file) => {
                const tagEntries = Object.entries(file.tagCounts || {});
                return (
                  <div
                    key={file.fileId}
                    className="home-grid-card"
                    onClick={async () => {
                      try {
                        const url = await getMediaUrl(file.originalUrl);
                        setModalUrl(url);
                      } catch {
                        setModalUrl(file.originalUrl);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="home-grid-card__thumb">
                      {file.thumbnailUrl ? (
                        <img
                          src={file.thumbnailUrl}
                          alt="Wildlife observation"
                          loading="lazy"
                        />
                      ) : (
                        <span className="home-grid-card__video-icon">▶</span>
                      )}
                      <div className="home-grid-card__overlay">View</div>
                    </div>
                    {tagEntries.length > 0 && (
                      <div className="home-grid-card__tags">
                        {tagEntries.slice(0, 2).map(([tag, count]) => (
                          <span key={tag} className="home-grid-card__tag">
                            {tag}
                            <em>×{count}</em>
                          </span>
                        ))}
                        {tagEntries.length > 2 && (
                          <span className="home-grid-card__tag">
                            +{tagEntries.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalUrl && (
        <ImageModal url={modalUrl} onClose={() => setModalUrl(null)} />
      )}
    </div>
  );
};

export default HomePage;
