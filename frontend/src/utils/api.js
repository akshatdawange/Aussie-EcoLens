const BASE = process.env.REACT_APP_API_BASE_URL;
const UPLOAD_BASE = process.env.REACT_APP_UPLOAD_API_URL;

const getRawToken = () => sessionStorage.getItem("idToken");

const getHeaders = (isJson = true) => {
  const headers = {
    Authorization: `Bearer ${getRawToken()}`,
  };
  if (isJson) headers["Content-Type"] = "application/json";
  return headers;
};

// fetch wrapper: on a 401 (expired/invalid token) clear the session and bounce
// the user back to the sign-in page, instead of leaving them stuck on errors.
const authFetch = async (url, opts) => {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    sessionStorage.clear();
    if (window.location.pathname !== "/") window.location.href = "/";
    throw new Error("Session expired - please sign in again.");
  }
  return res;
};

// Decode the Cognito ID token (JWT) payload without verifying the signature.
const decodeToken = () => {
  const t = getRawToken();
  if (!t) return {};
  try {
    const payload = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return {};
  }
};

export const getUserEmail = () => decodeToken().email || null;
export const getUserSub = () => decodeToken().sub || null;

// Normalise a media record so the UI can rely on a stable shape regardless of
// which field names the backend (DynamoDB / search Lambda) returns.
export const normalizeMedia = (item = {}) => {
  const thumbnailUrl =
    item.thumbnailUrl ||
    item.thumbnail_url ||
    item.thumbUrl ||
    item.thumb_url ||
    item.thumbnail ||
    null;
  const originalUrl =
    item.originalUrl ||
    item.original_url ||
    item.fullUrl ||
    item.full_url ||
    item.url ||
    item.imageUrl ||
    item.image_url ||
    item.s3Url ||
    null;
  const fileId =
    item.fileId ||
    item.file_id ||
    item.id ||
    item.checksum ||
    item.sha256 ||
    originalUrl;

  // matchedSpecies is what /search/by-image returns for each result.
  let tagCounts =
    item.tagCounts ||
    item.tag_counts ||
    item.counts ||
    item.matchedSpecies ||
    item.matched_species ||
    item.tags ||
    {};
  if (Array.isArray(tagCounts)) {
    tagCounts = Object.fromEntries(
      tagCounts.map((t) =>
        typeof t === "string"
          ? [t, 1]
          : [t.tag || t.name || t.species, t.count ?? t.value ?? 1],
      ),
    );
  }

  const fileType =
    item.fileType ||
    item.file_type ||
    item.type ||
    (originalUrl && /\.(mp4|mov|webm|avi)$/i.test(originalUrl)
      ? "video"
      : "image");

  return { ...item, fileId, thumbnailUrl, originalUrl, tagCounts, fileType };
};

// Upload
export const computeChecksum = async (file) => {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const uploadFile = async (file) => {
  const sha256 = await computeChecksum(file);
  const fileType = file.type.startsWith("video") ? "video" : "image";

  // Step 1 - get presigned URL
  const presignRes = await authFetch(`${UPLOAD_BASE}/uploads/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getRawToken(),
    },
    body: JSON.stringify({
      filename: file.name,
      sha256,
      contentType: file.type,
      fileType,
    }),
  });

  if (presignRes.status === 401)
    throw new Error("Not logged in or token expired");
  if (!presignRes.ok) throw new Error(`Presign failed: ${presignRes.status}`);

  const data = await presignRes.json();

  // Duplicate file
  if (data.duplicate) return { duplicate: true, fileId: data.fileId };

  // Step 2 - PUT directly to S3 (not our API; don't treat its errors as auth)
  const s3Res = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!s3Res.ok) throw new Error(`S3 upload failed: ${s3Res.status}`);

  return { duplicate: false, fileId: data.fileId };
};

// Media URL
export const getMediaUrl = async (originalUrl) => {
  const key = decodeURIComponent(
    new URL(originalUrl).pathname.replace(/^\//, ""),
  );
  const res = await authFetch(
    `${UPLOAD_BASE}/media-url?key=${encodeURIComponent(key)}`,
    {
      headers: { Authorization: getRawToken() }, // raw token, no Bearer
    },
  );
  if (!res.ok) throw new Error("Failed to get media URL");
  const { url } = await res.json();
  return url;
};

// Files
// Returns only the signed-in user's uploads. Asks the backend for scope=mine;
// if that isn't supported it falls back to the feed and filters client-side by
// the owner identifier embedded in each record (so no other user's files leak).
const fetchFiles = async (scope) => {
  const res = await authFetch(`${BASE}/files?scope=${scope}`, {
    headers: getHeaders(false),
  });
  if (!res.ok) throw new Error(`Failed to fetch files (${res.status})`);
  const data = await res.json();
  // API returns { scope, count, files: [...] }
  return (data.files || data || []).map(normalizeMedia);
};

const ownerIdOf = (f) =>
  f.ownerSub ||
  f.userId ||
  f.ownerId ||
  f.owner ||
  f.userSub ||
  f.cognitoSub ||
  f.uploadedBy ||
  f.uploaderId ||
  f.sub ||
  null;
const ownerEmailOf = (f) =>
  f.email || f.userEmail || f.uploaderEmail || f.ownerEmail || null;

export const getMyFiles = async () => {
  let files;
  try {
    files = await fetchFiles("mine");
  } catch {
    files = await fetchFiles("feed");
  }

  // Defensive client-side filter in case the backend ignores scope=mine.
  const sub = getUserSub();
  const email = getUserEmail();
  const hasOwnerInfo = files.some((f) => ownerIdOf(f) || ownerEmailOf(f));
  if (hasOwnerInfo && (sub || email)) {
    files = files.filter(
      (f) =>
        (sub && ownerIdOf(f) === sub) || (email && ownerEmailOf(f) === email),
    );
  }
  return files;
};

// Community feed: everyone's uploads (view-only), no owner filtering.
export const getFeed = async () => {
  try {
    return await fetchFiles("feed");
  } catch {
    return [];
  }
};

export const getFileByThumbnail = async (thumbnailUrl) => {
  const params = new URLSearchParams({ thumbnailUrl });
  const res = await authFetch(`${BASE}/files/by-thumbnail?${params}`, {
    headers: getHeaders(false),
  });
  if (!res.ok) throw new Error("Failed to fetch by thumbnail");
  return res.json();
};

// Search
export const searchBySpecies = async (speciesArray) => {
  const res = await authFetch(`${BASE}/search/species`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ species: speciesArray }),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
};

export const searchByTagCounts = async (tagCountObj) => {
  const res = await authFetch(`${BASE}/search/tag-counts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(tagCountObj),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
};

export const searchByImage = async (file) => {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await authFetch(`${BASE}/search/by-image`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ imageBase64: base64, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Search by image failed");
  return res.json();
};

// Tags
export const bulkUpdateTags = async (fileIds, tags, operation) => {
  const res = await authFetch(`${BASE}/tags/bulk`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ op: operation, files: fileIds, tags }),
  });
  if (!res.ok) throw new Error("Tag update failed");
  return res.json();
};

// Delete
export const deleteFiles = async (fileIds) => {
  const res = await authFetch(`${BASE}/files`, {
    method: "DELETE",
    headers: getHeaders(),
    body: JSON.stringify({ files: fileIds }),
  });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
};

// Subscriptions
export const getSubscriptions = async () => {
  const res = await authFetch(`${BASE}/subscriptions`, {
    headers: getHeaders(false),
  });
  if (!res.ok) throw new Error("Failed to get subscriptions");
  return res.json();
};

export const createSubscription = async (email, species) => {
  const res = await authFetch(`${BASE}/subscriptions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ email, species }),
  });
  if (!res.ok) throw new Error("Failed to create subscription");
  return res.json();
};

export const deleteSubscription = async () => {
  const res = await authFetch(`${BASE}/subscriptions`, {
    method: "DELETE",
    headers: getHeaders(false),
  });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
};
