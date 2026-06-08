import React, { useState } from "react";
import {
  searchBySpecies,
  searchByTagCounts,
  searchByImage,
  getFileByThumbnail,
  getMediaUrl,
  normalizeMedia,
  getFeed,
} from "../utils/api";
import Button from "../components/Button";
import InputField from "../components/InputField";
import ImageModal from "../components/ImageModal";
import "./SearchPage.css";

const SEARCH_MODES = [
  { id: "tags", label: "By Species Tags" },
  { id: "thumbnail", label: "By Thumbnail URL" },
  { id: "file", label: "By Uploaded Photo" },
];

// Every stored URL has the shape .../<ownerSub>/<fileId>/<filename>, so the
// fileId is the 2nd path segment - works for thumbnail, original, presigned.
const extractFileId = (url) => {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[1] : null;
  } catch {
    return null;
  }
};

// Search endpoints return slightly different envelopes (array, {files}, {results}...).
// Flatten to a list of normalised media records the cards can render reliably.
const toMediaList = (data) => {
  const raw = Array.isArray(data)
    ? data
    : data?.files ||
      data?.results ||
      data?.items ||
      data?.matches ||
      (data && (data.originalUrl || data.thumbnailUrl || data.url)
        ? [data]
        : []);
  return raw.map(normalizeMedia);
};

const SearchPage = () => {
  const [mode, setMode] = useState("tags");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);

  // Tags mode state
  const [tagInput, setTagInput] = useState("");
  const [tagCount, setTagCount] = useState("1");
  const [tagList, setTagList] = useState([]);

  // Thumbnail mode
  const [thumbUrl, setThumbUrl] = useState("");

  // File mode
  const [queryFile, setQueryFile] = useState(null);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (tagList.find((t) => t.tag === tag)) return;
    setTagList((prev) => [...prev, { tag, count: parseInt(tagCount) || 1 }]);
    setTagInput("");
    setTagCount("1");
  };

  const removeTag = (tag) =>
    setTagList((prev) => prev.filter((t) => t.tag !== tag));

  const handleSearch = async () => {
    setError("");
    setResults(null);
    setLoading(true);
    try {
      let data;
      if (mode === "tags") {
        if (!tagList.length) {
          setError("Add at least one tag.");
          setLoading(false);
          return;
        }
        const required = tagList.map((t) => ({
          tag: t.tag.toLowerCase(),
          count: t.count || 1,
        }));
        try {
          // Match against the tag counts shown on the cards - guarantees correct
          // AND + minimum-count behaviour. Uses substring matching so a common
          // name ("kookaburra") matches the full ML tag ("laughing kookaburra").
          const feed = await getFeed();
          data = feed.filter((f) => {
            const entries = Object.entries(f.tagCounts || {});
            return required.every((r) =>
              entries.some(
                ([k, c]) =>
                  (k.includes(r.tag) || r.tag.includes(k)) && c >= r.count,
              ),
            );
          });
        } catch {
          // Feed unavailable - fall back to the backend search API.
          if (required.length === 1 && required[0].count <= 1) {
            data = await searchBySpecies([required[0].tag]);
          } else {
            data = await searchByTagCounts(
              Object.fromEntries(required.map((r) => [r.tag, r.count])),
            );
          }
        }
      } else if (mode === "thumbnail") {
        if (!thumbUrl) {
          setError("Enter a thumbnail or image URL.");
          setLoading(false);
          return;
        }
        // Drop any presigned query string, then try the API on the clean URL.
        const cleaned = thumbUrl.trim().split("?")[0];
        let list = [];
        try {
          list = toMediaList(await getFileByThumbnail(cleaned));
        } catch {
          list = [];
        }
        // Fallback: resolve by the fileId in the URL path (tolerates full-size /
        // presigned URLs that don't match the stored thumbnail string exactly).
        if (!list.length) {
          const fileId = extractFileId(cleaned);
          if (fileId) {
            const feed = await getFeed();
            const match = feed.find((f) => f.fileId === fileId);
            if (match) list = [match];
          }
        }
        data = list;
      } else {
        if (!queryFile) {
          setError("Select a file.");
          setLoading(false);
          return;
        }
        data = await searchByImage(queryFile);
      }
      setResults(toMediaList(data));
    } catch (err) {
      setError(err.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-page">
      <div className="search-page__inner">
        <div className="page-header animate-fade-up">
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">
            Find wildlife media by species, URL, or photo.
          </p>
        </div>

        {/* Mode tabs */}
        <div className="search-tabs animate-fade-up">
          {SEARCH_MODES.map((m) => (
            <button
              key={m.id}
              className={`search-tab ${mode === m.id ? "active" : ""}`}
              onClick={() => {
                setMode(m.id);
                setResults(null);
                setError("");
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Query form */}
        <div className="search-form animate-fade-up">
          {/* Tags mode */}
          {mode === "tags" && (
            <div className="search-form__section">
              <div className="search-tag-input">
                <InputField
                  label="Species"
                  placeholder="e.g. koala"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                />
                <InputField
                  label="Min count"
                  type="number"
                  placeholder="1"
                  value={tagCount}
                  onChange={(e) => setTagCount(e.target.value)}
                />
                <Button variant="secondary" onClick={addTag}>
                  Add
                </Button>
              </div>

              {tagList.length > 0 && (
                <div className="search-tag-chips">
                  {tagList.map((t) => (
                    <span key={t.tag} className="search-tag-chip">
                      {t.tag}
                      {t.count > 1 && (
                        <span className="search-tag-chip__count">
                          ×{t.count}
                        </span>
                      )}
                      <button onClick={() => removeTag(t.tag)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="search-hint">
                Results must contain ALL tags with at least the specified count
                .
              </p>
            </div>
          )}

          {/* Thumbnail URL mode */}
          {mode === "thumbnail" && (
            <div className="search-form__section">
              <InputField
                label="Thumbnail or image URL"
                placeholder="https://..."
                value={thumbUrl}
                onChange={(e) => setThumbUrl(e.target.value)}
              />
              <p className="search-hint">
                Paste a thumbnail or full-size image URL (right-click an image
                &rarr; Copy image address). Returns the matching file.
              </p>
            </div>
          )}

          {/* File mode */}
          {mode === "file" && (
            <div className="search-form__section">
              <label className="input-label">Upload a photo to search by</label>
              <input
                type="file"
                accept="image/*"
                className="search-file-input"
                onChange={(e) => setQueryFile(e.target.files[0])}
              />
              {queryFile && (
                <p className="search-hint">Selected: {queryFile.name}</p>
              )}
            </div>
          )}

          {error && <p className="search-error">{error}</p>}

          <Button
            variant="primary"
            size="lg"
            onClick={handleSearch}
            loading={loading}
          >
            Search
          </Button>
        </div>

        {/* Results */}
        {results !== null && (
          <div className="search-results animate-fade-up">
            <div className="search-results__header">
              <span className="search-results__count">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </span>
            </div>

            {results.length === 0 ? (
              <div className="search-empty">
                <span>◎</span>
                <p>No media found matching your query.</p>
              </div>
            ) : (
              <div className="search-grid">
                {results.map((item, i) => (
                  <ResultCard
                    key={item.fileId || i}
                    item={item}
                    onClick={async () => {
                      const target = item.originalUrl || item.thumbnailUrl;
                      if (!target) return;
                      try {
                        setModalUrl(await getMediaUrl(target));
                      } catch {
                        setModalUrl(target);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modalUrl && (
        <ImageModal url={modalUrl} onClose={() => setModalUrl(null)} />
      )}
    </div>
  );
};

const ResultCard = ({ item, onClick }) => {
  const tagEntries = Object.entries(item.tagCounts || {});
  return (
    <div className="result-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="result-card__thumb">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt="Wildlife observation"
            loading="lazy"
          />
        ) : (
          <span className="result-card__placeholder">▶</span>
        )}
        <div className="result-card__overlay">
          <span>View full size</span>
        </div>
      </div>
      {tagEntries.length > 0 && (
        <div className="result-card__tags">
          {tagEntries.slice(0, 3).map(([tag, count]) => (
            <span key={tag} className="result-card__tag">
              {tag}
              <em>×{count}</em>
            </span>
          ))}
          {tagEntries.length > 3 && (
            <span className="result-card__tag result-card__tag--more">
              +{tagEntries.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
