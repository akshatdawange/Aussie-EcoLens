import React, { useState, useEffect } from 'react';
import { getMyFiles, deleteFiles, getMediaUrl } from '../utils/api';
import Button from '../components/Button';
import ImageModal from '../components/ImageModal';
import './MyFilesPage.css';

const MyFilesPage = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [modalUrl, setModalUrl] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const data = await getMyFiles();
        setFiles(data);
      } catch (err) {
        setError('Failed to load files.');
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, []);

  const toggleSelect = (url) => {
    setSelected(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const selectAll = () => {
    setSelected(files.map(f => f.fileId));
  };

  const clearSelection = () => setSelected([]);

  const handleDelete = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} file(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteFiles(selected);
      setFiles(prev => prev.filter(f => !selected.includes(f.fileId)));
      setSelected([]);
    } catch {
      setError('Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="myfiles-page">
      <div className="myfiles-page__inner">
        <div className="page-header animate-fade-up">
          <h1 className="page-title">My Uploads</h1>
          <p className="page-subtitle">All your uploaded wildlife observations.</p>
        </div>

        {/* Toolbar */}
        {files.length > 0 && (
          <div className="myfiles-toolbar animate-fade-up">
            <div className="myfiles-toolbar__left">
              <span className="myfiles-count">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
              {selected.length > 0 && (
                <span className="myfiles-selected">
                  {selected.length} selected
                </span>
              )}
            </div>
            <div className="myfiles-toolbar__right">
              {selected.length > 0 ? (
                <>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Deselect all
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    loading={deleting}
                  >
                    Delete selected
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Select all
                </Button>
              )}
            </div>
          </div>
        )}

        {/* States */}
        {loading && (
          <div className="myfiles-loading">
            <div className="myfiles-spinner" />
            <p>Loading your files...</p>
          </div>
        )}

        {error && (
          <p className="myfiles-error">{error}</p>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="myfiles-empty">
            <span>◈</span>
            <p>No files uploaded yet.</p>
            <Button variant="primary" size="md" onClick={() => window.location.href = '/upload'}>
              Upload your first file
            </Button>
          </div>
        )}

        {/* Grid */}
        {!loading && files.length > 0 && (
          <div className="myfiles-grid animate-fade-up">
            {files.map((file, i) => (
                <FileCard
                    key={file.fileId}
                    file={file}
                    selected={selected.includes(file.fileId)}
                    onSelect={() => toggleSelect(file.fileId)}
                    onView={async () => {
                        try {
                            const url = await getMediaUrl(file.originalUrl);
                            setModalUrl(url);
                        } catch {
                            setModalUrl(file.originalUrl);
                        }
                    }}
                />
            ))}
          </div>
        )}
      </div>

      {modalUrl && (
        <ImageModal url={modalUrl} onClose={() => setModalUrl(null)} />
      )}
    </div>
  );
};

const FileCard = ({ file, selected, onSelect, onView }) => {
  const tagEntries = Object.entries(file.tagCounts || {});
  return (
    <div className={`file-card ${selected ? 'file-card--selected' : ''}`}>
      <div className="file-card__thumb" onClick={onView}>
        {file.thumbnailUrl
          ? <img src={file.thumbnailUrl} alt="Wildlife observation" loading="lazy" />
          : <span className="file-card__icon">▶</span>
        }
        <div className="file-card__overlay">View</div>
      </div>
      <div className="file-card__footer">
        <div className="file-card__tags">
          {tagEntries.slice(0, 2).map(([tag, count]) => (
            <span key={tag} className="file-card__tag">
              {tag}<em>×{count}</em>
            </span>
          ))}
          {tagEntries.length > 2 && (
            <span className="file-card__tag">
              +{tagEntries.length - 2}
            </span>
          )}
        </div>
        <input
          type="checkbox"
          className="file-card__checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

export default MyFilesPage;