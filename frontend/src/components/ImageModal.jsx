import React, { useEffect } from 'react';
import './ImageModal.css';

const ImageModal = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <img src={url} alt="Full size" className="modal-img" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="modal-link"
          onClick={e => e.stopPropagation()}
        >
          Open original ↗
        </a>
      </div>
    </div>
  );
};

export default ImageModal;