# EcoLens API Reference

This document summarises the implemented and verified API routes for database, search, tag management, deletion, and notifications.

The source of truth for architecture, naming, ownership, DynamoDB schema, S3 key formats, and deployment order remains:

```text
docs/EcoLens-Architecture-Contract.md
```

## 1. Base URL

Replace the placeholder below with the deployed API Gateway URL from the `ecolens-api` CloudFormation stack output.

```text
BASE_URL = https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/prod
```

## 2. Authentication Status

Current testing status:

```text
Temporary testing: API routes are callable without Cognito authorisation.
Final submission requirement: API routes must be protected using Cognito JWT authorisation.
```

Pending dependency:

```text
Need Cognito User Pool ID, App Client ID, and a valid logged-in JWT token so it can attach and test Cognito authorisation on API Gateway.
```

Once Cognito is connected, frontend requests should include:

```http
Authorization: Bearer <cognito-jwt-token>
Content-Type: application/json
```

---

# 3. Implemented API Routes

## 3.1 List files

```http
GET /files?scope=feed
```

### Purpose

Returns the global newest-first feed of processed media records.

### Example request

```bash
curl -i -X GET "$BASE_URL/files?scope=feed"
```

### Example success response

```json
{
  "scope": "feed",
  "count": 3,
  "files": [
    {
      "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
      "ownerSub": "anonymous",
      "fileType": "image",
      "filename": "thumb-test.jpg",
      "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "tagCounts": {
        "koala": 2,
        "wombat": 1
      },
      "createdAt": "2026-06-01T23:21:12Z"
    }
  ]
}
```

### DynamoDB access pattern

Uses `GSI4`.

```text
GSI4PK = FEED
GSI4SK = CREATED#{createdAt}#{fileId}
```

### Verification status

```text
Verified working.
```

---

## 3.2 Get one file by file ID

```http
GET /files/{fileId}
```

### Purpose

Returns the full metadata record for a specific file.

### Example request

```bash
curl -i -X GET "$BASE_URL/files/a66165b0-fe58-4754-b8fa-9d201286d42c"
```

### Example success response

```json
{
  "found": true,
  "file": {
    "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
    "ownerSub": "anonymous",
    "fileType": "image",
    "filename": "thumb-test.jpg",
    "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
    "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
    "tagCounts": {
      "koala": 2,
      "wombat": 1
    },
    "createdAt": "2026-06-01T23:21:12Z"
  }
}
```

### Example not found response

```json
{
  "found": false,
  "message": "File not found."
}
```

### DynamoDB access pattern

```text
PK = FILE#{fileId}
SK = META
```

### Verification status

```text
Verified working.
```

---

## 3.3 Find original image by thumbnail URL

```http
GET /files/by-thumbnail?thumbnailUrl=<thumbnail-url>
```

### Purpose

Receives a thumbnail URL and returns the matching full-size original image URL.

This supports the UI behaviour where thumbnails are previewed first, and users can click a thumbnail to retrieve the full-size file.

### Example request

```bash
curl -i -G "$BASE_URL/files/by-thumbnail" \
  --data-urlencode "thumbnailUrl=https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/anonymous/file-id/image_thumb.jpg"
```

### Example success response

```json
{
  "found": true,
  "fileId": "e0a1ffc4-170e-473d-a730-4c4254e01124",
  "fileType": "image",
  "filename": "orch-test.jpg",
  "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
  "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
  "ownerSub": "anonymous",
  "createdAt": "2026-06-01T22:52:36Z"
}
```

### DynamoDB access pattern

Uses `GSI2`.

```text
GSI2PK = THUMB#{thumbnailUrl}
GSI2SK = FILE#{fileId}
```

### Verification status

```text
Verified working.
```

---

## 3.4 Search by species

```http
POST /search/species
```

### Purpose

Returns files containing at least one of the requested species.

### Example request

```bash
curl -i -X POST "$BASE_URL/search/species" \
  -H "Content-Type: application/json" \
  -d '{"species": ["koala"]}'
```

### Request body

```json
{
  "species": ["koala"]
}
```

### Example success response

```json
{
  "query": {
    "species": ["koala"]
  },
  "count": 3,
  "results": [
    {
      "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
      "ownerSub": "anonymous",
      "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "matchedSpecies": {
        "koala": 2
      }
    }
  ]
}
```

### DynamoDB access pattern

Uses `GSI1`.

```text
GSI1PK = SPECIES#{species}
GSI1SK = FILE#{fileId}
```

### Verification status

```text
Verified working.
```

---

## 3.5 Search by tag counts

```http
POST /search/tag-counts
```

### Purpose

Returns files that contain all requested species with counts greater than or equal to the requested minimum counts.

This endpoint uses logical AND between tags, not OR.

### Example request

```bash
curl -i -X POST "$BASE_URL/search/tag-counts" \
  -H "Content-Type: application/json" \
  -d '{"koala": 1, "wombat": 1}'
```

### Request body

```json
{
  "koala": 1,
  "wombat": 1
}
```

### Search logic

```text
koala >= 1 AND wombat >= 1
```

### Example success response

```json
{
  "query": {
    "koala": 1,
    "wombat": 1
  },
  "count": 3,
  "results": [
    {
      "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
      "ownerSub": "anonymous",
      "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "matchedSpecies": {
        "koala": 2,
        "wombat": 1
      }
    }
  ]
}
```

### Negative test example

Request:

```json
{
  "koala": 3
}
```

Expected result when stored records only have `koala: 2`:

```json
{
  "query": {
    "koala": 3
  },
  "count": 0,
  "results": []
}
```

### DynamoDB access pattern

Uses `GSI1` species records and intersects matching file IDs across all requested tags.

```text
GSI1PK = SPECIES#{species}
GSI1SK = FILE#{fileId}
```

### Verification status

```text
Verified working.
Minimum count filtering verified.
Logical AND behaviour verified through multi-tag search design.
```

---

## 3.6 Search by uploaded image

```http
POST /search/by-image
```

### Purpose

Accepts a temporary query image, detects tags, and returns files in the database containing the detected set of tags.

The uploaded query image must not be permanently stored or inserted into the database.

### Current testing mode

For current testing, this endpoint supports `detectedTags` directly.

### Example request

```bash
curl -i -X POST "$BASE_URL/search/by-image" \
  -H "Content-Type: application/json" \
  -d '{"detectedTags": {"koala": 1, "wombat": 1}}'
```

### Request body for test mode

```json
{
  "detectedTags": {
    "koala": 1,
    "wombat": 1
  }
}
```

### Future request body for real image query

```json
{
  "imageBase64": "<base64-image-bytes>",
  "contentType": "image/jpeg"
}
```

### Expected response

```json
{
  "detectedTags": {
    "koala": 1,
    "wombat": 1
  },
  "count": 3,
  "results": [
    {
      "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
      "ownerSub": "anonymous",
      "originalUrl": "https://ecolens-originals-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "thumbnailUrl": "https://ecolens-thumbnails-<account>.s3.ap-southeast-2.amazonaws.com/...",
      "matchedSpecies": {
        "koala": 2,
        "wombat": 1
      }
    }
  ]
}
```

### Dependency

```text
Pending dependency from Upload Pipeline Member:
GCP Cloud Run inference URL and shared secret must be available through SSM parameters:
/ecolens/gcp/inferUrl
/ecolens/gcp/sharedSecret
```

### Verification status

```text
Verified working in detectedTags test mode.
Real image inference pending GCP endpoint.
```

---

## 3.7 Bulk add or remove tags

```http
POST /tags/bulk
```

### Purpose

Allows manual addition or removal of tags for one or more files.

### Add tag request

```bash
curl -i -X POST "$BASE_URL/tags/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "op": 1,
    "files": ["a66165b0-fe58-4754-b8fa-9d201286d42c"],
    "tags": ["dingo"]
  }'
```

### Remove tag request

```bash
curl -i -X POST "$BASE_URL/tags/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "op": 0,
    "files": ["a66165b0-fe58-4754-b8fa-9d201286d42c"],
    "tags": ["dingo"]
  }'
```

### Request body

```json
{
  "op": 1,
  "files": ["file-id-1", "file-id-2"],
  "tags": ["dingo"]
}
```

### Operation values

```text
op = 1 means add tags
op = 0 means remove tags
```

### Example success response

```json
{
  "operation": "add",
  "updatedCount": 1,
  "failedCount": 0,
  "updatedFiles": [
    {
      "fileId": "a66165b0-fe58-4754-b8fa-9d201286d42c",
      "tagCounts": {
        "koala": 2,
        "wombat": 1,
        "dingo": 1
      }
    }
  ],
  "failedFiles": []
}
```

### DynamoDB behaviour

When adding a tag:

```text
Updates META item tagCounts
Creates or updates SPECIES#{tag} item
Adds GSI1PK = SPECIES#{tag}
```

When removing a tag:

```text
Updates META item tagCounts
Deletes SPECIES#{tag} item
If tag does not exist, it is ignored
```

### Verification status

```text
Verified bulk add.
Verified bulk remove.
```

---

## 3.8 Delete files

```http
DELETE /files
```

### Purpose

Deletes selected files from DynamoDB and attempts to delete their original, thumbnail, and frame objects from S3.

### Example request

```bash
curl -i -X DELETE "$BASE_URL/files" \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["e0a1ffc4-170e-473d-a730-4c4254e01124"]
  }'
```

### Request body

```json
{
  "files": ["file-id-1", "file-id-2"]
}
```

### Expected response

```json
{
  "deletedCount": 1,
  "failedCount": 0,
  "deletedFiles": [
    {
      "fileId": "e0a1ffc4-170e-473d-a730-4c4254e01124",
      "deletedOriginal": true,
      "deletedThumbnail": true,
      "deletedFrameCount": 0
    }
  ],
  "failedFiles": []
}
```

### Deletion behaviour

For each file ID, the Lambda:

```text
Reads META item
Deletes originalUrl S3 object if parseable
Deletes thumbnailUrl S3 object if parseable
Deletes video frame objects if present
Deletes SPECIES items for that file
Deletes META item
```

### Verification status

```text
Verified working on a dummy/test file.
```

---

## 3.9 Subscriptions

```http
GET /subscriptions
POST /subscriptions
DELETE /subscriptions
```

### Purpose

Allows users to manage tag-based email notification preferences.

### POST request

```bash
curl -i -X POST "$BASE_URL/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <cognito-jwt-token>" \
  -d '{
    "email": "user@example.com",
    "species": ["koala", "wombat"]
  }'
```

### Request body

```json
{
  "email": "user@example.com",
  "species": ["koala", "wombat"]
}
```

### Expected behaviour

```text
Reads authenticated Cognito user ID from JWT claims
Stores user subscription preference in EcoLensMain
Subscribes the email address to SNS topic
User confirms SNS subscription email
```

### Current status

```text
Implementation present.
Direct curl test without Cognito returns 401 because no authenticated user is available.
Final verification pending Cognito integration.
```

### Dependency

```text
Pending dependency from Cognito Implementation:
Cognito User Pool ID, App Client ID, JWT token format, and valid logged-in JWT token.
```

---

# 4. Current Verification Summary

| Feature                  | Endpoint                       | Status                                    |
| ------------------------ | ------------------------------ | ----------------------------------------- |
| Tag count search         | POST /search/tag-counts        | Verified                                  |
| Minimum count filtering  | POST /search/tag-counts        | Verified                                  |
| Species search           | POST /search/species           | Verified                                  |
| Thumbnail lookup         | GET /files/by-thumbnail        | Verified                                  |
| Global feed listing      | GET /files?scope=feed          | Verified                                  |
| Single file details      | GET /files/{fileId}            | Verified                                  |
| Search by uploaded image | POST /search/by-image          | Verified in detectedTags test mode        |
| Bulk tag add             | POST /tags/bulk                | Verified                                  |
| Bulk tag remove          | POST /tags/bulk                | Verified                                  |
| Delete files             | DELETE /files                  | Verified on dummy/test file               |
| Subscriptions            | GET/POST/DELETE /subscriptions | Implemented, pending Cognito verification |

---

# 5. Known Dependencies

## 5.1 Cognito dependency

```text
Cognito User Pool ID
Cognito App Client ID
Valid logged-in JWT token
Confirmed frontend Authorization header format
```

Needed for:

```text
Final API Gateway authorisation
GET /files?scope=my
GET /subscriptions
POST /subscriptions
DELETE /subscriptions
```

## 5.2 GCP ML dependency

```text
/ecolens/gcp/inferUrl
/ecolens/gcp/sharedSecret
```

Needed for:

```text
POST /search/by-image with real uploaded image
```

## 5.3 Pipeline/database write dependency

```text
Must write META and SPECIES records exactly according to EcoLens-Architecture-Contract.md.
```

Required DynamoDB item types:

```text
PK = FILE#{fileId}
SK = META

PK = FILE#{fileId}
SK = SPECIES#{species}
GSI1PK = SPECIES#{species}
GSI1SK = FILE#{fileId}
```

Needed for:

```text
Search APIs
Thumbnail lookup
Feed listing
Delete API
Bulk tag edit
```

---

# 6. Notes for Frontend Integration

Should use the deployed API base URL and call the routes listed above.

For final integration, every request should include:

```http
Authorization: Bearer <cognito-jwt-token>
Content-Type: application/json
```

For image and thumbnail display, the frontend should use:

```text
thumbnailUrl for previews
originalUrl when the user clicks or opens the full-size file
```

For query UI, frontend should support:

```text
Search by species
Search by tag counts
Search by uploaded image
Thumbnail click-to-full-size
Bulk tag add/remove
Delete selected files
Subscription preferences
```
