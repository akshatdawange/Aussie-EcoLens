import React, { useState } from 'react';
import { searchBySpecies, searchByTagCounts, searchByImage, getFileByThumbnail } from '../utils/api';
import Button from '../components/Button';
import InputField from '../components/InputField';
import ImageModal from '../components/ImageModal';
import './SearchPage.css';

const SEARCH_MODES = [
  { id: 'tags',      label: 'By Species Tags'   },
  { id: 'thumbnail', label: 'By Thumbnail URL'  },
  { id: 'file',      label: 'By Uploaded Photo' },
];

const SearchPage = () => {
  const [mode, setMode] = useState('tags');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [modalUrl, setModalUrl] = useState(null);

  // Tags mode state
  const [tagInput, setTagInput] = useState('');
  const [tagCount, setTagCount] = useState('1');
  const [tagList, setTagList] = useState([]);

  // Thumbnail mode
  const [thumbUrl, setThumbUrl] = useState('');

  // File mode
  const [queryFile, setQueryFile] = useState(null);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (tagList.find(t => t.tag === tag)) return;
    setTagList(prev => [...prev, { tag, count: parseInt(tagCount) || 1 }]);
    setTagInput('');
    setTagCount('1');
  };

  const removeTag = (tag) => setTagList(prev => prev.filter(t => t.tag !== tag));

  const handleSearch = async () => {
  setError('');
  setResults(null);
  setLoading(true);
  try {
    let data;
    if (mode === 'tags') {
      if (!tagList.length) { setError('Add at least one tag.'); setLoading(false); return; }
      const hasCountsAboveOne = tagList.some(t => t.count > 1);
      if (hasCountsAboveOne) {
        const payload = Object.fromEntries(tagList.map(t => [t.tag, t.count]));
        data = await searchByTagCounts(payload);
      } else {
        data = await searchBySpecies(tagList.map(t => t.tag));
      }
    } else if (mode === 'thumbnail') {
      if (!thumbUrl) { setError('Enter a thumbnail URL.'); setLoading(false); return; }
      const result = await getFileByThumbnail(thumbUrl);
      data = Array.isArray(result) ? result : [result];
    } else {
      if (!queryFile) { setError('Select a file.'); setLoading(false); return; }
      data = await searchByImage(queryFile);
    }
    setResults(Array.isArray(data) ? data : [data]);
  } catch (err) {
    setError(err.message || 'Search failed.');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="search-page">
      <div className="search-page__inner">
        <div className="page-header animate-fade-up">
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">Find wildlife media by species, URL, or photo.</p>
        </div>

        {/* Mode tabs */}
        <div className="search-tabs animate-fade-up">
          {SEARCH_MODES.map(m => (
            <button
              key={m.id}
              className={`search-tab ${mode === m.id ? 'active' : ''}`}
              onClick={() => { setMode(m.id); setResults(null); setError(''); }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Query form */}
        <div className="search-form animate-fade-up">

          {/* Tags mode */}
          {mode === 'tags' && (
            <div className="search-form__section">
              <div className="search-tag-input">
                <InputField
                  label="Species"
                  placeholder="e.g. koala"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTag()}
                />
                <InputField
                  label="Min count"
                  type="number"
                  placeholder="1"
                  value={tagCount}
                  onChange={e => setTagCount(e.target.value)}
                />
                <Button variant="secondary" onClick={addTag}>Add</Button>
              </div>

              {tagList.length > 0 && (
                <div className="search-tag-chips">
                  {tagList.map(t => (
                    <span key={t.tag} className="search-tag-chip">
                      {t.tag}
                      {t.count > 1 && <span className="search-tag-chip__count">×{t.count}</span>}
                      <button onClick={() => removeTag(t.tag)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="search-hint">
                Results must contain ALL tags with at least the specified count (AND logic).
              </p>
            </div>
          )}

          {/* Thumbnail URL mode */}
          {mode === 'thumbnail' && (
            <InputField
              label="Thumbnail URL"
              placeholder="https://..."
              value={thumbUrl}
              onChange={e => setThumbUrl(e.target.value)}
            />
          )}

          {/* File mode */}
          {mode === 'file' && (
            <div className="search-form__section">
              <label className="input-label">Upload a photo to search by</label>
              <input
                type="file"
                accept="image/*"
                className="search-file-input"
                onChange={e => setQueryFile(e.target.files[0])}
              />
              {queryFile && (
                <p className="search-hint">Selected: {queryFile.name}</p>
              )}
            </div>
          )}

          {error && <p className="search-error">{error}</p>}

          <Button variant="primary" size="lg" onClick={handleSearch} loading={loading}>
            Search
          </Button>
        </div>

        {/* Results */}
        {results !== null && (
          <div className="search-results animate-fade-up">
            <div className="search-results__header">
              <span className="search-results__count">
                {results.length} result{results.length !== 1 ? 's' : ''} found
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
                    key={i}
                    item={item}
                    onClick={() => setModalUrl(item.full_url || item.url)}
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

const ResultCard = ({ item, onClick }) => (
  <div className="result-card" onClick={onClick} role="button" tabIndex={0}>
    <div className="result-card__thumb">
      {item.thumbnailUrl
        ? <img src={item.thumbnailUrl} alt="Wildlife" loading="lazy" />
        : <span className="result-card__placeholder">▶</span>
      }
      <div className="result-card__overlay"><span>View full size</span></div>
    </div>
    {item.tagCounts && (
      <div className="result-card__tags">
        {Object.keys(item.tagCounts).slice(0, 3).map(tag => (
          <span key={tag} className="result-card__tag">{tag}</span>
        ))}
        {Object.keys(item.tagCounts).length > 3 && (
          <span className="result-card__tag result-card__tag--more">
            +{Object.keys(item.tagCounts).length - 3}
          </span>
        )}
      </div>
    )}
  </div>
);

export default SearchPage;