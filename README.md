# Aussie EcoLens

**A Multi-Cloud Serverless Wildlife Observation Platform**
FIT5225 2026 S1 - Assignment 2 (Monash University)

Aussie EcoLens lets users upload wildlife photos and videos, automatically tags
the species in each file using machine learning, and lets users search, manage,
and subscribe to those tags. It runs across **two cloud providers**: AWS hosts the
web app, authentication, storage, database, event orchestration, and
notifications; Google Cloud hosts the ML inference service.

|                      |                                                                     |
| -------------------- | ------------------------------------------------------------------- |
| **Live application** | https://d1inwbxwj0g7ya.cloudfront.net                               |
| **Clouds / regions** | AWS `ap-southeast-2` (Sydney) - GCP `australia-southeast1` (Sydney) |
| **Repository**       | github.com/akshatdawange/Aussie-EcoLens                             |

---

## Table of contents

- [Architecture overview](#architecture-overview)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [How it works](#how-it-works)
- [Design and implementation choices](#design-and-implementation-choices)
- [Running the frontend locally](#running-the-frontend-locally)
- [Deploying the frontend](#deploying-the-frontend)
- [User guide](#user-guide-testing-the-application)

---

## Architecture overview

Aussie EcoLens is a multi-cloud, serverless platform. The two clouds are bridged
securely using AWS Cognito identity tokens, a shared secret, and AWS SSM
Parameter Store for service discovery.

- **Authentication.** Users sign in through a React single-page app (hosted on
  S3 + CloudFront) backed by **AWS Cognito** (email, first name, last name,
  password; email verification; sign-out). Every page and API call requires a
  valid Cognito JWT, and unauthenticated users are redirected to sign in.

- **Upload and auto-tagging.** The frontend calls `POST /uploads/presign`
  (API Gateway -> Lambda), which computes a SHA-256 checksum and checks the
  `EcoLensHashes` DynamoDB table to prevent duplicate uploads, then returns a
  short-lived S3 presigned URL. The browser uploads directly to the
  `ecolens-originals` bucket. The resulting `ObjectCreated` event triggers two
  Lambdas in parallel: a **thumbnail Lambda** (OpenCV) that resizes the image
  preserving aspect ratio and writes to `ecolens-thumbnails`, and an
  **orchestrator Lambda** that performs ML tagging.

- **ML inference (secondary cloud).** The orchestrator sends the image to the
  **GCP Cloud Run** service (`/infer`), authenticating across clouds with a
  shared secret stored in SSM. Cloud Run runs a two-stage PyTorch pipeline -
  **MegaDetector** locates animals, then a fine-tuned **SpeciesNet** classifier
  identifies each into one of 45 Australian species - and returns species
  counts. For videos, a **frame-extract Lambda** (ffmpeg) samples 1 frame per
  second and sends each frame to the same endpoint. The orchestrator writes the
  file type, detected tags, counts, original URL, and thumbnail URL to the
  `EcoLensMain` DynamoDB table (single-table design with 4 GSIs), then publishes
  to **AWS SNS** so subscribed users receive filtered email notifications.

- **Querying.** API Gateway + query Lambdas serve all searches over
  `EcoLensMain`: tag-count search (logical AND with minimum counts), species
  search, thumbnail-URL to full-image reverse lookup, and search-by-uploaded-image
  (tags detected via Cloud Run, matched without storing the query file).
  Data-management endpoints provide bulk tag editing (operation `1`=add /
  `0`=remove) and owner-checked deletion that removes both the storage objects
  and the database rows.

---

## Key features

- Email/password sign-up with email verification and protected routes
- Drag-and-drop upload of images and video, with SHA-256 **deduplication**
- Automatic **species tagging** with per-species counts (45 Australian species)
- Automatic **thumbnail generation** and **video frame extraction** (1 fps)
- Community feed (observer posts) and a personal "My Uploads" view
- Search by **species tags** (AND + minimum count), by **thumbnail/image URL**,
  and by **uploaded photo**
- **Bulk tag editing** (add/remove) and owner-checked **deletion**
- **Species alert subscriptions** with filtered email notifications via SNS

---

## Tech stack

| Layer                       | Technology                                               |
| --------------------------- | -------------------------------------------------------- |
| Frontend                    | React (Create React App, JavaScript), React Router       |
| Auth                        | AWS Cognito (JWT), integrated via the AWS SDK in the SPA |
| Hosting                     | Amazon S3 (private) + CloudFront (Origin Access Control) |
| API                         | Amazon API Gateway (Bearer token)                        |
| Compute (AWS)               | AWS Lambda (Python)                                      |
| Storage                     | Amazon S3 (originals, thumbnails, frames)                |
| Database                    | Amazon DynamoDB (single table, 4 GSIs)                   |
| Notifications               | Amazon SNS (email)                                       |
| Service discovery / secrets | AWS SSM Parameter Store                                  |
| ML inference (GCP)          | Cloud Run (FastAPI), PyTorch - MegaDetector + SpeciesNet |
| Model hosting               | Google Cloud Storage (selected via `MODEL_VERSION`)      |
| Infrastructure as code      | AWS SAM (`infra/*.yaml`)                                 |

---

## Repository structure

```
Aussie-EcoLens/
  frontend/              Member A - React SPA (pages, components, Cognito auth, API client)
    src/
      pages/             Home, Search, My Uploads, sign-in/up
      components/        UploadWidget, ImageModal, Navbar, ProtectedRoute, ...
      utils/api.js       API client (auth, upload, search, tags, subscriptions)
  services/
    pipeline/            Member B - upload pipeline Lambdas
      get_upload_url/    presigned URL + SHA-256 dedup
      orchestrator/      S3-event handler: calls ML, writes DynamoDB, publishes SNS
      thumbnail/         OpenCV thumbnail generator (container)
      frame_extract/     ffmpeg video frame extractor (container)
    ml/                  Member C - GCP Cloud Run ML inference service
      inference/         MegaDetector + SpeciesNet FastAPI app
      deploy.sh
    api/                 Member D - query / data-management Lambdas
      files.py  search_*.py  tags_bulk.py  delete_files.py  subscriptions.py
  infra/                 AWS SAM templates (api, data, notifications, pipeline, storage)
  openapi/ecolens.yaml   API contract
  docs/                  Architecture contract, API contract, DynamoDB design, test cases
```

---

## How it works

```
            (1) presign + dedup
Browser  ------------------------->  API Gateway -> get_upload_url Lambda
   |                                            |
   | (2) PUT file (presigned URL)               +-- checks EcoLensHashes (SHA-256)
   v
S3: ecolens-originals
   |
   | (3) ObjectCreated event (parallel)
   +-------------------------------+----------------------------+
   v                               v                            v
thumbnail Lambda (OpenCV)     orchestrator Lambda         frame_extract Lambda
   |                               |  (4) POST /infer           |  (video, 1 fps)
   v                               v   + shared secret          v
S3: ecolens-thumbnails        GCP Cloud Run -----------> per-frame inference
                                   |  MegaDetector + SpeciesNet
                                   | (5) write tags + counts
                                   v
                              DynamoDB: EcoLensMain
                                   |
                                   | (6) publish matching species
                                   v
                              SNS -> email subscribers

Search / manage:  Browser -> API Gateway -> query Lambdas -> EcoLensMain
```

---

## Design and implementation choices

- **Why two clouds.** AWS Cognito is mandated for authentication, and AWS's
  event-driven serverless (S3 -> Lambda) cleanly models the upload pipeline. The
  ML model is a ~470 MB PyTorch stack that exceeds AWS Lambda's size limits, so
  GCP Cloud Run was chosen for inference - it runs full container images with
  more memory and longer request times.

- **Secure cross-cloud authorisation.** The automatic S3-event path has no
  end-user token, so the orchestrator authenticates to Cloud Run with an
  `X-EcoLens-Secret` shared secret (an SSM SecureString). User-initiated
  search-by-image instead forwards the real Cognito JWT, which Cloud Run verifies
  against Cognito's JWKS public keys - satisfying the requirement to securely
  pass Cognito tokens to the secondary cloud.

- **Model-handling flexibility.** Model files live in Google Cloud Storage and
  are selected by a `MODEL_VERSION` environment variable. A newer model is
  deployed by uploading it and changing one variable - no source-code change or
  rebuild.

- **Least-privilege access.** Each Lambda uses a scoped IAM role limited to the
  exact bucket/table/action it needs; cross-cloud calls use scoped
  tokens/secrets rather than broad credentials.

- **Cost control.** DynamoDB on-demand billing, a 7-day lifecycle rule on the
  frames bucket, and Cloud Run scaling to zero when idle keep running costs near
  zero.

---

## Running the frontend locally

Requirements: Node.js 18+ and npm.

```bash
cd frontend
npm install
# create a .env from the template and fill in your values (see .env.example)
cp .env.example .env
npm start          # runs on http://localhost:3000
```

The frontend talks to the deployed AWS API Gateway and Cognito user pool; the
relevant endpoints and IDs are configured via the `.env` file (which is
gitignored - never commit real credentials).

---

## Deploying the frontend

```bash
cd frontend
npm run build
aws s3 sync build/ s3://<web-bucket>/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

Wait 1-2 minutes for the CloudFront invalidation, then visit the CloudFront URL.

---

## User guide (testing the application)

1. **Create an account and sign in.** On the landing page choose _Create
   account_, enter your first name, last name, email, and a password. Enter the
   verification code emailed by Cognito, then sign in. You land on the Home
   dashboard.
2. **Upload media** (Home -> _Upload media_). Drag an image or video onto the
   dropzone (or click to browse). After a moment the row shows the detected
   species and counts. Re-uploading the same file is flagged _Duplicate_ and
   shows the existing copy instead of re-storing it.
3. **Browse recent uploads** (Home -> _Recent uploads_). Toggle _Observer posts_
   (everyone) vs _Your posts_. Click a card to view full size; click `+N` to
   reveal all detected species.
4. **Search** (Search page). _By Species Tags_: type a species, set a minimum
   count, click Add; add more tags for an AND query, then Search. _By
   Thumbnail/Image URL_: paste any image URL from a result. _By Uploaded Photo_:
   choose an image; matching files are returned (the query image is not stored).
5. **Manage your files** (My Uploads). Select files, then _Add tags_ /
   _Remove tags_, or _Delete selected_ (removes storage objects and database
   rows).
6. **Species alerts** (Home -> _Species alerts_, top-right). Type a species and
   click Add. The first time, AWS SNS emails a _Subscription Confirmation_ -
   open it and click _Confirm subscription_ (check Spam). After that, new files
   tagged with that species trigger an email.
7. **Sign out** (top-right) to end your session.

---
