import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFeed,
  getMyFiles,
  getMediaUrl,
  getUserEmail,
  getUserSub,
  getSubscriptions,
  createSubscription,
  deleteSubscription,
} from "../utils/api";
import ImageModal from "../components/ImageModal";
import UploadWidget from "../components/UploadWidget";
import "./HomePage.css";

// SVG Icons
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

const SpeciesAlerts = ({ onToast }) => {
  const [open, setOpen] = useState(false);
  const [species, setSpecies] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const email = getUserEmail();

  // Fetch subscriptions and return whether the email endpoint is still
  // unconfirmed (SNS reports this as a "PendingConfirmation" ARN).
  const refresh = async () => {
    const data = await getSubscriptions();
    const list = parseSubscriptions(data);
    const arn = data?.subscriptionArn;
    const isPending =
      list.length > 0 && (!arn || arn === "PendingConfirmation");
    setSpecies(list);
    return isPending;
  };

  const load = async () => {
    try {
      await refresh();
    } catch {
      setSpecies([]);
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
      return await refresh();
    } catch (e) {
      setError(e.message || "Could not update alerts.");
      return false;
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
    const isPending = await persist(next);
    if (isPending) {
      onToast?.(
        'Check your inbox (and spam) and click "Confirm subscription" in the AWS email to start receiving alerts.',
      );
    } else {
      onToast?.(
        `You're now watching "${val}" - we'll email you when it's tagged.`,
      );
    }
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
            Get an email at{" "}
            <span className="alerts__email">{email || "your address"}</span>{" "}
            whenever a new file is tagged with a species you watch.
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

          {error && <p className="alerts__error">{error}</p>}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value }) => (
  <div className="home-stat">
    <span className="home-stat__label">{label}</span>
    <span className="home-stat__value">{value}</span>
  </div>
);

// Recent-uploads card. The "+N" chip expands to reveal every detected species
const RecentCard = ({ file, onView }) => {
  const [expanded, setExpanded] = useState(false);
  const tagEntries = Object.entries(file.tagCounts || {});
  const shown = expanded ? tagEntries : tagEntries.slice(0, 2);
  return (
    <div className="home-grid-card" onClick={onView} role="button" tabIndex={0}>
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
      <div className="home-grid-card__tags">
        {tagEntries.length > 0 ? (
          <>
            {shown.map(([tag, count]) => (
              <span key={tag} className="home-grid-card__tag">
                {tag}
                <em>×{count}</em>
              </span>
            ))}
            {tagEntries.length > 2 && (
              <button
                type="button"
                className="home-grid-card__tag home-grid-card__tag--toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
              >
                {expanded ? "show less" : `+${tagEntries.length - 2}`}
              </button>
            )}
          </>
        ) : (
          <span className="home-grid-card__tag home-grid-card__tag--none">
            No species
          </span>
        )}
      </div>
    </div>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const [feedFiles, setFeedFiles] = useState([]); // everyone's uploads
  const [myFiles, setMyFiles] = useState([]); // signed-in user's uploads
  const [feedScope, setFeedScope] = useState("all"); // 'all' | 'yours'
  const [showAllObserver, setShowAllObserver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalUrl, setModalUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({
    yourUploads: 0,
    speciesTagged: 0,
    communityObs: 0,
    activeAlerts: 0,
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 7000);
  };

  const openMedia = async (file) => {
    try {
      setModalUrl(await getMediaUrl(file.originalUrl));
    } catch {
      setModalUrl(file.originalUrl);
    }
  };

  // All stats are derived client-side from existing endpoints
  const loadHome = async () => {
    try {
      const [feed, mine, subs] = await Promise.all([
        getFeed(),
        getMyFiles().catch(() => []),
        getSubscriptions().catch(() => null),
      ]);
      setFeedFiles(feed);
      setMyFiles(mine);
      const species = new Set();
      mine.forEach((f) =>
        Object.keys(f.tagCounts || {}).forEach((t) => species.add(t)),
      );
      setStats({
        yourUploads: mine.length,
        speciesTagged: species.size,
        communityObs: feed.length,
        activeAlerts: parseSubscriptions(subs).length,
      });
    } catch {
      setFeedFiles([]);
      setMyFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHome();
  }, []);

  // "Observer posts" = other people's uploads only; "Your posts" = your own.
  const mySub = getUserSub();
  const observerFiles = feedFiles.filter((f) => f.ownerSub !== mySub);
  const recentFiles =
    feedScope === "yours"
      ? myFiles
      : showAllObserver
        ? observerFiles
        : observerFiles.slice(0, 10);

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
          <SpeciesAlerts onToast={showToast} />
        </div>

        {/* Stats */}
        <div className="home-stats animate-fade-up">
          <StatCard label="Your uploads" value={stats.yourUploads} />
          <StatCard label="Species you've tagged" value={stats.speciesTagged} />
          <StatCard
            label="Community observations"
            value={stats.communityObs.toLocaleString()}
          />
          <StatCard label="Active alerts" value={stats.activeAlerts} />
        </div>

        {/* Upload */}
        <div className="home-upload animate-fade-up">
          <div className="home-recent__header">
            <h2 className="home-recent__title">Upload media</h2>
            <span className="home-upload__hint">
              Auto-tagged with detected species on upload
            </span>
          </div>
          <UploadWidget onUploaded={loadHome} />
        </div>

        {/* Recent uploads */}
        <div className="home-recent animate-fade-up">
          <div className="home-recent__header">
            <h2 className="home-recent__title">Recent uploads</h2>
            <div className="home-recent__actions">
              <div className="home-feed-toggle">
                <button
                  className={feedScope === "all" ? "active" : ""}
                  onClick={() => setFeedScope("all")}
                >
                  Observer posts
                </button>
                <button
                  className={feedScope === "yours" ? "active" : ""}
                  onClick={() => setFeedScope("yours")}
                >
                  Your posts
                </button>
              </div>
              {feedScope === "yours"
                ? myFiles.length > 0 && (
                    <button
                      className="home-recent__view-all"
                      onClick={() => navigate("/files")}
                    >
                      Edit posts
                    </button>
                  )
                : observerFiles.length > 8 && (
                    <button
                      className="home-recent__view-all"
                      onClick={() => setShowAllObserver((v) => !v)}
                    >
                      {showAllObserver
                        ? "Show less"
                        : `View all (${observerFiles.length})`}
                    </button>
                  )}
            </div>
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
              {recentFiles.map((file) => (
                <RecentCard
                  key={file.fileId}
                  file={file}
                  onView={() => openMedia(file)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {modalUrl && (
        <ImageModal url={modalUrl} onClose={() => setModalUrl(null)} />
      )}

      {toast && (
        <div className="toast animate-fade-up" role="status">
          {toast}
          <button className="toast__close" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default HomePage;
