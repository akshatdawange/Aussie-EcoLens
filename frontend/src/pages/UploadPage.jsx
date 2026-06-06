import React, { useState, useRef, useCallback } from "react";
import { uploadFile, getMyFiles } from "../utils/api";
import Button from "../components/Button";
import "./UploadPage.css";

const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
];
const MAX_MB = 100;

// How long to wait for the tagging Lambda to write detected species to the DB.
const TAG_POLL_ATTEMPTS = 12;
const TAG_POLL_INTERVAL = 2500;

const STATUS = {
  ready: { label: "Ready", color: "var(--text-muted)" },
  checksumming: { label: "Verifying...", color: "var(--amber)" },
  uploading: { label: "Uploading...", color: "var(--accent)" },
  processing: { label: "Detecting...", color: "var(--amber)" },
  done: { label: "Uploaded ", color: "var(--success)" },
  duplicate: { label: "Duplicate ", color: "var(--warning)" },
  error: { label: "Error ", color: "var(--error)" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UploadPage = () => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);

  const addFiles = useCallback((raw) => {
    const entries = raw.map((file) => {
      if (!ACCEPTED.includes(file.type))
        return {
          file,
          preview: null,
          status: "error",
          error: "Unsupported type",
        };
      if (file.size > MAX_MB * 1024 * 1024)
        return {
          file,
          preview: null,
          status: "error",
          error: `Exceeds ${MAX_MB}MB`,
        };
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
      return { file, preview, status: "ready", error: null };
    });
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (i) =>
    setFiles((prev) => {
      const u = [...prev];
      if (u[i].preview) URL.revokeObjectURL(u[i].preview);
      u.splice(i, 1);
      return u;
    });

  const setStatus = (i, patch) =>
    setFiles((prev) => {
      const u = [...prev];
      u[i] = { ...u[i], ...patch };
      return u;
    });

  // Poll the files API until the tagging Lambda has written detected species
  // for the freshly uploaded file (matched by fileId), then return its tags.
  const pollForTags = async (fileId) => {
    if (!fileId) return null;
    for (let attempt = 0; attempt < TAG_POLL_ATTEMPTS; attempt++) {
      await sleep(TAG_POLL_INTERVAL);
      try {
        const myFiles = await getMyFiles();
        const match = myFiles.find((f) => f.fileId === fileId);
        if (match && Object.keys(match.tagCounts || {}).length > 0) {
          return match.tagCounts;
        }
      } catch {
        /* keep polling */
      }
    }
    return null;
  };

  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "ready") continue;

      setStatus(i, { status: "checksumming" });

      try {
        setStatus(i, { status: "uploading" });
        const result = await uploadFile(files[i].file);

        // Upload landed - now wait for ML tagging to complete and surface the
        // detected species right here on the upload page.
        setStatus(i, {
          status: result.duplicate ? "duplicate" : "processing",
          fileId: result.fileId,
        });

        const tags = await pollForTags(result.fileId);
        setStatus(i, {
          status: result.duplicate ? "duplicate" : "done",
          tags: tags || {},
          tagsResolved: true,
        });
      } catch (err) {
        setStatus(i, { status: "error", error: err.message });
      }
    }
  };

  const readyCount = files.filter((f) => f.status === "ready").length;

  return (
    <div className="upload-page">
      <div className="upload-page__inner">
        <div className="page-header animate-fade-up">
          <h1 className="page-title">Upload Media</h1>
          <p className="page-subtitle">
            Images and videos are auto-tagged with detected species on upload.
          </p>
        </div>

        <div
          className={`dropzone ${dragging ? "dropzone--active" : ""} animate-fade-up`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED.join(",")}
            onChange={(e) => addFiles(Array.from(e.target.files))}
            style={{ display: "none" }}
          />
          <div className="dropzone__icon">↑</div>
          <p className="dropzone__primary">
            {dragging ? "Drop to add" : "Drop files here or click to browse"}
          </p>
          <p className="dropzone__secondary">
            JPG · PNG · WEBP · MP4 · MOV &nbsp;·&nbsp; Max {MAX_MB}MB
          </p>
        </div>

        {files.length > 0 && (
          <div className="upload-queue animate-fade-up">
            <div className="upload-queue__header">
              <span>
                {files.length} file{files.length !== 1 ? "s" : ""} queued
              </span>
              <button
                className="upload-queue__clear"
                onClick={() => setFiles([])}
              >
                Clear all
              </button>
            </div>

            <div className="upload-queue__list">
              {files.map((entry, i) => (
                <FileRow key={i} entry={entry} onRemove={() => remove(i)} />
              ))}
            </div>

            {readyCount > 0 && (
              <div className="upload-queue__footer">
                <Button variant="primary" size="lg" onClick={uploadAll}>
                  Upload {readyCount} file{readyCount !== 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FileRow = ({ entry, onRemove }) => {
  const { file, preview, status, error, tags, tagsResolved } = entry;
  const cfg = STATUS[status] || STATUS.ready;
  const isVideo = file.type.startsWith("video/");
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  const tagEntries = Object.entries(tags || {});

  return (
    <div className={`file-row file-row--${status}`}>
      <div className="file-row__thumb">
        {preview ? (
          <img src={preview} alt={file.name} />
        ) : (
          <span>{isVideo ? "▶" : "◈"}</span>
        )}
      </div>
      <div className="file-row__info">
        <span className="file-row__name">{file.name}</span>
        <span className="file-row__meta">
          {sizeMB} MB · {file.type.split("/")[1].toUpperCase()}
        </span>
        {error && <span className="file-row__error">{error}</span>}

        {status === "processing" && (
          <span className="file-row__detecting">Detecting species...</span>
        )}

        {tagEntries.length > 0 && (
          <div className="file-row__tags">
            {tagEntries.map(([tag, count]) => (
              <span key={tag} className="file-row__tag">
                {tag}
                <em>×{count}</em>
              </span>
            ))}
          </div>
        )}

        {tagsResolved && tagEntries.length === 0 && !isVideo && (
          <span className="file-row__meta">No species detected</span>
        )}
      </div>
      <span className="file-row__status" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
      {(status === "ready" || status === "error") && (
        <button className="file-row__remove" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
};

export default UploadPage;
