#!/usr/bin/env bash
#
# Deploy the EcoLens ML inference service to Cloud Run (Member C).
#
# Usage:
#   ./deploy.sh                 # deploy current image with current settings
#   ./deploy.sh --build         # rebuild the image first, then deploy
#
# To turn ON real Cognito auth (do this before submission), set the two values
# from Member A, then run this script:
#   export COGNITO_USER_POOL_ID=us-east-1_xxxxx
#   export COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
#   export AUTH_DISABLED=false
#   ./deploy.sh
#
set -euo pipefail

# ---- Config -----------------------------------------------------------------
PROJECT="ecolens-atharv"
REGION="australia-southeast1"
REPO="ecolens-images"
SERVICE="ecolens-ml-inference"
IMAGE_TAG="${IMAGE_TAG:-v7}"                     # bump when you rebuild
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/inference:${IMAGE_TAG}"

GCS_BUCKET="ecolens-models-ecolens-atharv"
MODEL_VERSION="${MODEL_VERSION:-v1}"             # model-swap: set to v2 to swap

# Auth: defaults keep auth OFF for pre-Cognito testing. Override the 3 env vars
# above to enable real JWT verification.
COGNITO_REGION="${COGNITO_REGION:-us-east-1}"
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
COGNITO_APP_CLIENT_ID="${COGNITO_APP_CLIENT_ID:-}"
AUTH_DISABLED="${AUTH_DISABLED:-true}"

# Inference tuning (adjustable without code changes)
DETECT_CONF="${DETECT_CONF:-0.2}"
CLASSIFY_CONF="${CLASSIFY_CONF:-0.3}"

# ---- Optional rebuild -------------------------------------------------------
if [[ "${1:-}" == "--build" ]]; then
  echo ">> Building ${IMAGE} via Cloud Build..."
  gcloud builds submit --tag "${IMAGE}" --timeout=2400 "$(dirname "$0")/inference"
fi

# ---- Deploy -----------------------------------------------------------------
ENV_VARS="GCS_BUCKET=${GCS_BUCKET}"
ENV_VARS+=",MODEL_VERSION=${MODEL_VERSION}"
ENV_VARS+=",COGNITO_REGION=${COGNITO_REGION}"
ENV_VARS+=",COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}"
ENV_VARS+=",COGNITO_APP_CLIENT_ID=${COGNITO_APP_CLIENT_ID}"
ENV_VARS+=",AUTH_DISABLED=${AUTH_DISABLED}"
ENV_VARS+=",DETECT_CONF=${DETECT_CONF}"
ENV_VARS+=",CLASSIFY_CONF=${CLASSIFY_CONF}"

echo ">> Deploying ${SERVICE} (image ${IMAGE_TAG}, model ${MODEL_VERSION}, auth_disabled=${AUTH_DISABLED})..."
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --memory 8Gi --cpu 4 --concurrency 4 --max-instances 5 --timeout 300 \
  --cpu-boost \
  --set-env-vars "${ENV_VARS}" \
  --allow-unauthenticated

URL=$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format="value(status.url)")
echo ">> Done. Service URL: ${URL}"
echo ">> Health: $(curl -s -m 120 "${URL}/health" || echo 'cold start, retry')"
