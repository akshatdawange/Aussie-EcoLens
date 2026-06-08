# EcoLens ML Inference (Member C — ML & GCP)

Wildlife species detection running on **Google Cloud Run** (the project's second cloud).
Given an image, it returns species counts using a two-stage pipeline:

1. **MegaDetector** (`mdv5a.pt`) — detects where animals are (bounding boxes).
2. **SpeciesNet / WildObs** (`model.pt`, exported via onnx2torch) — classifies each
   cropped animal into one of 45 Australian species.

## Endpoints
- `GET /health` — liveness (no auth). Returns model-loaded status + active model version.
- `POST /infer` — multipart `file=<image>`, requires a Cognito JWT (`Authorization: Bearer <token>`).
  Returns `{"counts": {"<species>": <int>}, "model_version": "<v>"}`.

## Layout
- `inference/` — the production service (`main.py`, `Dockerfile`, `requirements.txt`, `labels.txt`).
- `hello/` — Phase 0 hello-world Cloud Run service.
- `deploy.sh` — build + deploy script (see below).

## Configuration (env vars, no code changes needed)
| Var | Purpose |
|-----|---------|
| `GCS_BUCKET` | Bucket holding the models |
| `MODEL_VERSION` | Which model folder to load (`v1`, `v2`, …) — **the model-swap mechanism** |
| `DETECT_CONF` / `CLASSIFY_CONF` | Detection / classification confidence thresholds |
| `COGNITO_REGION` / `COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID` | JWT verification |
| `AUTH_DISABLED` | `true` only for pre-Cognito testing; **must be `false` for submission** |

## Deploy
```bash
# normal redeploy
./deploy.sh
# rebuild image first
./deploy.sh --build
# enable real auth (values from Member A's Cognito)
export COGNITO_USER_POOL_ID=ap-... COGNITO_APP_CLIENT_ID=... AUTH_DISABLED=false
./deploy.sh
```

## Model swap (assignment 4.1)
Upload a new model to `gs://<bucket>/v2/`, then:
```bash
gcloud run services update ecolens-ml-inference --region australia-southeast1 \
  --update-env-vars MODEL_VERSION=v2
```
No rebuild, no code change.

## Integration
The Cloud Run URL is published to AWS SSM at `/ecolens/gcp/inferUrl` (region `ap-southeast-2`)
for Member B's orchestrator to read. Member B passes the end-user's Cognito JWT through to `/infer`.
