const BASE_URL = process.env.REACT_APP_API_BASE_URL;

export const getAuthHeader = () => ({
  Authorization: `Bearer ${sessionStorage.getItem('idToken')}`,
});

export const uploadFile = async (file, checksum) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('checksum', checksum);
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData,
  });
  if (res.status === 409) return { duplicate: true };
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
};

export const searchByTags = async (tags) => {
  const res = await fetch(`${BASE_URL}/search/tags`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

export const searchByThumbnailUrl = async (url) => {
  const res = await fetch(`${BASE_URL}/search/thumbnail`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnail_url: url }),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

export const searchByFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/search/file`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData,
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

export const getMyFiles = async () => {
  const res = await fetch(`${BASE_URL}/files`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch files');
  return res.json();
};

export const updateTags = async (urls, tags, operation) => {
  const res = await fetch(`${BASE_URL}/tags`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, tags, operation }),
  });
  if (!res.ok) throw new Error('Tag update failed');
  return res.json();
};

export const deleteFiles = async (urls) => {
  const res = await fetch(`${BASE_URL}/files/delete`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
};