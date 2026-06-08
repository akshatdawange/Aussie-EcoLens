import React, { useEffect } from 'react';
import './ImageModal.css';

const ImageModal = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Detect videos by extension (handles presigned URLs with a query string).
  const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        {isVideo ? (
          <video src={url} className="modal-img" controls autoPlay />
        ) : (
          <img src={url} alt="Full size" className="modal-img" />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="modal-link"
          onClick={e => e.stopPropagation()}
        >
          Open original
        </a>
      </div>
    </div>
  );
};

export default ImageModal;