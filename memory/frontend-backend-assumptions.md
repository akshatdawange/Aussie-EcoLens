---
name: frontend-backend-assumptions
description: Frontend assumptions about the EcoLens backend APIs that may need verification
metadata:
  type: project
---

Aussie-EcoLens frontend (FIT5225 A2) makes these backend assumptions that should be verified against the actual deployed APIs:

- **Per-user files**: the `/files` backend IGNORES the `scope` query param (`scope=mine` and `scope=feed` both return everyone's files). `getMyFiles()` therefore filters client-side: each record has owner field **`ownerSub`** (a Cognito sub UUID), matched against the idToken's `sub`. This is only a UI-level fix — proper access control should be enforced server-side in the `/files` Lambda for the rubric. Record shape: `{ fileId, ownerSub, fileType, filename, originalUrl, thumbnailUrl, tagCounts:{}, createdAt }`.
- **Search/by-image is disabled** in the SearchPage UI (commented out in `SEARCH_MODES`) because the GCP inference endpoint (Member C's part) isn't deployed yet — it 500s. Re-enable when deployed.
- **Subscriptions** (`POST /subscriptions`) is called with `{ email, species: [...] }` (array). `DELETE /subscriptions` removes all. `normalizeMedia` and `parseSubscriptions` defensively handle multiple response field-name shapes since the exact backend schema wasn't confirmed.
- **Post-upload tagging** is async: after S3 upload, UploadPage polls `getMyFiles()` for up to ~30s to surface ML-detected species, since the upload response doesn't include tags.

**Why:** Backend is built by teammates and not in this repo, so field names/scopes were inferred. **How to apply:** if a feature shows empty/black cards or wrong files, check the actual API response shape against these assumptions first.
