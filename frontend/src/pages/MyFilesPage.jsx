import React, { useState, useEffect } from "react";
import {
  getMyFiles,
  deleteFiles,
  getMediaUrl,
  bulkUpdateTags,
} from "../utils/api";
import Button from "../components/Button";
import ImageModal from "../components/ImageModal";
import "./MyFilesPage.css";

const MyFilesPage = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [modalUrl, setModalUrl] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk tag editing
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagMsg, setTagMsg] = useState("");

  const loadFiles = async () => {
    try {
      const data = await getMyFiles();
      setFiles(data);
    } catch (err) {
      setError("Failed to load files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const toggleSelect = (url) => {
    setSelected((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  };

  const selectAll = () => {
    setSelected(files.map((f) => f.fileId));
  };

  const clearSelection = () => setSelected([]);

  const handleDelete = async () => {
    if (!selected.length) return;
    if (
      !window.confirm(
        `Delete ${selected.length} file(s)? This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await deleteFiles(selected);
      setFiles((prev) => prev.filter((f) => !selected.includes(f.fileId)));
      setSelected([]);
    } catch {
      setError("Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  // operation: 1 = add tags, 0 = remove tags (per spec §4.3 bulk tagging)
  const applyTags = async (operation) => {
    if (!selected.length) return;
    const tags = tagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!tags.length) {
      setTagMsg("Enter at least one tag.");
      return;
    }
    setTagBusy(true);
    setTagMsg("");
    try {
      await bulkUpdateTags(selected, tags, operation);
      await loadFiles(); // reflect the backend's updated tag counts
      setTagInput("");
      setTagMsg(
        `${operation === 1 ? "Added" : "Removed"} ${tags.join(", ")} ` +
          `on ${selected.length} file${selected.length !== 1 ? "s" : ""}.`,
      );
    } catch {
      setTagMsg("Tag update failed.");
    } finally {
      setTagBusy(false);
    }
  };

  return (
    <div className="myfiles-page">
      <div className="myfiles-page__inner">
        <div className="page-header animate-fade-up">
          <h1 className="page-title">My Uploads</h1>
          <p className="page-subtitle">
            All your uploaded wildlife observations.
          </p>
        </div>

        {/* Toolbar */}
        {files.length > 0 && (
          <div className="myfiles-toolbar animate-fade-up">
            <div className="myfiles-toolbar__left">
              <span className="myfiles-count">
                {files.length} file{files.length !== 1 ? "s" : ""}
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

        {/* Bulk tag editor - acts on the selected files */}
        {selected.length > 0 && (
          <div className="myfiles-tagedit animate-fade-up">
            <span className="myfiles-tagedit__label">
              Edit tags on {selected.length} selected
            </span>
            <input
              className="myfiles-tagedit__input"
              placeholder="e.g. koala, wombat"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTags(1)}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyTags(1)}
              loading={tagBusy}
            >
              Add tags
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyTags(0)}
              loading={tagBusy}
            >
              Remove tags
            </Button>
            {tagMsg && <span className="myfiles-tagedit__msg">{tagMsg}</span>}
          </div>
        )}

        {/* States */}
        {loading && (
          <div className="myfiles-loading">
            <div className="myfiles-spinner" />
            <p>Loading your files...</p>
          </div>
        )}

        {error && <p className="myfiles-error">{error}</p>}

        {!loading && !error && files.length === 0 && (
          <div className="myfiles-empty">
            <p>No files uploaded yet.</p>
            <Button
              variant="primary"
              size="md"
              onClick={() => (window.location.href = "/upload")}
            >
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
  const [expanded, setExpanded] = useState(false);
  const tagEntries = Object.entries(file.tagCounts || {});
  const shown = expanded ? tagEntries : tagEntries.slice(0, 2);
  return (
    <div className={`file-card ${selected ? "file-card--selected" : ""}`}>
      <div className="file-card__thumb" onClick={onView}>
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt="Wildlife observation"
            loading="lazy"
          />
        ) : (
          <span className="file-card__icon">▶</span>
        )}
        <div className="file-card__overlay">View</div>
      </div>
      <div className="file-card__footer">
        <div className="file-card__tags">
          {shown.map(([tag, count]) => (
            <span key={tag} className="file-card__tag">
              {tag}
              <em>×{count}</em>
            </span>
          ))}
          {tagEntries.length > 2 && (
            <button
              type="button"
              className="file-card__tag file-card__tag--toggle"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? "show less" : `+${tagEntries.length - 2}`}
            </button>
          )}
        </div>
        <input
          type="checkbox"
          className="file-card__checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

export default MyFilesPage;
